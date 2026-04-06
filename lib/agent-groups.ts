// Agent Groups: lightweight multi-agent orchestration
// Replaces the heavy 6-step Chain Discussion for simple/medium tasks.
// User describes task → system picks 2-4 agents → parallel execution → merged output.

import type { ChainAgent, AIProvider } from './types';
import { detectProvider, isFreeFriendlyModel, DEFAULT_PROVIDER_MODEL } from './types';

// ─── Agent Role Templates ────────────────────────────────
export interface AgentRole {
  id: string;
  name: string;
  icon: string;
  color: string;
  systemPrompt: string;
  keywords: string[];  // task keywords that trigger this role
}

export const AGENT_ROLE_TEMPLATES: AgentRole[] = [
  {
    id: 'coder',
    name: '工程师',
    icon: '🛠️',
    color: '#8bb8ff',
    systemPrompt: '你是一位资深全栈工程师。输出高质量、可运行的代码，附带简要注释。优先考虑性能和安全。',
    keywords: ['代码', '实现', '开发', '编程', 'code', 'implement', 'build', 'api', 'bug', 'fix', '函数', '组件', 'component'],
  },
  {
    id: 'analyst',
    name: '分析师',
    icon: '🔍',
    color: '#56e2d4',
    systemPrompt: '你是一位严谨的分析师。从多角度分析问题，列出优缺点、风险和建议。用结构化格式输出。',
    keywords: ['分析', '对比', '评估', '选型', 'analyze', 'compare', 'evaluate', '优缺点', '方案', 'pros', 'cons'],
  },
  {
    id: 'writer',
    name: '写作专家',
    icon: '📝',
    color: '#ffbe72',
    systemPrompt: '你是一位专业写作专家。输出清晰、结构化、易读的中文内容。善于总结和提炼。',
    keywords: ['写', '文档', '说明', '总结', 'write', 'document', 'explain', 'summary', '报告', '文章'],
  },
  {
    id: 'reasoner',
    name: '推理专家',
    icon: '🧠',
    color: '#c9d4ff',
    systemPrompt: '你是一位逻辑推理专家。用严密的逻辑链条分析问题，指出隐含假设和潜在漏洞。',
    keywords: ['推理', '逻辑', '证明', '为什么', 'reason', 'logic', 'why', 'proof', '因果', '矛盾'],
  },
  {
    id: 'creative',
    name: '创意顾问',
    icon: '💡',
    color: '#f58aa8',
    systemPrompt: '你是一位创意顾问。提供新颖的视角和创造性的解决方案，不拘泥于常规思路。',
    keywords: ['创意', '设计', '想法', '灵感', 'creative', 'design', 'idea', 'brainstorm', 'ux', 'ui'],
  },
  {
    id: 'reviewer',
    name: '审核员',
    icon: '✅',
    color: '#7ce6a7',
    systemPrompt: '你是一位质量审核员。检查其他人的输出，找出错误、遗漏和改进空间。给出具体修改建议。',
    keywords: ['审核', '检查', '验证', 'review', 'check', 'verify', 'test', '质量'],
  },
];

// ─── Task Analysis ───────────────────────────────────────
export interface TaskAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  selectedRoles: string[];  // role IDs
  reasoning: string;
}

/**
 * Analyze a task description and select appropriate agent roles.
 * This is a fast local heuristic — no LLM call needed.
 */
export function analyzeTask(taskDescription: string): TaskAnalysis {
  const lower = taskDescription.toLowerCase();
  const scores: Record<string, number> = {};

  for (const role of AGENT_ROLE_TEMPLATES) {
    let score = 0;
    for (const kw of role.keywords) {
      if (lower.includes(kw)) score += 1;
    }
    if (score > 0) scores[role.id] = score;
  }

  // Sort by score descending
  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  // Determine complexity
  const wordCount = taskDescription.length;
  const matchedRoles = ranked.length;
  let complexity: TaskAnalysis['complexity'] = 'simple';
  if (wordCount > 200 || matchedRoles >= 3) complexity = 'complex';
  else if (wordCount > 80 || matchedRoles >= 2) complexity = 'medium';

  // Select roles based on complexity
  let selectedRoles: string[];
  if (ranked.length === 0) {
    // Default: analyst + writer for unknown tasks
    selectedRoles = ['analyst', 'writer'];
  } else if (complexity === 'simple') {
    selectedRoles = ranked.slice(0, 1);
  } else if (complexity === 'medium') {
    selectedRoles = ranked.slice(0, 2);
  } else {
    selectedRoles = ranked.slice(0, 3);
    // Always add reviewer for complex tasks
    if (!selectedRoles.includes('reviewer')) {
      selectedRoles.push('reviewer');
    }
  }

  return {
    complexity,
    selectedRoles,
    reasoning: `Complexity: ${complexity}, matched ${matchedRoles} roles from keywords`,
  };
}

// ─── Agent Group Builder ─────────────────────────────────
export interface AgentGroup {
  id: string;
  name: string;
  description: string;
  agents: ChainAgent[];
  strategy: 'parallel' | 'sequential' | 'parallel-then-merge';
}

/**
 * Build an agent group from selected roles and available models.
 */
export function buildAgentGroup(
  roleIds: string[],
  availableModels: string[],
  preferredModel?: string,
): AgentGroup {
  const getModel = (strong: boolean): string => {
    if (preferredModel && availableModels.includes(preferredModel)) return preferredModel;
    if (strong) {
      const m = availableModels.find((m) => !isFreeFriendlyModel(m));
      if (m) return m;
    }
    return availableModels[0] || DEFAULT_PROVIDER_MODEL.claude;
  };

  const agents: ChainAgent[] = roleIds.map((roleId) => {
    const template = AGENT_ROLE_TEMPLATES.find((r) => r.id === roleId);
    if (!template) throw new Error(`Unknown role: ${roleId}`);

    const isStrong = ['coder', 'reasoner'].includes(roleId);
    const model = getModel(isStrong);

    return {
      id: `ag_${roleId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: template.name,
      role: template.systemPrompt,
      task: '',
      provider: detectProvider(model),
      model,
      temperature: 0.6,
      maxTokens: 4096,
      color: template.color,
      icon: template.icon,
      tools: [],
      sandboxMode: 'safe' as const,
      autoCompress: true,
      workflowRole: roleId,
    };
  });

  const strategy = roleIds.length <= 2 ? 'parallel' : 'parallel-then-merge';

  return {
    id: `group_${Date.now()}`,
    name: agents.map((a) => a.name).join(' + '),
    description: `${agents.length} agents working ${strategy}`,
    agents,
    strategy,
  };
}

// ─── Merge Prompt Builder ────────────────────────────────
/**
 * Build a prompt for the merge step that combines all agent outputs.
 */
export function buildMergePrompt(
  taskDescription: string,
  agentOutputs: { agentName: string; role: string; output: string }[]
): string {
  const outputsText = agentOutputs
    .map((o, i) => `### ${o.agentName}（${o.role}）\n${o.output}`)
    .join('\n\n---\n\n');

  return `你是一位整合专家。以下是多位 AI 专家针对同一任务的独立输出，请整合为一份高质量的最终回答。

## 原始任务
${taskDescription}

## 各专家输出
${outputsText}

## 整合要求
1. 取各家之长，去除重复内容
2. 如有矛盾观点，指出分歧并给出你的判断
3. 保持结构清晰，用中文输出
4. 如果包含代码，确保代码完整可运行`;
}

// ─── Quick Agent Group from Description ──────────────────
/**
 * One-shot: analyze task → build group → return ready-to-execute group.
 */
export function quickBuildGroup(
  taskDescription: string,
  availableModels: string[],
  preferredModel?: string,
): { analysis: TaskAnalysis; group: AgentGroup } {
  const analysis = analyzeTask(taskDescription);
  const group = buildAgentGroup(analysis.selectedRoles, availableModels, preferredModel);
  return { analysis, group };
}

// ─── Agent Builder ───────────────────────────────────────
// Parse a natural language description into a custom ChainAgent config.

export interface AgentBlueprint {
  name: string;
  role: string;
  systemPrompt: string;
  icon: string;
  color: string;
  suggestedModel: 'strong' | 'fast';
  tools: string[];
}

const ICON_POOL = ['🤖', '🧠', '🛠️', '🔍', '📝', '💡', '✅', '📊', '🎯', '🔬', '📐', '🗂️'];
const COLOR_POOL = ['#ff7c5a', '#56e2d4', '#ffbe72', '#8bb8ff', '#7ce6a7', '#f58aa8', '#c9d4ff', '#ffd580'];

/**
 * Parse a one-line description into an AgentBlueprint.
 * Examples:
 *   "一个专门写 Python 的工程师" → coder agent with Python focus
 *   "帮我审核代码质量的专家" → reviewer agent
 *   "A creative copywriter for marketing" → writer agent
 */
export function parseAgentDescription(description: string): AgentBlueprint {
  const lower = description.toLowerCase();

  // Detect intent from keywords
  const isCode = /代码|编程|工程|开发|code|engineer|develop|python|java|go|rust|typescript/i.test(lower);
  const isReview = /审核|检查|review|check|质量|qa|test/i.test(lower);
  const isWrite = /写|文档|文章|翻译|write|document|translate|copy/i.test(lower);
  const isAnalyze = /分析|研究|调研|analyze|research|data/i.test(lower);
  const isCreative = /创意|设计|brainstorm|creative|design|ux|ui/i.test(lower);
  const isReason = /推理|逻辑|数学|reason|logic|math|proof/i.test(lower);

  let name = '自定义助手';
  let basePrompt = '你是一位专业的 AI 助手。';
  let icon = ICON_POOL[0];
  let suggestedModel: AgentBlueprint['suggestedModel'] = 'fast';
  let tools: string[] = [];

  if (isCode) {
    name = '代码专家';
    basePrompt = '你是一位资深软件工程师。输出高质量、可运行的代码，附带简要注释。';
    icon = '🛠️';
    suggestedModel = 'strong';
    tools = ['code_exec'];
  } else if (isReview) {
    name = '审核专家';
    basePrompt = '你是一位严格的质量审核员。仔细检查输入内容，找出错误、遗漏和改进空间。';
    icon = '✅';
    suggestedModel = 'strong';
  } else if (isAnalyze) {
    name = '分析师';
    basePrompt = '你是一位数据分析师。从多角度分析问题，用结构化格式输出结论和建议。';
    icon = '🔍';
    suggestedModel = 'strong';
    tools = ['web_search'];
  } else if (isReason) {
    name = '推理专家';
    basePrompt = '你是一位逻辑推理专家。用严密的逻辑链条分析问题，指出隐含假设。';
    icon = '🧠';
    suggestedModel = 'strong';
  } else if (isCreative) {
    name = '创意顾问';
    basePrompt = '你是一位创意顾问。提供新颖的视角和创造性的解决方案。';
    icon = '💡';
    suggestedModel = 'fast';
  } else if (isWrite) {
    name = '写作专家';
    basePrompt = '你是一位专业写作专家。输出清晰、结构化、易读的内容。';
    icon = '📝';
    suggestedModel = 'fast';
  }

  // Append user's specific description to the system prompt
  const systemPrompt = `${basePrompt}\n\n用户对你的定位：${description}`;
  const colorIdx = Math.abs(hashCode(description)) % COLOR_POOL.length;

  return {
    name,
    role: description,
    systemPrompt,
    icon,
    color: COLOR_POOL[colorIdx],
    suggestedModel,
    tools,
  };
}

/**
 * Convert a blueprint into a ready-to-use ChainAgent.
 */
export function blueprintToAgent(
  blueprint: AgentBlueprint,
  availableModels: string[],
  preferredModel?: string,
): ChainAgent {
  const getModel = (strong: boolean): string => {
    if (preferredModel && availableModels.includes(preferredModel)) return preferredModel;
    if (strong) {
      const m = availableModels.find((m) => !isFreeFriendlyModel(m));
      if (m) return m;
    }
    return availableModels[0] || DEFAULT_PROVIDER_MODEL.claude;
  };

  const model = getModel(blueprint.suggestedModel === 'strong');

  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: blueprint.name,
    role: blueprint.systemPrompt,
    task: '',
    provider: detectProvider(model),
    model,
    temperature: 0.6,
    maxTokens: 4096,
    color: blueprint.color,
    icon: blueprint.icon,
    tools: blueprint.tools as any[],
    sandboxMode: 'safe',
    autoCompress: true,
    workflowRole: 'custom',
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

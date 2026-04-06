// Agent configuration system inspired by CrewAI
// Supports declarative agent definitions with goal/backstory pattern

import type { AIProvider } from './types';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  color: string;
  icon: string;
  isBuiltin: boolean;
  outputSchema?: {
    type: string;
    fields: { name: string; type: string; required: boolean }[];
  };
}

export interface WorkflowStage {
  id: string;
  name: string;
  agentRole: string;
  dependsOn: string[];
  canParallelize: boolean;
  humanApproval: boolean;
  maxRetries: number;
  timeout: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  executionMode: 'sequential' | 'parallel' | 'hierarchical';
  stages: WorkflowStage[];
  edges?: WorkflowEdge[];
  isBuiltin: boolean;
}

export function getBuiltinAgents(): AgentConfig[] {
  return [
    {
      id: 'customer_service', name: '客服接待', role: 'customer_service',
      goal: '理解用户需求，提炼核心问题，收集必要上下文',
      backstory: '你是一位经验丰富的技术客服，擅长从模糊的描述中提炼出精确的技术需求。你总是耐心倾听，善于追问关键细节。',
      provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.6, maxTokens: 2048,
      tools: [], color: '#10b981', icon: '🎧', isBuiltin: true,
    },
    {
      id: 'solution_expert', name: '方案专家', role: 'solution_expert',
      goal: '基于需求生成2-3个可行方案，分析各方案的优劣和适用场景',
      backstory: '你是一位资深架构师，见过无数项目的成功与失败。你擅长从多个角度思考问题，给出有深度的方案对比。',
      provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.7, maxTokens: 4096,
      tools: ['web_search'], color: '#6366f1', icon: '🧠', isBuiltin: true,
    },
    {
      id: 'director', name: '项目总监', role: 'director',
      goal: '将选定方案拆解为具体任务，分配给最合适的专家执行',
      backstory: '你是一位技术项目总监，擅长任务分解和资源调配。你了解每位团队成员的专长，总能做出最优分配。',
      provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.5, maxTokens: 2048,
      tools: [], color: '#f59e0b', icon: '👔', isBuiltin: true,
    },
    {
      id: 'code_specialist', name: '代码专家', role: 'code_specialist',
      goal: '编写高质量、可维护的生产级代码，包含错误处理和测试',
      backstory: '你是一位全栈开发专家，精通多种编程语言和框架。你写的代码简洁、高效、有完善的注释和错误处理。',
      provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.3, maxTokens: 8192,
      tools: ['code_exec', 'file_read'], color: '#3b82f6', icon: '💻', isBuiltin: true,
    },
    {
      id: 'reasoning_specialist', name: '推理专家', role: 'reasoning_specialist',
      goal: '对复杂问题进行深度推理分析，找出潜在风险和优化空间',
      backstory: '你是一位逻辑推理专家，擅长系统性思考和因果分析。你总能发现别人忽略的边界情况和潜在问题。',
      provider: 'openai', model: 'o3', temperature: 0.4, maxTokens: 4096,
      tools: ['calculator'], color: '#8b5cf6', icon: '🔬', isBuiltin: true,
    },
    {
      id: 'explanation_specialist', name: '解说专家', role: 'explanation_specialist',
      goal: '将复杂技术概念转化为清晰易懂的解释，配合示例和类比',
      backstory: '你是一位技术教育专家，擅长用简单的语言解释复杂的概念。你总能找到恰当的类比和示例。',
      provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.7, maxTokens: 4096,
      tools: [], color: '#ec4899', icon: '📖', isBuiltin: true,
    },
    {
      id: 'verifier', name: '验证专家', role: 'verifier',
      goal: '交叉验证其他专家的输出，检查一致性、正确性和完整性',
      backstory: '你是一位严谨的质量审查专家，对细节有极高的敏感度。你的工作是找出错误和不一致之处。',
      provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.2, maxTokens: 4096,
      tools: ['code_exec'], color: '#ef4444', icon: '✅', isBuiltin: true,
    },
    {
      id: 'reporter', name: '报告撰写', role: 'reporter',
      goal: '将所有专家的工作成果整合为结构化的最终交付报告',
      backstory: '你是一位技术文档专家，擅长将零散的信息整合为逻辑清晰、结构完整的报告。',
      provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.5, maxTokens: 4096,
      tools: [], color: '#14b8a6', icon: '📋', isBuiltin: true,
    },
    {
      id: 'researcher', name: '研究员', role: 'researcher',
      goal: '并行搜索多个信息源，汇总研究结果，提供有据可查的分析',
      backstory: '你是一位高效的研究员，擅长快速定位关键信息并交叉验证。你总是注明信息来源。',
      provider: 'openai', model: 'gpt-4o', temperature: 0.5, maxTokens: 4096,
      tools: ['web_search'], color: '#0ea5e9', icon: '🔍', isBuiltin: true,
    },
    {
      id: 'translator', name: '翻译专家', role: 'translator',
      goal: '提供准确、自然的多语言翻译，保持技术术语的精确性',
      backstory: '你是一位精通中英日多语言的技术翻译专家，了解各语言的技术社区惯用表达。',
      provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.3, maxTokens: 4096,
      tools: [], color: '#a855f7', icon: '🌐', isBuiltin: true,
    },
    {
      id: 'critic', name: '批评家', role: 'critic',
      goal: '从对立角度审视方案，找出弱点、盲点和潜在失败模式',
      backstory: '你是一位建设性的批评家，擅长魔鬼代言人角色。你的批评总是具体、可操作的。',
      provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.6, maxTokens: 2048,
      tools: [], color: '#f97316', icon: '⚡', isBuiltin: true,
    },
    {
      id: 'synthesizer', name: '综合专家', role: 'synthesizer',
      goal: '将多个来源的信息和观点综合为统一、连贯的结论',
      backstory: '你擅长在看似矛盾的观点中找到共识，将碎片化的信息编织成完整的叙事。',
      provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.5, maxTokens: 4096,
      tools: [], color: '#84cc16', icon: '🔗', isBuiltin: true,
    },
  ];
}

export function getBuiltinWorkflows(): WorkflowConfig[] {
  return [
    {
      id: 'guided-collaboration',
      name: '引导式协作',
      description: '经典7阶段工作流：需求收集→方案设计→专家评审→任务分配→团队执行→交叉验证→报告交付',
      executionMode: 'sequential',
      isBuiltin: true,
      stages: [
        { id: 'intake', name: '需求收集', agentRole: 'customer_service', dependsOn: [], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 60 },
        { id: 'planning', name: '方案设计', agentRole: 'solution_expert', dependsOn: ['intake'], canParallelize: false, humanApproval: true, maxRetries: 2, timeout: 120 },
        { id: 'review', name: '专家评审', agentRole: 'critic', dependsOn: ['planning'], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 90 },
        { id: 'assignment', name: '任务分配', agentRole: 'director', dependsOn: ['review'], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 60 },
        { id: 'execution', name: '团队执行', agentRole: 'code_specialist', dependsOn: ['assignment'], canParallelize: true, humanApproval: false, maxRetries: 2, timeout: 180 },
        { id: 'verification', name: '交叉验证', agentRole: 'verifier', dependsOn: ['execution'], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 90 },
        { id: 'report', name: '报告交付', agentRole: 'reporter', dependsOn: ['verification'], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 60 },
      ],
    },
    {
      id: 'parallel-research',
      name: '并行研究',
      description: '多路并发研究模式：分解问题→并行调研→综合结论',
      executionMode: 'parallel',
      isBuiltin: true,
      stages: [
        { id: 'decompose', name: '问题分解', agentRole: 'director', dependsOn: [], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 60 },
        { id: 'research_1', name: '研究路线A', agentRole: 'researcher', dependsOn: ['decompose'], canParallelize: true, humanApproval: false, maxRetries: 2, timeout: 120 },
        { id: 'research_2', name: '研究路线B', agentRole: 'researcher', dependsOn: ['decompose'], canParallelize: true, humanApproval: false, maxRetries: 2, timeout: 120 },
        { id: 'research_3', name: '研究路线C', agentRole: 'researcher', dependsOn: ['decompose'], canParallelize: true, humanApproval: false, maxRetries: 2, timeout: 120 },
        { id: 'synthesize', name: '综合结论', agentRole: 'synthesizer', dependsOn: ['research_1', 'research_2', 'research_3'], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 90 },
      ],
    },
    {
      id: 'code-review',
      name: '代码审查',
      description: '自动化代码审查：代码分析→安全检查→性能评估→改进建议',
      executionMode: 'sequential',
      isBuiltin: true,
      stages: [
        { id: 'analyze', name: '代码分析', agentRole: 'code_specialist', dependsOn: [], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 120 },
        { id: 'security', name: '安全检查', agentRole: 'verifier', dependsOn: ['analyze'], canParallelize: true, humanApproval: false, maxRetries: 1, timeout: 90 },
        { id: 'performance', name: '性能评估', agentRole: 'reasoning_specialist', dependsOn: ['analyze'], canParallelize: true, humanApproval: false, maxRetries: 1, timeout: 90 },
        { id: 'suggestions', name: '改进建议', agentRole: 'synthesizer', dependsOn: ['security', 'performance'], canParallelize: false, humanApproval: false, maxRetries: 1, timeout: 60 },
      ],
    },
  ];
}

export function buildSystemPrompt(agent: AgentConfig): string {
  let prompt = `你是${agent.name}。\n\n角色：${agent.role}\n目标：${agent.goal}\n\n背景：${agent.backstory}`;
  if (agent.tools.length > 0) {
    prompt += `\n\n可用工具：${agent.tools.join(', ')}`;
  }
  if (agent.outputSchema) {
    const fields = agent.outputSchema.fields.map(f => `  - ${f.name} (${f.type}${f.required ? ', 必填' : ''})`).join('\n');
    prompt += `\n\n输出格式要求（${agent.outputSchema.type}）：\n${fields}`;
  }
  return prompt;
}

export function validateWorkflow(
  workflow: WorkflowConfig,
  agents: AgentConfig[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const agentRoles = new Set(agents.map(a => a.role));
  const stageIds = new Set(workflow.stages.map(s => s.id));

  for (const stage of workflow.stages) {
    if (!agentRoles.has(stage.agentRole)) {
      errors.push(`Stage "${stage.name}" requires agent role "${stage.agentRole}" which is not available`);
    }
    for (const dep of stage.dependsOn) {
      if (!stageIds.has(dep)) {
        errors.push(`Stage "${stage.name}" depends on unknown stage "${dep}"`);
      }
    }
  }

  // Check for cycles
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const depsMap = new Map(workflow.stages.map(s => [s.id, s.dependsOn]));

  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of depsMap.get(id) || []) {
      if (hasCycle(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const stage of workflow.stages) {
    if (hasCycle(stage.id)) {
      errors.push('Workflow contains circular dependencies');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

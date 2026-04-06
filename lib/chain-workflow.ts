// Chain workflow 工具函数

import type {
  ChainAgent,
  ChainTurn,
  ChainDiscussion,
  ChainAdaptiveProfile,
  ChainTeamAssignment,
  ChainStageRatings,
  ChainPlanOption,
  AIProvider,
} from './types';
import { DEFAULT_PROVIDER_MODEL, MODEL_OPTIONS, detectProvider, isFreeFriendlyModel } from './types';

// ─── 模型收集 ─────────────────────────────────────────────
export function collectAvailableModels(
  providers: AIProvider[],
  keys?: Record<AIProvider, unknown>,
  discoveredModels?: Record<AIProvider, string[]>
): string[] {
  const result: string[] = [];
  for (const p of providers) {
    if (keys && !keys[p]) continue;
    const discovered = discoveredModels?.[p] || [];
    const defaults = MODEL_OPTIONS[p] || [];
    const merged = Array.from(new Set([...discovered, ...defaults]));
    result.push(...merged);
  }
  if (result.length === 0) {
    for (const p of providers) {
      result.push(...(MODEL_OPTIONS[p] || []));
    }
  }
  return Array.from(new Set(result));
}

// ─── 引导式工作流智能体构建 ───────────────────────────────
export function buildGuidedWorkflowAgents(
  availableModels: string[],
  preferredModel?: string
): ChainAgent[] {
  const getModel = (prefer?: string): string => {
    if (prefer && availableModels.includes(prefer)) return prefer;
    if (preferredModel && availableModels.includes(preferredModel)) return preferredModel;
    return availableModels[0] || DEFAULT_PROVIDER_MODEL.claude;
  };

  const strongModel = availableModels.find((m) => !isFreeFriendlyModel(m)) || getModel();
  const freeModel = availableModels.find((m) => isFreeFriendlyModel(m)) || getModel();

  const roles = [
    { workflowRole: 'customer_service', name: '客服接待', role: '专业客服，负责接收需求、追问关键信息、给出编号方案', model: freeModel },
    { workflowRole: 'solution_expert', name: '方案评审', role: '领域专家，负责补充边界条件、风险点和缺失前提', model: strongModel },
    { workflowRole: 'director', name: 'AI 总监', role: '项目总监，负责拆解任务并分配给各执行智能体', model: strongModel },
    { workflowRole: 'code_specialist', name: '工程实现', role: '资深工程师，负责代码实现和技术方案', model: strongModel },
    { workflowRole: 'reasoning_specialist', name: '逻辑推演', role: '逻辑专家，负责推理验证和逻辑链条', model: strongModel },
    { workflowRole: 'explanation_specialist', name: '中文说明', role: '技术写作专家，负责将结果转化为清晰的中文说明', model: freeModel },
    { workflowRole: 'verifier_a', name: '交叉验证 A', role: '质量审核员，负责从不同角度验证结果', model: freeModel },
    { workflowRole: 'reporter', name: '交付汇报', role: '汇报专员，负责整合所有结果并生成最终交付物', model: strongModel },
  ];

  const colors = ['#ff7c5a', '#56e2d4', '#ffbe72', '#8bb8ff', '#7ce6a7', '#f58aa8', '#c9d4ff', '#ffd580'];
  const icons = ['🤖', '🧠', '🎯', '🛠️', '🔍', '📝', '✅', '📊'];

  return roles.map((r, i) => ({
    id: `agent_${r.workflowRole}_${Date.now()}`,
    name: r.name,
    role: r.role,
    task: '',
    provider: detectProvider(r.model),
    model: r.model,
    temperature: 0.6,
    maxTokens: 4096,
    color: colors[i % colors.length],
    icon: icons[i % icons.length],
    tools: [],
    sandboxMode: 'safe' as const,
    autoCompress: true,
    workflowRole: r.workflowRole,
  }));
}

// ─── 执行分配构建 ─────────────────────────────────────────
export function buildExecutionAssignments(
  agents: ChainAgent[],
  planSummary: string
): ChainTeamAssignment[] {
  const executors = agents.filter((a) =>
    ['code_specialist', 'reasoning_specialist', 'explanation_specialist', 'verifier_a', 'verifier_b'].includes(a.workflowRole || '')
  );

  return executors.map((a) => ({
    agentId: a.id,
    agentName: a.name,
    model: a.model,
    workflowRole: a.workflowRole,
    focus: planSummary ? `基于方案：${planSummary.slice(0, 80)}` : a.role,
  }));
}

// ─── 分配列表格式化 ───────────────────────────────────────
export function formatAssignmentList(assignments: ChainTeamAssignment[]): string {
  return assignments
    .map((a, i) => `${i + 1}. ${a.agentName}（${a.model}）— ${a.focus}`)
    .join('\n');
}

// ─── 方案解析 ─────────────────────────────────────────────
export function parsePlanOptions(content: string): ChainPlanOption[] {
  const lines = content.split('\n');
  const options: ChainPlanOption[] = [];
  let currentIndex = -1;
  let currentTitle = '';
  let currentSummary = '';

  for (const line of lines) {
    const match = line.match(/^([1-3])[.、)]\s*(.+)/);
    if (match) {
      if (currentIndex >= 0) {
        options.push({ index: currentIndex, title: currentTitle, summary: currentSummary.trim() });
      }
      currentIndex = parseInt(match[1]) - 1;
      currentTitle = match[2].trim();
      currentSummary = '';
    } else if (currentIndex >= 0 && line.trim()) {
      currentSummary += line + '\n';
    }
  }
  if (currentIndex >= 0) {
    options.push({ index: currentIndex, title: currentTitle, summary: currentSummary.trim() });
  }
  return options.slice(0, 3);
}

export function parsePlanSelection(input: string, maxOptions: number): number | null {
  const trimmed = input.trim();
  const numMatch = trimmed.match(/^[1-3]/);
  if (numMatch) {
    const idx = parseInt(numMatch[0]) - 1;
    if (idx >= 0 && idx < maxOptions) {
      return idx;
    }
  }
  return null;
}

// ─── 评分解析 ─────────────────────────────────────────────
export function parseStageRatings(content: string): ChainStageRatings | null {
  const ratings: ChainStageRatings = {};
  const intakeMatch = content.match(/接待[：:]\s*([1-5])/);
  const reviewMatch = content.match(/评审[：:]\s*([1-5])/);
  const deliveryMatch = content.match(/交付[：:]\s*([1-5])/);
  const notesMatch = content.match(/备注[：:]\s*(.+)/);

  if (intakeMatch) ratings.intake = parseInt(intakeMatch[1]);
  if (reviewMatch) ratings.review = parseInt(reviewMatch[1]);
  if (deliveryMatch) ratings.delivery = parseInt(deliveryMatch[1]);
  if (notesMatch) ratings.notes = notesMatch[1].trim();

  if (ratings.intake || ratings.review || ratings.delivery) return ratings;
  return null;
}

// ─── 自适应阶段提示 ───────────────────────────────────────
export function buildAdaptiveStageHint(profile: ChainAdaptiveProfile, stage?: string): string {
  if (profile.count === 0) return '';
  const hints: string[] = [];
  if (stage === 'intake' && profile.intakeAvg > 0) hints.push(`接待平均评分 ${profile.intakeAvg.toFixed(1)}`);
  if (stage === 'review' && profile.reviewAvg > 0) hints.push(`评审平均评分 ${profile.reviewAvg.toFixed(1)}`);
  if (stage === 'delivery' && profile.deliveryAvg > 0) hints.push(`交付平均评分 ${profile.deliveryAvg.toFixed(1)}`);
  if (!stage) {
    if (profile.intakeAvg > 0) hints.push(`接待 ${profile.intakeAvg.toFixed(1)}`);
    if (profile.reviewAvg > 0) hints.push(`评审 ${profile.reviewAvg.toFixed(1)}`);
    if (profile.deliveryAvg > 0) hints.push(`交付 ${profile.deliveryAvg.toFixed(1)}`);
  }
  if (profile.notes.length > 0) hints.push(`用户反馈：${profile.notes.slice(-2).join('；')}`);
  return hints.length ? `\n\n历史表现参考（${profile.count} 次）：${hints.join('，')}` : '';
}

// ─── 自适应档案合并 ───────────────────────────────────────
export function mergeAdaptiveProfile(
  existing: ChainAdaptiveProfile,
  ratings: ChainStageRatings
): ChainAdaptiveProfile {
  const count = existing.count + 1;
  const avg = (prev: number, val: number | undefined) =>
    val !== undefined ? (prev * (count - 1) + val) / count : prev;

  return {
    count,
    intakeAvg: avg(existing.intakeAvg, ratings.intake),
    reviewAvg: avg(existing.reviewAvg, ratings.review),
    deliveryAvg: avg(existing.deliveryAvg, ratings.delivery),
    notes: ratings.notes
      ? [...existing.notes.slice(-4), ratings.notes]
      : existing.notes,
  };
}

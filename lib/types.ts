// Core type definitions for ChainMind.

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openai-compatible';
export type CoreAIProvider = 'claude' | 'openai' | 'gemini';
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';
export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'warning';

export interface AINodeData {
  label: string;
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
  effort: EffortLevel;
  temperature: number;
  maxTokens: number;
  status: NodeStatus;
  output: string;
  error: string;
  tokenCount: number;
  latencyMs: number;
  enableMetaPrompt: boolean;
}

export interface EncryptedPayload {
  data?: string;
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface ApiKeyEntry {
  provider: AIProvider;
  encrypted: EncryptedPayload;
}

export interface ProviderConfig {
  apiKey: EncryptedPayload | null;
  baseUrl: string;
}

export interface MemoryContext {
  l1: string;
  l2: string;
  l3: string;
}

export interface ExecutionResult {
  nodeId: string;
  output: string;
  tokenCount: number;
  latencyMs: number;
  error?: string;
}

export interface MessageAttachment {
  type: 'image' | 'file' | string;
  name?: string;
  mimeType: string;
  data: string;
  url?: string;
  size?: number;
}

export interface ChatRequestBody {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
  temperature: number;
  maxTokens: number;
  effort: EffortLevel;
  enableMetaPrompt?: boolean;
  images?: { data: string; mimeType: string }[];
  attachments?: MessageAttachment[];
}

export interface StreamChunk {
  type: 'text' | 'thinking' | 'error' | 'done';
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: AIProvider;
  model?: string;
  timestamp: number;
  tokenCount?: number;
  latencyMs?: number;
  error?: string;
  isStreaming?: boolean;
  thinking?: string;
  thinkingDurationMs?: number;
  parentMessageId?: string;
  siblingIds?: string[];
  attachments?: MessageAttachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
  folder?: string;
  createdAt: number;
  updatedAt: number;
}

export const MODEL_OPTIONS: Record<AIProvider, string[]> = {
  claude: [
    'claude-opus-4-6',
    'claude-opus-4-5-20251101',
    'claude-opus-4-5',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5',
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-haiku-4-5',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o1-preview',
    'o1-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'chatgpt-4o-latest',
    'kiro-deepseek-3-2',
    'kiro-minimax-m2-1',
  ],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['llama3.1', 'qwen2.5', 'mistral'],
  'openai-compatible': ['gpt-4o-mini', 'qwen-max', 'deepseek-chat'],
};

export const DEFAULT_PROVIDER_MODEL: Record<AIProvider, string> = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  ollama: 'llama3.1',
  'openai-compatible': 'gpt-4o-mini',
};

export const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  claude: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  'openai-compatible': 'http://localhost:8080/v1',
};

export interface ModelSpotlight {
  provider: AIProvider;
  model: string;
  label: string;
  fit: string;
  tier: 'free' | 'paid' | 'local';
}

export const MODEL_SPOTLIGHTS: ModelSpotlight[] = [
  { provider: 'claude', model: 'claude-opus-4-6', label: 'Claude Opus 4.6', fit: '复杂推理、架构评审和高风险交付', tier: 'paid' },
  { provider: 'claude', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', fit: '通用编码、分析和长上下文协作', tier: 'paid' },
  { provider: 'claude', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', fit: '快速客服、轻量总结和低成本验证', tier: 'paid' },
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o', fit: '通用对话、视觉输入和工具编排', tier: 'paid' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o mini', fit: '快速对话、低成本批处理和草稿生成', tier: 'free' },
  { provider: 'openai', model: 'o1-preview', label: 'OpenAI o1', fit: '强推理、数学和方案论证', tier: 'paid' },
  { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', fit: '高速响应、多模态输入和轻量任务', tier: 'free' },
  { provider: 'gemini', model: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', fit: '长上下文分析和资料处理', tier: 'paid' },
  { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek Chat', fit: '中文代码问答和通用低成本模型', tier: 'paid' },
  { provider: 'ollama', model: 'llama3.1', label: 'Ollama Local', fit: '本地离线推理和私有数据实验', tier: 'local' },
];

export const MODEL_STRENGTH: Record<string, { score: number; provider: AIProvider }> = {
  'claude-opus-4-6': { score: 102, provider: 'claude' },
  'claude-opus-4-5-20251101': { score: 101, provider: 'claude' },
  'claude-opus-4-5': { score: 101, provider: 'claude' },
  'claude-opus-4-20250514': { score: 100, provider: 'claude' },
  'claude-4-opus': { score: 100, provider: 'claude' },
  'claude-opus-4': { score: 100, provider: 'claude' },
  'claude-sonnet-4-6': { score: 97, provider: 'claude' },
  'claude-sonnet-4-5-20250929': { score: 96, provider: 'claude' },
  'claude-sonnet-4-5': { score: 96, provider: 'claude' },
  'claude-sonnet-4-20250514': { score: 95, provider: 'claude' },
  'claude-4-sonnet': { score: 95, provider: 'claude' },
  'claude-sonnet-4': { score: 95, provider: 'claude' },
  'claude-3-7-sonnet-20250219': { score: 91, provider: 'claude' },
  'claude-3.5-sonnet': { score: 90, provider: 'claude' },
  'claude-3-5-sonnet': { score: 90, provider: 'claude' },
  'claude-3-5-sonnet-20241022': { score: 90, provider: 'claude' },
  'claude-3-5-sonnet-latest': { score: 90, provider: 'claude' },
  'claude-3-opus': { score: 88, provider: 'claude' },
  'claude-3-opus-20240229': { score: 88, provider: 'claude' },
  'claude-3-sonnet': { score: 75, provider: 'claude' },
  'claude-3-sonnet-20240229': { score: 75, provider: 'claude' },
  'claude-3.5-haiku': { score: 70, provider: 'claude' },
  'claude-3-5-haiku': { score: 70, provider: 'claude' },
  'claude-haiku-4-5': { score: 70, provider: 'claude' },
  'claude-3-haiku': { score: 60, provider: 'claude' },
  'claude-haiku-20241022': { score: 60, provider: 'claude' },
  'o1-preview': { score: 98, provider: 'openai' },
  o1: { score: 97, provider: 'openai' },
  'gpt-4o': { score: 92, provider: 'openai' },
  'chatgpt-4o-latest': { score: 92, provider: 'openai' },
  'gpt-4-turbo': { score: 85, provider: 'openai' },
  'gpt-4': { score: 82, provider: 'openai' },
  'o1-mini': { score: 78, provider: 'openai' },
  'gpt-4o-mini': { score: 72, provider: 'openai' },
  'gpt-3.5-turbo': { score: 55, provider: 'openai' },
  'deepseek-reasoner': { score: 84, provider: 'deepseek' },
  'deepseek-chat': { score: 76, provider: 'deepseek' },
  'gemini-1.5-pro': { score: 85, provider: 'gemini' },
  'gemini-2.0-flash': { score: 80, provider: 'gemini' },
  'gemini-1.5-flash': { score: 70, provider: 'gemini' },
};

export interface ModelTokenProfile {
  contextTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export function getModelTokenProfile(model: string): ModelTokenProfile {
  const lower = model.toLowerCase();
  if (lower.includes('gemini')) return { contextTokens: 1000000, maxInputTokens: 900000, maxOutputTokens: 8192 };
  if (lower.includes('claude')) return { contextTokens: 200000, maxInputTokens: 180000, maxOutputTokens: 8192 };
  if (lower.includes('o1')) return { contextTokens: 128000, maxInputTokens: 100000, maxOutputTokens: 32768 };
  if (lower.includes('gpt-4o')) return { contextTokens: 128000, maxInputTokens: 120000, maxOutputTokens: 16384 };
  if (lower.includes('deepseek')) return { contextTokens: 128000, maxInputTokens: 96000, maxOutputTokens: 8192 };
  return { contextTokens: 128000, maxInputTokens: 96000, maxOutputTokens: 8192 };
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function pickStrongestModel(models: string[]): { model: string; provider: AIProvider; score: number } | null {
  let best: { model: string; provider: AIProvider; score: number } | null = null;

  for (const model of models) {
    const lower = model.toLowerCase();
    const direct = MODEL_STRENGTH[lower] || MODEL_STRENGTH[model];
    if (direct && (!best || direct.score > best.score)) {
      best = { model, provider: direct.provider, score: direct.score };
      continue;
    }

    for (const [key, value] of Object.entries(MODEL_STRENGTH)) {
      if (lower.includes(key) || key.includes(lower)) {
        if (!best || value.score > best.score) {
          best = { model, provider: value.provider, score: value.score };
        }
      }
    }
  }

  if (!best && models.length > 0) {
    const model = models[0];
    best = { model, provider: detectProvider(model), score: 0 };
  }

  return best;
}

export function detectProvider(model: string): AIProvider {
  const lower = model.toLowerCase();
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('llama') || lower.includes('mistral') || lower.includes('ollama')) return 'ollama';
  return 'openai';
}

export function isFreeFriendlyModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('mini')
    || lower.includes('haiku')
    || lower.includes('flash')
    || lower.includes('free')
    || lower.includes('llama')
    || lower.includes('qwen');
}

export function describeModelFocus(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return '最高质量路线，适合复杂架构、深度评审和最终交付。';
  if (lower.includes('sonnet')) return '均衡路线，适合编码、分析和多轮协作。';
  if (lower.includes('haiku')) return '快速低成本路线，适合客服、摘要和轻量验证。';
  if (lower.includes('o1')) return '推理路线，适合数学、逻辑和方案论证。';
  if (lower.includes('4o')) return '通用多模态路线，适合对话、视觉和工具编排。';
  if (lower.includes('gemini')) return '长上下文和高速响应路线，适合资料处理。';
  if (lower.includes('deepseek')) return '中文代码和低成本推理路线。';
  if (lower.includes('llama') || lower.includes('mistral')) return '本地模型路线，适合私有数据实验。';
  return '通用模型路线，适合作为 OpenAI-compatible 中转入口。';
}

export function fuzzyMatchModel(parsed: string, available: string[]): string | null {
  if (!parsed || available.length === 0) return null;
  const lower = parsed.toLowerCase();
  if (available.includes(parsed)) return parsed;
  const exactLower = available.find((model) => model.toLowerCase() === lower);
  if (exactLower) return exactLower;

  const normalized = lower.replace(/\./g, '-');
  const normMatch = available.find((model) => model.toLowerCase() === normalized);
  if (normMatch) return normMatch;

  return available.find((model) => {
    const modelLower = model.toLowerCase();
    const modelNorm = modelLower.replace(/\./g, '-');
    return modelNorm.includes(normalized) || normalized.includes(modelNorm);
  }) || null;
}

export function groupModelsByProvider(models: string[]): Record<AIProvider, string[]> {
  const grouped: Record<AIProvider, string[]> = {
    claude: [],
    openai: [],
    gemini: [],
    deepseek: [],
    ollama: [],
    'openai-compatible': [],
  };

  for (const model of models) {
    const provider = detectProvider(model);
    grouped[provider].push(model);
    if (provider === 'openai' || provider === 'deepseek') {
      grouped['openai-compatible'].push(model);
    }
  }

  return grouped;
}

export const DEFAULT_NODE_DATA: AINodeData = {
  label: '新节点',
  provider: 'claude',
  model: DEFAULT_PROVIDER_MODEL.claude,
  systemPrompt: '你是一个有帮助的AI助手。',
  userPromptTemplate: '{{prev.output}}\n\n{{user.input}}',
  effort: 'medium',
  temperature: 0.7,
  maxTokens: 4096,
  status: 'idle',
  output: '',
  error: '',
  tokenCount: 0,
  latencyMs: 0,
  enableMetaPrompt: false,
};

export type AgentToolName = 'terminal' | 'readFile' | 'writeFile' | 'listDir' | 'search';

export interface AgentTool {
  name: AgentToolName;
  label: string;
  description: string;
  icon: string;
}

export const ALL_AGENT_TOOLS: AgentTool[] = [
  { name: 'terminal', label: '终端执行', description: '执行 shell 命令（npm, git, go, python 等）', icon: 'term' },
  { name: 'readFile', label: '读取文件', description: '读取指定路径的文件内容', icon: 'read' },
  { name: 'writeFile', label: '写入文件', description: '创建或修改文件', icon: 'write' },
  { name: 'listDir', label: '目录列表', description: '列出目录下的文件和子目录', icon: 'dir' },
  { name: 'search', label: '搜索文件', description: '在项目中搜索文件或内容', icon: 'search' },
];

export const ROLE_TOOL_PRESETS: Record<string, AgentToolName[]> = {
  '架构师': ['readFile', 'listDir', 'search'],
  '评审员': ['readFile', 'listDir', 'search', 'terminal'],
  '产品经理': ['readFile', 'listDir'],
  '前端工程师': ['terminal', 'readFile', 'writeFile', 'listDir', 'search'],
  '后端工程师': ['terminal', 'readFile', 'writeFile', 'listDir', 'search'],
  '总结者': ['readFile', 'listDir'],
};

export function buildToolPrompt(tools: AgentToolName[]): string {
  if (tools.length === 0) return '';
  const toolDescriptions = tools
    .map((name) => {
      const tool = ALL_AGENT_TOOLS.find((candidate) => candidate.name === name);
      return tool ? `- ${tool.label} (${tool.name}): ${tool.description}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return `\n\n## 可用工具\n你可以在回复中使用以下工具。使用时请用 \`\`\`tool:工具名\`\`\` 代码块格式：\n${toolDescriptions}\n\n### 工具调用格式示例\n\`\`\`tool:terminal\nnpm run build\n\`\`\`\n\n\`\`\`tool:readFile\n/path/to/file.ts\n\`\`\`\n\n\`\`\`tool:writeFile:/path/to/file.ts\n文件内容...\n\`\`\``;
}

export type ChainExecutionMode = 'sequential' | 'parallel';
export type ChainWorkflowStage =
  | 'intake'
  | 'waiting_plan_selection'
  | 'expert_review'
  | 'team_assignment'
  | 'team_execution'
  | 'report'
  | 'waiting_rating'
  | 'completed';

export interface ChainPendingAction {
  type: 'input' | 'approval' | 'rate_stages' | 'provide_info_or_select_plan';
  prompt: string;
  placeholder?: string;
}

export interface ChainStageRatings {
  intake?: number;
  review?: number;
  delivery?: number;
  notes?: string;
}

export interface ChainAdaptiveProfile {
  count: number;
  intakeAvg: number;
  reviewAvg: number;
  deliveryAvg: number;
  notes: string[];
}

export interface ChainPlanOption {
  index: number;
  title: string;
  summary: string;
}

export interface ChainTeamAssignment {
  agentId: string;
  agentName: string;
  model: string;
  workflowRole?: string;
  focus: string;
  reason?: string;
}

export interface ChainAgent {
  id: string;
  name: string;
  role: string;
  task: string;
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  color: string;
  icon: string;
  tools: AgentToolName[];
  sandboxMode?: 'safe' | 'restricted' | 'full' | 'project';
  autoCompress?: boolean;
  workflowRole?: string;
}

export interface ChainTurn {
  id: string;
  agentId: string;
  agentName: string;
  model: string;
  content: string;
  tokenCount: number;
  latencyMs: number;
  error?: string;
  isStreaming?: boolean;
  timestamp: number;
  role?: 'user' | 'assistant' | 'system';
  stage?: ChainWorkflowStage;
  ratings?: ChainStageRatings;
}

export interface ChainDiscussion {
  id: string;
  title: string;
  topic: string;
  agents: ChainAgent[];
  turns: ChainTurn[];
  rounds: number;
  totalRounds: number;
  currentRound: number;
  mode: ChainExecutionMode;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  workflow?: 'guided-collaboration' | string;
  stage?: ChainWorkflowStage;
  pendingAction?: ChainPendingAction | null;
  planOptions?: ChainPlanOption[];
  selectedPlanIndex?: number | null;
  selectedPlanSummary?: string;
  teamAssignments?: ChainTeamAssignment[];
  ratingHistory?: ChainStageRatings[];
  adaptiveProfile?: ChainAdaptiveProfile;
  createdAt: number;
  updatedAt: number;
}

export const AGENT_PRESETS: Omit<ChainAgent, 'id'>[] = [
  {
    name: '架构师',
    role: '你是一位资深软件架构师。你负责从系统设计、可扩展性、技术选型的角度分析问题。',
    task: '',
    provider: 'claude',
    model: 'claude-opus-4-6',
    temperature: 0.7,
    maxTokens: 4096,
    color: '#6366f1',
    icon: 'A',
    tools: ['readFile', 'listDir', 'search'],
    sandboxMode: 'safe',
    autoCompress: true,
  },
  {
    name: '评审员',
    role: '你是一位严格的质量评审专家。你负责审查方案中的潜在问题、安全隐患和性能瓶颈。',
    task: '',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    temperature: 0.5,
    maxTokens: 4096,
    color: '#f59e0b',
    icon: 'R',
    tools: ['readFile', 'listDir', 'search', 'terminal'],
    sandboxMode: 'safe',
    autoCompress: true,
  },
  {
    name: '总结者',
    role: '你是一位善于总结的协调者。你负责综合所有人的意见，提炼最终结论和行动计划。',
    task: '',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    temperature: 0.5,
    maxTokens: 4096,
    color: '#ec4899',
    icon: 'S',
    tools: ['readFile', 'listDir'],
    sandboxMode: 'safe',
    autoCompress: true,
  },
];

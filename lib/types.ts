// Core type definitions for AI Chain Discussion Platform

export type AIProvider = 'claude' | 'openai' | 'gemini';
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
  ciphertext: string; // base64
  iv: string;         // base64
  salt: string;       // base64
}

export interface ApiKeyEntry {
  provider: AIProvider;
  encrypted: EncryptedPayload;
}

export interface ProviderConfig {
  apiKey: EncryptedPayload | null;
  baseUrl: string; // custom base URL for proxy/relay APIs
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

export interface ChatRequestBody {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string; // custom base URL for proxy APIs
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  effort: EffortLevel;
  enableMetaPrompt: boolean;
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
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  provider: AIProvider;
  model: string;
  systemPrompt?: string; // custom system prompt set by /coder, /writer, etc.
  createdAt: number;
  updatedAt: number;
}

export const MODEL_OPTIONS: Record<AIProvider, string[]> = {
  claude: [
    // Opus 4.x 系列
    'claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-opus-4-5',
    // Sonnet 4.x 系列
    'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514',
    // 3.x 系列
    'claude-3-7-sonnet-20250219',
    // Haiku
    'claude-haiku-4-5',
  ],
  openai: [
    'gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini',
    'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
    'chatgpt-4o-latest',
    // 中转API特有模型
    'kiro-deepseek-3-2', 'kiro-minimax-m2-1',
  ],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
};

export const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  claude: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
};

// Model strength ranking — higher score = stronger model
// Used by QuickSetup to auto-select the best available model
export const MODEL_STRENGTH: Record<string, { score: number; provider: AIProvider }> = {
  // Claude family (strongest first)
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
  // OpenAI family
  'o1-preview': { score: 98, provider: 'openai' },
  'o1': { score: 97, provider: 'openai' },
  'gpt-4o': { score: 92, provider: 'openai' },
  'chatgpt-4o-latest': { score: 92, provider: 'openai' },
  'gpt-4-turbo': { score: 85, provider: 'openai' },
  'gpt-4': { score: 82, provider: 'openai' },
  'gpt-4o-mini': { score: 72, provider: 'openai' },
  'o1-mini': { score: 78, provider: 'openai' },
  'gpt-3.5-turbo': { score: 55, provider: 'openai' },
  // Gemini family
  'gemini-2.0-flash': { score: 80, provider: 'gemini' },
  'gemini-1.5-pro': { score: 85, provider: 'gemini' },
  'gemini-1.5-flash': { score: 70, provider: 'gemini' },
};

// Given a list of model names, pick the strongest one
export function pickStrongestModel(models: string[]): { model: string; provider: AIProvider; score: number } | null {
  let best: { model: string; provider: AIProvider; score: number } | null = null;

  for (const m of models) {
    const lower = m.toLowerCase();
    // Direct match
    const info = MODEL_STRENGTH[lower] || MODEL_STRENGTH[m];
    if (info && (!best || info.score > best.score)) {
      best = { model: m, provider: info.provider, score: info.score };
      continue;
    }
    // Fuzzy match: check if any known key is a substring
    for (const [key, val] of Object.entries(MODEL_STRENGTH)) {
      if (lower.includes(key) || key.includes(lower)) {
        if (!best || val.score > best.score) {
          best = { model: m, provider: val.provider, score: val.score };
        }
      }
    }
  }

  // If no match found, try to guess provider from name
  if (!best && models.length > 0) {
    const m = models[0];
    const lower = m.toLowerCase();
    const provider: AIProvider = lower.includes('claude') ? 'claude'
      : lower.includes('gemini') ? 'gemini'
      : 'openai';
    best = { model: m, provider, score: 0 };
  }

  return best;
}

// Detect provider from a model name string
export function detectProvider(model: string): AIProvider {
  const lower = model.toLowerCase();
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('gemini')) return 'gemini';
  return 'openai'; // default — most relays use OpenAI-compatible format
}

// Fuzzy-match a parsed model name against actual available models from relay
// Handles common mismatches: dots↔dashes (4.5 vs 4-5), missing dates, etc.
export function fuzzyMatchModel(parsed: string, available: string[]): string | null {
  if (!parsed || available.length === 0) return null;
  const lower = parsed.toLowerCase();
  // 1. Exact match
  if (available.includes(parsed)) return parsed;
  const exactLower = available.find(m => m.toLowerCase() === lower);
  if (exactLower) return exactLower;
  // 2. Normalize: replace dots with dashes (4.5 → 4-5)
  const normalized = lower.replace(/\./g, '-');
  const normMatch = available.find(m => m.toLowerCase() === normalized);
  if (normMatch) return normMatch;
  // 3. Substring match: find model that contains the normalized name or vice versa
  const subMatch = available.find(m => {
    const ml = m.toLowerCase();
    const mn = ml.replace(/\./g, '-');
    return mn.includes(normalized) || normalized.includes(mn);
  });
  if (subMatch) return subMatch;
  // 4. No match
  return null;
}

export const DEFAULT_NODE_DATA: AINodeData = {
  label: '新节点',
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
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

// ===== Agent Tool Definitions =====

export type AgentToolName = 'terminal' | 'readFile' | 'writeFile' | 'listDir' | 'search';

export interface AgentTool {
  name: AgentToolName;
  label: string;
  description: string;
  icon: string;
}

export const ALL_AGENT_TOOLS: AgentTool[] = [
  { name: 'terminal', label: '终端执行', description: '执行 shell 命令（npm, git, go, python 等）', icon: '💻' },
  { name: 'readFile', label: '读取文件', description: '读取指定路径的文件内容', icon: '📖' },
  { name: 'writeFile', label: '写入文件', description: '创建或修改文件', icon: '✏️' },
  { name: 'listDir', label: '目录列表', description: '列出目录下的文件和子目录', icon: '📁' },
  { name: 'search', label: '搜索文件', description: '在项目中搜索文件或内容', icon: '🔍' },
];

// Which tools each role type gets by default
export const ROLE_TOOL_PRESETS: Record<string, AgentToolName[]> = {
  '架构师': ['readFile', 'listDir', 'search'],
  '评审员': ['readFile', 'listDir', 'search', 'terminal'],
  '产品经理': ['readFile', 'listDir'],
  '前端工程师': ['terminal', 'readFile', 'writeFile', 'listDir', 'search'],
  '后端工程师': ['terminal', 'readFile', 'writeFile', 'listDir', 'search'],
  '总结者': ['readFile', 'listDir'],
};

// Build tool description string for injection into system prompt
export function buildToolPrompt(tools: AgentToolName[]): string {
  if (tools.length === 0) return '';
  const toolDescs = tools.map((t) => {
    const tool = ALL_AGENT_TOOLS.find((at) => at.name === t);
    if (!tool) return '';
    return `- **${tool.label}** (${tool.name}): ${tool.description}`;
  }).filter(Boolean).join('\n');

  return `\n\n## 可用工具\n你可以在回复中使用以下工具。使用时请用 \`\`\`tool:工具名\`\`\` 代码块格式：\n${toolDescs}\n\n### 工具调用格式示例\n\`\`\`tool:terminal\nnpm run build\n\`\`\`\n\n\`\`\`tool:readFile\n/path/to/file.ts\n\`\`\`\n\n\`\`\`tool:writeFile:/path/to/file.ts\n文件内容...\n\`\`\`\n\n\`\`\`tool:listDir\n/path/to/directory\n\`\`\`\n\n\`\`\`
grep -r "pattern" /path\n\`\`\`\n\n请在需要时主动使用工具来验证方案、查看代码或执行命令。`;
}

// ===== Chain Discussion Types =====

export type ChainExecutionMode = 'sequential' | 'parallel';

// A single agent node in the discussion chain
export interface ChainAgent {
  id: string;
  name: string;           // e.g. "架构师", "评审员", "产品经理"
  role: string;           // system prompt describing this agent's role
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  color: string;          // avatar color for UI
  icon: string;           // emoji icon
  tools: AgentToolName[]; // which tools this agent can use
}

// One turn of output from an agent
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
}

// A complete chain discussion session
export interface ChainDiscussion {
  id: string;
  title: string;
  topic: string;          // the user's original requirement/question
  agents: ChainAgent[];
  turns: ChainTurn[];
  rounds: number;         // how many rounds of discussion
  currentRound: number;
  mode: ChainExecutionMode;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  createdAt: number;
  updatedAt: number;
}

// Preset agent templates
export const AGENT_PRESETS: Omit<ChainAgent, 'id'>[] = [
  {
    name: '架构师',
    role: '你是一位资深软件架构师。你负责从系统设计、可扩展性、技术选型的角度分析问题，提出架构方案。请基于前面的讨论内容给出你的专业意见。',
    provider: 'claude',
    model: 'claude-opus-4-6',
    temperature: 0.7,
    maxTokens: 4096,
    color: '#6366f1',
    icon: '🏗️',
    tools: ['readFile', 'listDir', 'search'],
  },
  {
    name: '评审员',
    role: '你是一位严格的代码评审专家。你负责审查方案中的潜在问题、安全隐患、性能瓶颈，并提出改进建议。请基于前面的讨论内容给出你的评审意见。',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    temperature: 0.5,
    maxTokens: 4096,
    color: '#f59e0b',
    icon: '🔍',
    tools: ['readFile', 'listDir', 'search', 'terminal'],
  },
  {
    name: '产品经理',
    role: '你是一位经验丰富的产品经理。你负责从用户需求、商业价值、优先级排序的角度分析问题。请基于前面的讨论内容给出你的产品视角。',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    maxTokens: 4096,
    color: '#10b981',
    icon: '📋',
    tools: ['readFile', 'listDir'],
  },
  {
    name: '前端工程师',
    role: '你是一位资深前端工程师，精通 Vue3/React/TypeScript。你负责从前端实现、用户体验、组件设计的角度分析问题。请基于前面的讨论内容给出你的技术方案。',
    provider: 'claude',
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.6,
    maxTokens: 4096,
    color: '#3b82f6',
    icon: '🎨',
    tools: ['terminal', 'readFile', 'writeFile', 'listDir', 'search'],
  },
  {
    name: '后端工程师',
    role: '你是一位资深后端工程师，精通 Go/Java/Python。你负责从后端实现、数据库设计、API设计的角度分析问题。请基于前面的讨论内容给出你的技术方案。',
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    temperature: 0.6,
    maxTokens: 4096,
    color: '#8b5cf6',
    icon: '⚙️',
    tools: ['terminal', 'readFile', 'writeFile', 'listDir', 'search'],
  },
  {
    name: '总结者',
    role: '你是一位善于总结的协调者。你负责综合所有人的意见，提炼出最终的结论和行动计划。请基于前面所有讨论内容，给出结构化的总结。',
    provider: 'claude',
    model: 'claude-opus-4-6',
    temperature: 0.5,
    maxTokens: 4096,
    color: '#ec4899',
    icon: '📝',
    tools: ['readFile', 'listDir'],
  },
];

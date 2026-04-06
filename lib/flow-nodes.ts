// Rich node type system for the workflow editor
// Each node type is self-describing with typed inputs/outputs
// Inspired by Flowise's node component architecture

export type NodeType =
  | 'ai'
  | 'condition'
  | 'input'
  | 'output'
  | 'transform'
  | 'merge'
  | 'human_review'
  | 'code'
  | 'template'
  | 'http_request'
  | 'loop';

export type PortValueType = 'string' | 'number' | 'boolean' | 'json' | 'any';

export interface NodePort {
  id: string;
  name: string;
  type: PortValueType;
  required: boolean;
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'code' | 'textarea';
  label: string;
  default?: unknown;
  options?: string[]; // for select type
}

export interface FlowNodeDefinition {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: Record<string, ConfigField>;
}

// ─── Node Definitions ────────────────────────────────────

export const NODE_DEFINITIONS: Record<NodeType, FlowNodeDefinition> = {
  input: {
    type: 'input',
    label: '输入节点',
    description: '工作流入口，接收用户输入',
    icon: '⬇',
    color: '#6366f1',
    inputs: [],
    outputs: [{ id: 'text', name: 'text', type: 'string', required: true }],
    configSchema: {
      defaultValue: { type: 'textarea', label: '默认值', default: '' },
    },
  },

  ai: {
    type: 'ai',
    label: 'AI 节点',
    description: 'LLM 调用，支持模型与提示词配置',
    icon: '🤖',
    color: '#0a84ff',
    inputs: [
      { id: 'context', name: 'context', type: 'string', required: false },
      { id: 'prompt', name: 'prompt', type: 'string', required: true },
    ],
    outputs: [{ id: 'response', name: 'response', type: 'string', required: true }],
    configSchema: {
      provider: { type: 'select', label: '模型提供商', default: 'claude', options: ['claude', 'openai', 'gemini'] },
      model: { type: 'string', label: '模型', default: 'claude-sonnet-4-6' },
      systemPrompt: { type: 'textarea', label: '系统提示词', default: '你是一个有帮助的AI助手。' },
      temperature: { type: 'number', label: '温度', default: 0.7 },
      maxTokens: { type: 'number', label: '最大 Token', default: 2048 },
    },
  },

  condition: {
    type: 'condition',
    label: '条件节点',
    description: 'If/Else 分支，支持正则、包含、LLM 判断',
    icon: '⑂',
    color: '#f59e0b',
    inputs: [{ id: 'value', name: 'value', type: 'any', required: true }],
    outputs: [
      { id: 'true', name: 'true', type: 'any', required: true },
      { id: 'false', name: 'false', type: 'any', required: true },
    ],
    configSchema: {
      mode: { type: 'select', label: '判断模式', default: 'contains', options: ['contains', 'regex', 'llm_judge'] },
      pattern: { type: 'string', label: '匹配模式', default: '' },
      llmPrompt: { type: 'textarea', label: 'LLM 判断提示词', default: '判断以下内容是否满足条件，回答 true 或 false：' },
    },
  },

  output: {
    type: 'output',
    label: '输出节点',
    description: '工作流出口，格式化最终结果',
    icon: '⬆',
    color: '#10b981',
    inputs: [{ id: 'result', name: 'result', type: 'any', required: true }],
    outputs: [],
    configSchema: {
      format: { type: 'select', label: '输出格式', default: 'text', options: ['text', 'json', 'markdown'] },
      template: { type: 'textarea', label: '输出模板', default: '{{result}}' },
    },
  },

  transform: {
    type: 'transform',
    label: '转换节点',
    description: '文本操作：提取 JSON、摘要、格式化',
    icon: '⚙',
    color: '#8b5cf6',
    inputs: [{ id: 'input', name: 'input', type: 'string', required: true }],
    outputs: [{ id: 'output', name: 'output', type: 'string', required: true }],
    configSchema: {
      operation: { type: 'select', label: '操作类型', default: 'extract_json', options: ['extract_json', 'summarize', 'format', 'split', 'join'] },
      param: { type: 'string', label: '参数', default: '' },
    },
  },

  merge: {
    type: 'merge',
    label: '合并节点',
    description: '合并多个并行分支的输出',
    icon: '⊕',
    color: '#06b6d4',
    inputs: [
      { id: 'input_a', name: 'input_a', type: 'any', required: true },
      { id: 'input_b', name: 'input_b', type: 'any', required: false },
      { id: 'input_c', name: 'input_c', type: 'any', required: false },
    ],
    outputs: [{ id: 'merged', name: 'merged', type: 'string', required: true }],
    configSchema: {
      strategy: { type: 'select', label: '合并策略', default: 'concat', options: ['concat', 'json_object', 'pick_best'] },
      separator: { type: 'string', label: '分隔符', default: '\n---\n' },
    },
  },

  human_review: {
    type: 'human_review',
    label: '人工审核',
    description: '暂停工作流等待人工审批或编辑',
    icon: '👤',
    color: '#ec4899',
    inputs: [{ id: 'draft', name: 'draft', type: 'string', required: true }],
    outputs: [{ id: 'approved', name: 'approved', type: 'string', required: true }],
    configSchema: {
      instruction: { type: 'textarea', label: '审核说明', default: '请审核以下内容并决定是否通过。' },
      timeout: { type: 'number', label: '超时(秒)', default: 300 },
    },
  },

  code: {
    type: 'code',
    label: '代码节点',
    description: '执行 JavaScript 代码片段',
    icon: '{ }',
    color: '#64748b',
    inputs: [{ id: 'data', name: 'data', type: 'any', required: false }],
    outputs: [{ id: 'result', name: 'result', type: 'any', required: true }],
    configSchema: {
      language: { type: 'select', label: '语言', default: 'javascript', options: ['javascript', 'python'] },
      code: { type: 'code', label: '代码', default: '// input available as `data`\nreturn data;' },
    },
  },

  template: {
    type: 'template',
    label: '模板节点',
    description: '字符串模板，支持变量插值',
    icon: '📝',
    color: '#f97316',
    inputs: [
      { id: 'var1', name: 'var1', type: 'string', required: false },
      { id: 'var2', name: 'var2', type: 'string', required: false },
    ],
    outputs: [{ id: 'text', name: 'text', type: 'string', required: true }],
    configSchema: {
      template: { type: 'textarea', label: '模板', default: '{{var1}} — {{var2}}' },
    },
  },

  http_request: {
    type: 'http_request',
    label: 'HTTP 请求',
    description: '发送 HTTP 请求并返回响应',
    icon: '🌐',
    color: '#3b82f6',
    inputs: [
      { id: 'url', name: 'url', type: 'string', required: true },
      { id: 'body', name: 'body', type: 'json', required: false },
    ],
    outputs: [
      { id: 'response', name: 'response', type: 'json', required: true },
      { id: 'status', name: 'status', type: 'number', required: true },
    ],
    configSchema: {
      method: { type: 'select', label: '方法', default: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      url: { type: 'string', label: 'URL', default: 'https://api.example.com/data' },
      headers: { type: 'textarea', label: '请求头 (JSON)', default: '{"Content-Type": "application/json"}' },
      body: { type: 'textarea', label: '请求体', default: '' },
      timeout: { type: 'number', label: '超时(ms)', default: 10000 },
    },
  },

  loop: {
    type: 'loop',
    label: '循环节点',
    description: '对列表中的每个元素执行子流程',
    icon: '🔄',
    color: '#a855f7',
    inputs: [{ id: 'items', name: 'items', type: 'json', required: true }],
    outputs: [{ id: 'results', name: 'results', type: 'json', required: true }],
    configSchema: {
      mode: { type: 'select', label: '模式', default: 'sequential', options: ['sequential', 'parallel'] },
      maxIterations: { type: 'number', label: '最大迭代', default: 50 },
      itemVariable: { type: 'string', label: '元素变量名', default: 'item' },
    },
  },
};

// Helper: get definition for a node type
export function getNodeDefinition(type: NodeType): FlowNodeDefinition {
  return NODE_DEFINITIONS[type];
}

// All node types available in the palette
export function getNodePalette(): FlowNodeDefinition[] {
  return Object.values(NODE_DEFINITIONS);
}

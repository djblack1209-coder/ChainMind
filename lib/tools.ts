// ChainMind Tools System — slash commands, prompt optimizer, role presets, built-in tools
// Inspired by: prompt-optimizer (prompt optimization), claude-plugins (slash commands), composio (tool concept)

// ===== Slash Commands =====
export interface SlashCommand {
  name: string;        // e.g. "/optimize"
  label: string;       // Chinese display name
  description: string; // What it does
  icon: string;        // Emoji icon
  category: 'prompt' | 'role' | 'tool' | 'system';
  handler: 'inject' | 'transform' | 'action'; // how it works
  payload?: string;    // system prompt or template to inject
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // === Prompt Optimization (from prompt-optimizer) ===
  {
    name: '/optimize',
    label: '优化提示词',
    description: '用 AI 优化你的提示词，使其更清晰、更具体',
    icon: '✨',
    category: 'prompt',
    handler: 'transform',
    payload: `你是一位专业的提示词工程师。请优化以下用户提示词，使其：
1. 更加清晰和具体
2. 包含必要的上下文和约束条件
3. 明确期望的输出格式
4. 消除歧义

请直接输出优化后的提示词，不要解释。

用户原始提示词：
{{input}}`,
  },
  {
    name: '/system',
    label: '生成系统提示词',
    description: '根据描述生成结构化的系统提示词',
    icon: '🧠',
    category: 'prompt',
    handler: 'transform',
    payload: `你是一位系统提示词设计专家。根据用户的描述，生成一个高质量的系统提示词（System Prompt）。

要求：
1. 明确角色定义和专业领域
2. 设定行为准则和约束
3. 定义输出格式和风格
4. 包含边界情况处理
5. 使用 Markdown 格式组织

用户描述：
{{input}}`,
  },
  {
    name: '/iterate',
    label: '迭代优化',
    description: '对已有提示词进行定向迭代改进',
    icon: '🔄',
    category: 'prompt',
    handler: 'transform',
    payload: `你是提示词迭代优化专家。请分析以下提示词的不足之处，并给出改进版本。

分析维度：
1. 清晰度：是否有歧义？
2. 完整性：是否缺少关键信息？
3. 结构性：组织是否合理？
4. 可执行性：AI 是否能准确执行？

请先简要分析问题（2-3句），然后给出优化后的完整提示词。

待优化的提示词：
{{input}}`,
  },

  // === Role Presets (inspired by composio's agent concept) ===
  {
    name: '/coder',
    label: '编程助手',
    description: '切换为专业编程助手模式',
    icon: '💻',
    category: 'role',
    handler: 'inject',
    payload: `你是一位资深全栈开发工程师，精通 TypeScript、Python、Go、Rust 等主流语言，熟悉 React、Vue、Next.js 等前端框架以及各类后端架构。

工作准则：
- 代码优先：直接给出可运行的代码，而非冗长解释
- 最佳实践：遵循业界最佳实践和设计模式
- 安全意识：始终考虑安全性和边界情况
- 简洁高效：用最少的代码实现需求
- 中文交流，代码注释用英文`,
  },
  {
    name: '/writer',
    label: '写作助手',
    description: '切换为专业写作助手模式',
    icon: '✍️',
    category: 'role',
    handler: 'inject',
    payload: `你是一位资深中文写作专家，擅长各类文体创作，包括但不限于：技术文档、商业文案、创意写作、学术论文、新闻稿件。

工作准则：
- 文笔流畅，逻辑清晰
- 根据场景调整语言风格
- 注重结构和层次感
- 善用修辞但不过度
- 确保内容准确、有深度`,
  },
  {
    name: '/translator',
    label: '翻译专家',
    description: '切换为专业翻译模式',
    icon: '🌐',
    category: 'role',
    handler: 'inject',
    payload: `你是一位精通中英日韩多语言的专业翻译。

工作准则：
- 信达雅：忠实原文、通顺流畅、文雅得体
- 根据语境选择最恰当的表达
- 保留专业术语并在必要时附注原文
- 注意文化差异的处理
- 默认中英互译，用户可指定其他语言`,
  },
  {
    name: '/analyst',
    label: '数据分析师',
    description: '切换为数据分析专家模式',
    icon: '📊',
    category: 'role',
    handler: 'inject',
    payload: `你是一位资深数据分析师，擅长数据解读、趋势分析、可视化建议和商业洞察。

工作准则：
- 数据驱动：基于数据给出结论
- 结构化输出：使用表格、列表等清晰呈现
- 多维分析：从不同角度解读数据
- 可操作建议：给出具体的行动建议
- 善用统计方法和分析框架`,
  },

  // === Built-in Tools (inspired by composio's toolkit concept) ===
  {
    name: '/summarize',
    label: '总结摘要',
    description: '对长文本进行智能总结',
    icon: '📝',
    category: 'tool',
    handler: 'transform',
    payload: `请对以下内容进行结构化总结：

1. 核心要点（3-5条）
2. 关键细节
3. 结论/建议

要求简洁明了，保留关键信息。

待总结内容：
{{input}}`,
  },
  {
    name: '/explain',
    label: '深度解释',
    description: '用通俗易懂的方式解释复杂概念',
    icon: '💡',
    category: 'tool',
    handler: 'transform',
    payload: `请用通俗易懂的方式解释以下概念或内容。

要求：
1. 先用一句话概括
2. 用类比或例子帮助理解
3. 解释核心原理
4. 说明实际应用场景

待解释内容：
{{input}}`,
  },
  {
    name: '/review',
    label: '代码审查',
    description: '对代码进行专业审查',
    icon: '🔍',
    category: 'tool',
    handler: 'transform',
    payload: `请对以下代码进行专业审查，从以下维度分析：

1. 🐛 潜在 Bug 和错误
2. ⚡ 性能问题
3. 🔒 安全隐患
4. 📐 代码风格和可读性
5. 🏗️ 架构和设计模式
6. ✅ 改进建议（给出具体代码）

待审查代码：
{{input}}`,
  },
  {
    name: '/debug',
    label: '调试助手',
    description: '分析错误信息并给出解决方案',
    icon: '🐛',
    category: 'tool',
    handler: 'transform',
    payload: `你是一位调试专家。请分析以下错误信息或问题描述：

1. 错误原因分析
2. 可能的根本原因
3. 具体的解决步骤
4. 预防措施

错误信息/问题描述：
{{input}}`,
  },

  // === System Commands ===
  {
    name: '/clear',
    label: '清空对话',
    description: '清空当前对话的所有消息',
    icon: '🗑️',
    category: 'system',
    handler: 'action',
  },
  {
    name: '/reset',
    label: '重置角色',
    description: '重置为默认 AI 助手角色',
    icon: '↩️',
    category: 'system',
    handler: 'action',
    payload: '你是一个有帮助的AI助手。请用中文回答。',
  },
];

// Get matching commands for autocomplete
export function matchCommands(input: string): SlashCommand[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.startsWith(trimmed) || cmd.label.includes(trimmed.slice(1))
  );
}

// Process a slash command — returns the transformed prompt or action type
export function processSlashCommand(
  input: string
): { type: 'transform'; systemPrompt: string; userContent: string } | { type: 'inject'; systemPrompt: string } | { type: 'action'; action: string; payload?: string } | null {
  const trimmed = input.trim();
  const spaceIdx = trimmed.indexOf(' ');
  const cmdName = spaceIdx > 0 ? trimmed.slice(0, spaceIdx).toLowerCase() : trimmed.toLowerCase();
  const content = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim() : '';

  const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
  if (!cmd) return null;

  if (cmd.handler === 'transform' && cmd.payload) {
    return {
      type: 'transform',
      systemPrompt: cmd.payload.replace('{{input}}', content),
      userContent: content,
    };
  }

  if (cmd.handler === 'inject' && cmd.payload) {
    return { type: 'inject', systemPrompt: cmd.payload };
  }

  if (cmd.handler === 'action') {
    return { type: 'action', action: cmd.name, payload: cmd.payload };
  }

  return null;
}

// Group commands by category for display
export function groupedCommands(): Record<string, SlashCommand[]> {
  const groups: Record<string, SlashCommand[]> = {};
  for (const cmd of SLASH_COMMANDS) {
    if (!groups[cmd.category]) groups[cmd.category] = [];
    groups[cmd.category].push(cmd);
  }
  return groups;
}

export const CATEGORY_LABELS: Record<string, string> = {
  prompt: '提示词工具',
  role: '角色预设',
  tool: '内置工具',
  system: '系统命令',
};

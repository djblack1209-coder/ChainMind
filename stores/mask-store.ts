// Mask store — inspired by NextChat's Mask system
// Masks are reusable conversation templates with preset system prompts and context messages

import { create } from 'zustand';
import { storageGet, storageSet } from '@/lib/storage';
import type { AIProvider } from '@/lib/types';

export interface MaskMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Mask {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  context: MaskMessage[];  // pre-injected conversation context
  provider?: AIProvider;
  model?: string;
  temperature?: number;
  hideContext?: boolean;    // hide context messages from UI
  builtin: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'chainmind-masks';

function genId() {
  return `mask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getBuiltinMasks(): Mask[] {
  return [
    {
      id: 'mask_translator', name: '翻译助手', avatar: '🌐',
      description: '中英互译，保持专业术语准确',
      systemPrompt: '你是一位专业翻译。用户输入中文时翻译为英文，输入英文时翻译为中文。保持技术术语准确，语句自然流畅。只输出翻译结果，不要解释。',
      context: [], builtin: true, createdAt: 0, hideContext: true,
    },
    {
      id: 'mask_coder', name: '代码专家', avatar: '💻',
      description: '全栈开发，代码审查，架构设计',
      systemPrompt: '你是一位资深全栈开发专家，精通 TypeScript、Python、Go、Rust。你写的代码简洁高效，有完善的错误处理和类型定义。回答时直接给出代码，用中文解释关键设计决策。',
      context: [], builtin: true, createdAt: 0,
    },
    {
      id: 'mask_writer', name: '写作助手', avatar: '✍️',
      description: '文案润色，结构优化，风格调整',
      systemPrompt: '你是一位专业的中文写作顾问。帮助用户润色文案、优化结构、调整风格。保持原意的同时提升表达质量。给出修改建议时说明理由。',
      context: [], builtin: true, createdAt: 0,
    },
    {
      id: 'mask_analyst', name: '数据分析师', avatar: '📊',
      description: '数据分析，可视化建议，统计解读',
      systemPrompt: '你是一位数据分析专家，擅长 SQL、Python pandas、数据可视化。帮助用户分析数据、编写查询、选择合适的图表类型、解读统计结果。回答要有数据支撑。',
      context: [], builtin: true, createdAt: 0,
    },
    {
      id: 'mask_teacher', name: '学习导师', avatar: '🎓',
      description: '概念讲解，类比教学，循序渐进',
      systemPrompt: '你是一位耐心的学习导师。用简单的语言和生动的类比解释复杂概念。遵循"先概览→再细节→最后总结"的教学结构。适时提问引导思考。',
      context: [], builtin: true, createdAt: 0,
    },
    {
      id: 'mask_debug', name: 'Debug 专家', avatar: '🐛',
      description: '错误诊断，根因分析，修复建议',
      systemPrompt: '你是一位系统化调试专家。面对 bug 时：1) 先复现和定位问题；2) 分析根因而非表象；3) 给出最小修复方案；4) 说明如何防止复发。不要猜测，要基于证据。',
      context: [
        { role: 'user', content: '我遇到了一个 bug，请帮我分析。' },
        { role: 'assistant', content: '好的，请提供：1) 错误信息或截图；2) 复现步骤；3) 期望行为 vs 实际行为。这样我能更准确地定位问题。' },
      ],
      builtin: true, createdAt: 0,
    },
    {
      id: 'mask_product', name: '产品经理', avatar: '📋',
      description: 'PRD 撰写，需求分析，用户故事',
      systemPrompt: '你是一位经验丰富的产品经理。帮助用户梳理需求、撰写 PRD、定义用户故事、设计信息架构。输出结构化文档，包含背景、目标、功能列表、优先级和验收标准。',
      context: [], builtin: true, createdAt: 0,
    },
    {
      id: 'mask_summarizer', name: '摘要大师', avatar: '📝',
      description: '长文摘要，要点提取，结构化总结',
      systemPrompt: '你是一位信息提炼专家。将长文本压缩为结构化摘要：1) 一句话核心观点；2) 3-5 个关键要点；3) 行动建议（如适用）。保持客观，不添加个人观点。',
      context: [], builtin: true, createdAt: 0,
    },
  ];
}

interface MaskState {
  masks: Mask[];
  loaded: boolean;
  loadMasks: () => Promise<void>;
  createMask: (partial: Partial<Mask>) => Mask;
  updateMask: (id: string, partial: Partial<Mask>) => void;
  deleteMask: (id: string) => void;
  getMask: (id: string) => Mask | undefined;
  getAllMasks: () => Mask[];
  saveMasks: () => Promise<void>;
}

export const useMaskStore = create<MaskState>()((set, get) => ({
  masks: [],
  loaded: false,

  loadMasks: async () => {
    try {
      const stored = await storageGet<Mask[]>(STORAGE_KEY);
      set({ masks: stored || [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  createMask: (partial) => {
    const mask: Mask = {
      id: genId(),
      name: partial.name || '新角色',
      avatar: partial.avatar || '🤖',
      description: partial.description || '',
      systemPrompt: partial.systemPrompt || '',
      context: partial.context || [],
      provider: partial.provider,
      model: partial.model,
      temperature: partial.temperature,
      hideContext: partial.hideContext,
      builtin: false,
      createdAt: Date.now(),
    };
    set((s) => ({ masks: [mask, ...s.masks] }));
    get().saveMasks();
    return mask;
  },

  updateMask: (id, partial) => {
    set((s) => ({
      masks: s.masks.map((m) => m.id === id ? { ...m, ...partial } : m),
    }));
    get().saveMasks();
  },

  deleteMask: (id) => {
    set((s) => ({ masks: s.masks.filter((m) => m.id !== id) }));
    get().saveMasks();
  },

  getMask: (id) => {
    return get().getAllMasks().find((m) => m.id === id);
  },

  getAllMasks: () => {
    const userMasks = get().masks.sort((a, b) => b.createdAt - a.createdAt);
    return [...userMasks, ...getBuiltinMasks()];
  },

  saveMasks: async () => {
    const userMasks = get().masks.filter((m) => !m.builtin);
    await storageSet(STORAGE_KEY, userMasks);
  },
}));

// Chat store: manages conversations and messages

import { create } from 'zustand';
import type { AIProvider, ChatMessage, Conversation } from '@/lib/types';
import { storageGet, storageSet } from '@/lib/storage';
import { debounce } from 'lodash-es';

const STORAGE_KEY = 'chat-conversations';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  loaded: boolean;

  loadConversations: () => Promise<void>;
  createConversation: (provider: AIProvider, model: string) => string;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversation: (id: string) => void;
  addMessage: (convId: string, msg: ChatMessage) => void;
  updateMessage: (convId: string, msgId: string, partial: Partial<ChatMessage>) => void;
  clearMessages: (convId: string) => void;
  setSystemPrompt: (convId: string, prompt: string | undefined) => void;
  addTag: (convId: string, tag: string) => void;
  removeTag: (convId: string, tag: string) => void;
  getAllTags: () => string[];
  togglePin: (convId: string) => void;
  toggleArchive: (convId: string) => void;
  setFolder: (convId: string, folder: string | undefined) => void;
  getAllFolders: () => string[];
  saveConversations: () => Promise<void>;
}

function genId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Debounced persistence — prevents hundreds of writes during streaming
const debouncedSave = debounce(async (conversations: Conversation[]) => {
  await storageSet(STORAGE_KEY, conversations);
}, 500, { maxWait: 2000 });

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  loaded: false,

  loadConversations: async () => {
    try {
      const stored = await storageGet<Conversation[]>(STORAGE_KEY);
      if (stored && stored.length > 0) {
        set({ conversations: stored, activeConversationId: stored[0].id, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  createConversation: (provider, model) => {
    const id = genId();
    const conv: Conversation = {
      id,
      title: '新对话',
      messages: [],
      provider,
      model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }));
    get().saveConversations();
    return id;
  },

  deleteConversation: async (id) => {
    const convs = get().conversations.filter((c) => c.id !== id);
    const activeId = get().activeConversationId === id
      ? (convs[0]?.id || null)
      : get().activeConversationId;
    set({ conversations: convs, activeConversationId: activeId });
    await storageSet(STORAGE_KEY, convs);
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (convId, msg) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, msg],
              title: c.messages.length === 0 && msg.role === 'user'
                ? msg.content.slice(0, 30) + (msg.content.length > 30 ? '...' : '')
                : c.title,
              updatedAt: Date.now(),
            }
          : c
      ),
    }));
    get().saveConversations();
  },

  updateMessage: (convId, msgId, partial) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === msgId ? { ...m, ...partial } : m
              ),
              updatedAt: Date.now(),
            }
          : c
      ),
    }));
    get().saveConversations();
  },

  clearMessages: (convId) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, messages: [], title: '新对话', updatedAt: Date.now() } : c
      ),
    }));
    get().saveConversations();
  },

  setSystemPrompt: (convId, prompt) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, systemPrompt: prompt, updatedAt: Date.now() } : c
      ),
    }));
    get().saveConversations();
  },

  addTag: (convId, tag) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const tags = c.tags || [];
        if (tags.includes(tag)) return c;
        return { ...c, tags: [...tags, tag], updatedAt: Date.now() };
      }),
    }));
    get().saveConversations();
  },

  removeTag: (convId, tag) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        return { ...c, tags: (c.tags || []).filter((t) => t !== tag), updatedAt: Date.now() };
      }),
    }));
    get().saveConversations();
  },

  getAllTags: () => {
    const allTags = new Set<string>();
    for (const c of get().conversations) {
      for (const t of c.tags || []) allTags.add(t);
    }
    return Array.from(allTags).sort();
  },

  togglePin: (convId) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, pinned: !c.pinned } : c
      ),
    }));
    get().saveConversations();
  },

  toggleArchive: (convId) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, archived: !c.archived } : c
      ),
    }));
    get().saveConversations();
  },

  setFolder: (convId, folder) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, folder } : c
      ),
    }));
    get().saveConversations();
  },

  getAllFolders: () => {
    const folders = new Set<string>();
    for (const c of get().conversations) {
      if (c.folder) folders.add(c.folder);
    }
    return Array.from(folders).sort();
  },

  saveConversations: async () => {
    debouncedSave(get().conversations);
  },
}));

// MCP Store: manages MCP server connections, tools, and persistence

import { create } from 'zustand';
import { storageGet, storageSet } from '@/lib/storage';
import type { MCPConfig, MCPTool } from '@/lib/electron-api';

const STORAGE_KEY = 'mcp-servers';

// ─── Pre-configured Official MCP Servers ─────────────────
export interface MCPServerEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'official' | 'community' | 'custom';
  config: MCPConfig;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: MCPTool[];
  error?: string;
  installed: boolean;
}

export const OFFICIAL_MCP_SERVERS: Omit<MCPServerEntry, 'status' | 'tools' | 'error' | 'installed'>[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: '安全的文件操作，支持读写、搜索、目录浏览',
    icon: '📁',
    category: 'official',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
  },
  {
    id: 'mcp-git',
    name: 'Git',
    description: 'Git 仓库操作：读取、搜索、提交历史',
    icon: '🔀',
    category: 'official',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-git'] },
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: '基于知识图谱的持久化记忆系统',
    icon: '🧠',
    category: 'official',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    description: '网页内容抓取，转换为 LLM 友好格式',
    icon: '🌐',
    category: 'official',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
  },
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking',
    description: '动态反思式问题求解，思维链推理',
    icon: '💭',
    category: 'official',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
  },
  {
    id: 'mcp-time',
    name: 'Time',
    description: '时间和时区转换',
    icon: '🕐',
    category: 'official',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-time'] },
  },
];

// ─── Store ───────────────────────────────────────────────
interface MCPState {
  servers: MCPServerEntry[];
  loaded: boolean;

  loadServers: () => Promise<void>;
  addServer: (server: Omit<MCPServerEntry, 'status' | 'tools' | 'error'>) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, partial: Partial<MCPServerEntry>) => void;
  installOfficial: (id: string) => void;
  uninstallServer: (id: string) => void;
  connectServer: (id: string) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  refreshTools: (id: string) => Promise<void>;
  getInstalledTools: () => MCPTool[];
  saveServers: () => Promise<void>;
}

export const useMCPStore = create<MCPState>()((set, get) => ({
  servers: [],
  loaded: false,

  loadServers: async () => {
    try {
      const stored = await storageGet<MCPServerEntry[]>(STORAGE_KEY);
      if (stored && stored.length > 0) {
        // Reset runtime state on load
        const servers = stored.map((s) => ({ ...s, status: 'disconnected' as const, tools: [], error: undefined }));
        set({ servers, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  addServer: (server) => {
    const entry: MCPServerEntry = { ...server, status: 'disconnected', tools: [], installed: true };
    set((s) => ({ servers: [...s.servers, entry] }));
    get().saveServers();
  },

  removeServer: (id) => {
    set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }));
    get().saveServers();
  },

  updateServer: (id, partial) => {
    set((s) => ({
      servers: s.servers.map((srv) => srv.id === id ? { ...srv, ...partial } : srv),
    }));
  },

  installOfficial: (id) => {
    const template = OFFICIAL_MCP_SERVERS.find((s) => s.id === id);
    if (!template) return;
    const exists = get().servers.find((s) => s.id === id);
    if (exists) {
      get().updateServer(id, { installed: true });
    } else {
      get().addServer({ ...template, installed: true });
    }
    get().saveServers();
  },

  uninstallServer: (id) => {
    const srv = get().servers.find((s) => s.id === id);
    if (srv?.category === 'custom') {
      get().removeServer(id);
    } else {
      get().updateServer(id, { installed: false, status: 'disconnected', tools: [] });
      get().saveServers();
    }
  },

  connectServer: async (id) => {
    const srv = get().servers.find((s) => s.id === id);
    if (!srv || !srv.installed) return;

    get().updateServer(id, { status: 'connecting', error: undefined });

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcpConnect) {
        const result = await window.electronAPI.mcpConnect(srv.config);
        if (result.ok) {
          get().updateServer(id, {
            status: 'connected',
            tools: result.data?.tools || [],
          });
        } else {
          get().updateServer(id, { status: 'error', error: result.error || 'Connection failed' });
        }
      } else {
        get().updateServer(id, { status: 'error', error: 'Electron API not available' });
      }
    } catch (e: any) {
      get().updateServer(id, { status: 'error', error: e?.message || 'Unknown error' });
    }
  },

  disconnectServer: async (id) => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcpDisconnect) {
        await window.electronAPI.mcpDisconnect();
      }
    } catch { /* ignore */ }
    get().updateServer(id, { status: 'disconnected', tools: [] });
  },

  refreshTools: async (id) => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcpListTools) {
        const result = await window.electronAPI.mcpListTools();
        if (result.ok) {
          get().updateServer(id, { tools: result.data });
        }
      }
    } catch { /* ignore */ }
  },

  getInstalledTools: () => {
    return get().servers
      .filter((s) => s.status === 'connected')
      .flatMap((s) => s.tools);
  },

  saveServers: async () => {
    const toSave = get().servers.map(({ status, tools, error, ...rest }) => ({
      ...rest,
      status: 'disconnected' as const,
      tools: [],
    }));
    await storageSet(STORAGE_KEY, toSave);
  },
}));

"use client";

// Workspace — TRAE-style IDE layout: activity bar + sidebar + editor + terminal

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import ApiKeyManager from '@/components/ApiKeyManager';
import BrandMark from '@/components/BrandMark';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/components/Toast';
import { useApiKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';
import { useChainStore } from '@/stores/chain-store';
import { useAuthStore } from '@/stores/auth-store';

import TerminalPanel from '@/components/TerminalPanel';
import MCPConfigPanel from '@/components/MCPConfigPanel';
import PromptEnginePanel from '@/components/PromptEnginePanel';
import CommandPalette from '@/components/CommandPalette';
import type { AIProvider } from '@/lib/types';
import { DEFAULT_PROVIDER_MODEL, MODEL_OPTIONS, MODEL_SPOTLIGHTS, getModelTokenProfile, formatTokenCount } from '@/lib/types';
import type { SlashCommand } from '@/lib/tools';
import { useTitlebarInset } from '@/lib/use-titlebar-inset';
import { PRESET_CONFIG } from '@/lib/preset-config';
import { useTheme } from '@/components/ThemeProvider';

const ChatPanel = lazy(() => import('@/components/ChatPanel'));
const ChainPanel = lazy(() => import('@/components/ChainPanel'));
const ToolPanel = lazy(() => import('@/components/ToolPanel'));
const SetupWizard = lazy(() => import('@/components/SetupWizard'));
const PromptTemplatePanel = lazy(() => import('@/components/PromptTemplatePanel'));
const KnowledgeBasePanel = lazy(() => import('@/components/KnowledgeBasePanel'));
const ModelCompare = lazy(() => import('@/components/ModelCompare'));

type WorkspaceMode = 'chat' | 'chain' | 'compare';
type ActivityTab = 'explorer' | 'chain' | 'search' | 'settings';

function WorkspaceInner() {
  const router = useRouter();
  const titlebarInset = useTitlebarInset();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>('chat');
  const [activeTab, setActiveTab] = useState<ActivityTab>('explorer');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [promptEngineOpen, setPromptEngineOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [promptTemplatesOpen, setPromptTemplatesOpen] = useState(false);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<{ convId: string; value: string } | null>(null);

  const loadKeys = useApiKeyStore((s) => s.loadKeys);
  const saveKey = useApiKeyStore((s) => s.saveKey);
  const setStoreBaseUrl = useApiKeyStore((s) => s.setBaseUrl);
  const keysLoaded = useApiKeyStore((s) => s.loaded);
  const keys = useApiKeyStore((s) => s.keys);

  const {
    conversations, activeConversationId, loaded: chatLoaded,
    loadConversations, createConversation, deleteConversation, setActiveConversation,
    addTag, removeTag, getAllTags,
    togglePin, toggleArchive,
  } = useChatStore();

  const {
    discussions, activeDiscussionId, loaded: chainLoaded,
    loadDiscussions, deleteDiscussion, setActiveDiscussion,
  } = useChainStore();
  const user = useAuthStore((s) => s.user);

  const { toast } = useToast();
  const autoImportAttemptedRef = useRef(false);

  const hasAnyKey = keys.claude !== null || keys.openai !== null || keys.gemini !== null;

  // Current provider/model for new conversations
  const [currentProvider, setCurrentProvider] = useState<AIProvider>('claude');
  const [currentModel, setCurrentModel] = useState(DEFAULT_PROVIDER_MODEL.claude);

  // Auto-sync default provider to whichever has a key configured
  useEffect(() => {
    if (!keysLoaded) return;
    if (keys.openai !== null) {
      setCurrentProvider('openai');
      setCurrentModel(DEFAULT_PROVIDER_MODEL.openai);
    } else if (keys.claude !== null) {
      setCurrentProvider('claude');
      setCurrentModel(DEFAULT_PROVIDER_MODEL.claude);
    } else if (keys.gemini !== null) {
      setCurrentProvider('gemini');
      setCurrentModel(DEFAULT_PROVIDER_MODEL.gemini);
    }
  }, [keysLoaded, keys.claude, keys.openai, keys.gemini]);

  useEffect(() => {
    if (!keysLoaded) loadKeys();
    if (!chatLoaded) loadConversations();
    if (!chainLoaded) loadDiscussions();
  }, [keysLoaded, loadKeys, chatLoaded, loadConversations, chainLoaded, loadDiscussions]);

  // 首次运行时自动写入预置 OpenCode 配置（浏览器模式）
  useEffect(() => {
    if (!keysLoaded || hasAnyKey) return;
    if (typeof window === 'undefined' || window.electronAPI) return;

    const run = async () => {
      const { baseURL, apiKey, models } = PRESET_CONFIG;
      await setStoreBaseUrl('claude', baseURL);
      await setStoreBaseUrl('openai', baseURL);
      await saveKey('claude', apiKey);
      await saveKey('openai', apiKey);
      setCurrentProvider('claude');
      setCurrentModel(models.claude);
      toast('success', '已自动载入预置模型配置，可直接开始对话');
    };

    run().catch(() => {});
  // eslint-disable-next-line
  }, [keysLoaded]);

  // Auto-import OpenCode setup on first run in Electron mode.
  useEffect(() => {
    if (!keysLoaded || !chatLoaded) return;
    if (autoImportAttemptedRef.current) return;
    if (hasAnyKey || conversations.length > 0) return;
    if (typeof window === 'undefined' || !window.electronAPI?.importOpenCodeSetup) return;

    autoImportAttemptedRef.current = true;

    const run = async () => {
      const result = await window.electronAPI!.importOpenCodeSetup();
      if (!result.ok || !result.data?.found) return;

      const setup = result.data;
      let importedCount = 0;

      if (setup.baseUrls.claude?.trim()) {
        await setStoreBaseUrl('claude', setup.baseUrls.claude.trim());
      }
      if (setup.baseUrls.openai?.trim()) {
        await setStoreBaseUrl('openai', setup.baseUrls.openai.trim());
      }

      if (setup.keys.claude?.trim()) {
        await saveKey('claude', setup.keys.claude.trim());
        importedCount++;
      }
      if (setup.keys.openai?.trim()) {
        await saveKey('openai', setup.keys.openai.trim());
        importedCount++;
      }

      if (importedCount === 0) return;

      const claudeModel = setup.models.claude || DEFAULT_PROVIDER_MODEL.claude;
      const openaiModel = setup.models.openai || DEFAULT_PROVIDER_MODEL.openai;

      if (setup.keys.claude?.trim()) {
        createConversation('claude', claudeModel);
      }
      if (setup.keys.openai?.trim()) {
        createConversation('openai', openaiModel);
      }

      const preferredProvider = setup.preferred?.provider;
      const preferredModel = setup.preferred?.model;

      if (preferredProvider === 'claude' && setup.keys.claude?.trim() && preferredModel) {
        setCurrentProvider('claude');
        setCurrentModel(preferredModel);
      } else if (preferredProvider === 'openai' && setup.keys.openai?.trim() && preferredModel) {
        setCurrentProvider('openai');
        setCurrentModel(preferredModel);
      } else if (setup.keys.claude?.trim()) {
        setCurrentProvider('claude');
        setCurrentModel(claudeModel);
      } else if (setup.keys.openai?.trim()) {
        setCurrentProvider('openai');
        setCurrentModel(openaiModel);
      }

      toast('success', '已从 OpenCode 自动导入模型与密钥配置');
    };

    run().catch((err) => {
      toast('error', `OpenCode 自动导入失败: ${String(err).slice(0, 120)}`);
    });
  }, [
    keysLoaded,
    chatLoaded,
    hasAnyKey,
    conversations.length,
    createConversation,
    saveKey,
    setStoreBaseUrl,
    toast,
  ]);

  // Show setup wizard on first run
  useEffect(() => {
    if (!keysLoaded || !chatLoaded) return;
    if (hasAnyKey || conversations.length > 0) return;
    if (localStorage.getItem('chainmind-setup-complete')) return;
    setShowWizard(true);
  }, [keysLoaded, chatLoaded, hasAnyKey, conversations.length]);

  const handleNewChat = useCallback(() => {
    setMode('chat');
    createConversation(currentProvider, currentModel);
    toast('success', '新对话已创建');
  }, [createConversation, currentProvider, currentModel, toast]);

  const handleDeleteChat = useCallback((id: string) => {
    deleteConversation(id);
    toast('info', '对话已删除');
  }, [deleteConversation, toast]);

  const handleDeleteChain = useCallback((id: string) => {
    deleteDiscussion(id);
    toast('info', '讨论已删除');
  }, [deleteDiscussion, toast]);

  const handleSelectModel = (provider: AIProvider, model: string) => {
    setCurrentProvider(provider);
    setCurrentModel(model);
    setShowModelPicker(false);

    // Also update active conversation if exists
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (activeConv && activeConv.messages.length === 0) {
      useChatStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === activeConversationId ? { ...c, provider, model } : c
        ),
      }));
    }
  };

  // Close model picker on Escape
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModelPicker(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModelPicker]);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeDiscussion = discussions.find((d) => d.id === activeDiscussionId);
  const activeModelProfile = getModelTokenProfile(activeConv?.model || currentModel);

  const PROVIDER_INFO: Record<AIProvider, { label: string; icon: string; color: string }> = {
    claude: { label: 'Claude', icon: 'C', color: 'text-amber-200' },
    openai: { label: 'OpenAI', icon: 'O', color: 'text-[var(--brand-cream)]' },
    gemini: { label: 'Gemini', icon: 'G', color: 'text-cyan-200' },
    deepseek: { label: 'DeepSeek', icon: 'D', color: 'text-blue-300' },
    ollama: { label: 'Ollama', icon: 'L', color: 'text-green-300' },
    'openai-compatible': { label: 'Custom', icon: '⚙', color: 'text-gray-300' },
  };

  // Activity bar items
  const ACTIVITY_ITEMS: { id: ActivityTab; icon: React.ReactNode; label: string }[] = [
    { id: 'explorer', label: '会话', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg> },
    { id: 'chain', label: 'AI Chain', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg> },
    { id: 'search', label: '搜索', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg> },
    { id: 'settings', label: '设置', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg> },
  ];

  return (
    <div
      className="relative isolate h-screen w-screen overflow-hidden bg-[var(--bg-root)]"
      style={titlebarInset > 0 ? { paddingTop: `${titlebarInset}px` } : undefined}
    >
      <div className="relative z-10 flex h-full">
        {/* ═══ Activity Bar (TRAE-style narrow icon strip) ═══ */}
        <div className="flex w-12 flex-shrink-0 flex-col items-center border-r border-[var(--border-tertiary)] bg-[var(--bg-primary)] py-3">
          <div className="mb-4">
            <BrandMark size="sm" />
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            {ACTIVITY_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); if (sidebarCollapsed) setSidebarCollapsed(false); if (item.id === 'chain') setMode('chain'); else if (item.id === 'explorer') setMode('chat'); }}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  activeTab === item.id
                    ? "bg-[var(--brand-primary-soft)] text-[var(--text-primary)] border border-[var(--border-primary)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent"
                }`}
                title={item.label}
              >
                {item.icon}
              </button>
            ))}
          </div>
          <div className="flex flex-col items-center gap-1 pt-2 border-t border-[var(--border-tertiary)] mt-2">
            <button
              onClick={() => setTerminalOpen(!terminalOpen)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                terminalOpen ? "bg-[var(--brand-primary-soft)] text-[var(--text-primary)] border border-[var(--border-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent"
              }`}
              title="终端"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
            </button>
            <button
              onClick={() => setMcpOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent transition"
              title="MCP 配置"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            </button>
            <button
              onClick={() => setPromptEngineOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent transition"
              title="AI Chain 提示词引擎"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </button>
            <button
              onClick={() => setPromptTemplatesOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent transition"
              title="提示词模板"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
            </button>
            <button
              onClick={() => setKnowledgeBaseOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-transparent transition"
              title="知识库"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
            </button>
          </div>
        </div>

        {/* ═══ Sidebar Panel ═══ */}
        <div className={`flex flex-shrink-0 flex-col overflow-hidden border-r border-[var(--border-tertiary)] bg-[var(--bg-primary)] transition-all duration-200 ${sidebarCollapsed ? "w-0" : "w-[260px]"}`}>
          {!sidebarCollapsed && (
            <>
              {/* Sidebar header */}
              <div className="flex h-12 items-center justify-between border-b border-[var(--border-tertiary)] px-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  {activeTab === 'explorer' ? '会话' : activeTab === 'chain' ? 'AI Chain' : activeTab === 'search' ? '搜索' : '设置'}
                </span>
                <button onClick={() => setSidebarCollapsed(true)} className="rounded p-1 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></svg>
                </button>
              </div>

              {/* Mode toggle for explorer/chain */}
              {(activeTab === 'explorer' || activeTab === 'chain' || activeTab === 'settings' || activeTab === 'search') && (
                <div className="px-3 pt-3">
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] p-0.5">
                    <button
                      onClick={() => { setMode("chat"); setActiveTab("explorer"); }}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                        mode === "chat" ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      对话
                    </button>
                    <button
                      onClick={() => { setMode("compare"); setActiveTab("explorer"); }}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                        mode === "compare" ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      对比
                    </button>
                    <button
                      onClick={() => { setMode("chain"); setActiveTab("chain"); }}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                        mode === "chain" ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      AI Chain
                    </button>
                  </div>
                </div>
              )}

              {/* New button */}
              <div className="px-3 pt-3">
                <button
                  onClick={mode === "chat" ? handleNewChat : () => setMode("chain")}
                  className="btn btn-primary w-full justify-center py-2 text-xs"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                  <span>{mode === "chat" ? "新对话" : "新 Chain"}</span>
                </button>
              </div>

              {/* Search */}
              <div className="px-3 pt-2">
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="搜索对话..."
                  className="w-full rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-primary)]"
                />
              </div>

              {/* Tag filter */}
              {mode === 'chat' && getAllTags().length > 0 && (
                <div className="flex flex-wrap gap-1 px-3 pt-2">
                  <button
                    onClick={() => setFilterTag(null)}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] transition ${!filterTag ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                  >
                    全部
                  </button>
                  {getAllTags().map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] transition ${filterTag === tag ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Conversation / discussion list */}
              <div className="flex-1 overflow-y-auto px-3 pt-2 pb-2">
                {mode === "chat" || mode === "compare" ? (
                  conversations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-secondary)] px-3 py-5 text-center text-[11px] text-[var(--text-tertiary)]">
                      暂无对话
                    </div>
                  ) : (() => {
                    const filtered = conversations.filter((c) => {
                      const matchSearch = !sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || c.messages.some((m) => m.content.toLowerCase().includes(sidebarSearch.toLowerCase()));
                      const matchTag = !filterTag || (c.tags || []).includes(filterTag);
                      return matchSearch && matchTag && !c.archived;
                    });
                    const pinned = filtered.filter((c) => c.pinned);
                    const unpinned = filtered.filter((c) => !c.pinned);
                    const archived = conversations.filter((c) => c.archived && (!sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase())));

                    const renderConv = (conv: typeof conversations[0]) => {
                      const isActive = conv.id === activeConversationId;
                      const pi = PROVIDER_INFO[conv.provider];
                      return (
                        <div
                          key={conv.id}
                          onClick={() => setActiveConversation(conv.id)}
                          className={`group mb-1 flex cursor-pointer flex-col rounded-xl border px-2.5 py-2 transition ${
                            isActive ? "border-[var(--border-primary)] bg-[var(--brand-primary-soft)]" : "border-transparent hover:bg-[var(--bg-hover)]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-[10px] font-bold ${pi.color}`}>{pi.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 truncate text-[12px] text-[var(--text-primary)]">
                                {conv.pinned && <span className="text-[9px]" title="已置顶">📌</span>}
                                {conv.title}
                              </div>
                              <div className="text-[10px] text-[var(--text-tertiary)]">{conv.messages.length} 条</div>
                            </div>
                            <div className="hidden items-center gap-0.5 group-hover:flex">
                              <button
                                className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                onClick={(e) => { e.stopPropagation(); togglePin(conv.id); }}
                                title={conv.pinned ? '取消置顶' : '置顶'}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill={conv.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 2v10m0 0l-4-4m4 4l4-4M5 22h14" /></svg>
                              </button>
                              <button
                                className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-amber-400"
                                onClick={(e) => { e.stopPropagation(); toggleArchive(conv.id); }}
                                title={conv.archived ? '取消归档' : '归档'}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" /></svg>
                              </button>
                              <button
                                className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-rose-300"
                                onClick={(e) => { e.stopPropagation(); handleDeleteChat(conv.id); }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                              </button>
                            </div>
                          </div>
                          {/* Tags */}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {(conv.tags || []).map((tag) => (
                              <span
                                key={tag}
                                className="group/tag flex items-center gap-0.5 rounded-md bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]"
                              >
                                {tag}
                                <button
                                  className="hidden text-rose-300 group-hover/tag:inline"
                                  onClick={(e) => { e.stopPropagation(); removeTag(conv.id, tag); }}
                                >x</button>
                              </span>
                            ))}
                            {tagInput?.convId === conv.id ? (
                              <input
                                autoFocus
                                value={tagInput.value}
                                onChange={(e) => setTagInput({ convId: conv.id, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && tagInput.value.trim()) {
                                    addTag(conv.id, tagInput.value.trim());
                                    setTagInput(null);
                                  } else if (e.key === 'Escape') {
                                    setTagInput(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (tagInput.value.trim()) addTag(conv.id, tagInput.value.trim());
                                  setTagInput(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-12 rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-1 py-0.5 text-[9px] text-[var(--text-primary)] outline-none"
                                placeholder="标签"
                              />
                            ) : (
                              <button
                                className="hidden rounded-md px-1 py-0.5 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] group-hover:inline"
                                onClick={(e) => { e.stopPropagation(); setTagInput({ convId: conv.id, value: '' }); }}
                              >+</button>
                            )}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {pinned.length > 0 && (
                          <>
                            <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">📌 置顶</div>
                            {pinned.map(renderConv)}
                            {unpinned.length > 0 && <div className="my-2 border-t border-[var(--border-tertiary)]" />}
                          </>
                        )}
                        {unpinned.map(renderConv)}
                        {archived.length > 0 && (
                          <>
                            <div className="mt-3 mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">📦 归档 ({archived.length})</div>
                            {archived.map(renderConv)}
                          </>
                        )}
                      </>
                    );
                  })()
                ) : discussions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-secondary)] px-3 py-5 text-center text-[11px] text-[var(--text-tertiary)]">
                    暂无 Chain 讨论
                  </div>
                ) : discussions.filter((d) => !sidebarSearch || d.title.toLowerCase().includes(sidebarSearch.toLowerCase()) || (d.topic && d.topic.toLowerCase().includes(sidebarSearch.toLowerCase()))).map((disc) => {
                  const isActive = disc.id === activeDiscussionId;
                  return (
                    <div
                      key={disc.id}
                      onClick={() => setActiveDiscussion(disc.id)}
                      className={`group mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
                        isActive ? "border-[var(--border-primary)] bg-[var(--brand-primary-soft)]" : "border-transparent hover:bg-[var(--bg-hover)]"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0 text-[var(--text-tertiary)]"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-[var(--text-primary)]">{disc.title}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            disc.status === 'running' ? 'bg-amber-400 animate-pulse' : disc.status === 'completed' ? 'bg-emerald-400' : disc.status === 'error' ? 'bg-rose-400' : 'bg-[var(--text-tertiary)]'
                          }`} />
                          {disc.agents.length} agents · {disc.turns.length} turns
                        </div>
                      </div>
                      <button
                        className="hidden rounded p-0.5 text-[var(--text-tertiary)] hover:text-rose-300 group-hover:block"
                        onClick={(e) => { e.stopPropagation(); handleDeleteChain(disc.id); }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Settings tab content */}
              {activeTab === 'settings' && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Theme switcher */}
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] px-3 py-2">
                    <span className="text-[11px] text-[var(--text-secondary)]">主题</span>
                    <div className="flex gap-1 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] p-0.5">
                      {(['light', 'dark', 'auto'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setThemeMode(m)}
                          className={`rounded-md px-2 py-1 text-[10px] transition ${themeMode === m ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                        >
                          {m === 'light' ? '浅色' : m === 'dark' ? '深色' : '自动'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setApiKeysOpen(true)} className="btn btn-secondary w-full justify-start gap-2 px-3 py-2 text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                    API 密钥管理
                  </button>
                  <button onClick={() => setMcpOpen(true)} className="btn btn-secondary w-full justify-start gap-2 px-3 py-2 text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    MCP 服务配置
                  </button>
                  <button onClick={() => setPromptEngineOpen(true)} className="btn btn-secondary w-full justify-start gap-2 px-3 py-2 text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                    AI Chain 引擎
                  </button>
                  <button onClick={() => setPromptTemplatesOpen(true)} className="btn btn-secondary w-full justify-start gap-2 px-3 py-2 text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                    提示词模板
                  </button>
                  <button onClick={() => setKnowledgeBaseOpen(true)} className="btn btn-secondary w-full justify-start gap-2 px-3 py-2 text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
                    知识库管理
                  </button>
                </div>
              )}

              {/* Bottom status */}
              <div className="border-t border-[var(--border-tertiary)] px-3 py-2">
                <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${hasAnyKey ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {hasAnyKey ? "就绪" : "需配置"}
                  </span>
                  <span>{conversations.length + discussions.length} 会话</span>
                </div>
              </div>
            </>
          )}
        </div>


        {/* ═══ Main Editor Area ═══ */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
          {/* Editor top bar */}
          <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                {mode === "chat" ? (activeConv?.title || "新对话") : (activeDiscussion?.topic || "AI Chain")}
              </span>
              {mode === "chat" && activeConv && (
                <span className="text-[10px] text-[var(--text-tertiary)]">{activeConv.messages.length} 条消息</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Model picker button */}
              {mode === "chat" && (
                <div className="relative">
                  <button
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] px-2.5 py-1 text-[11px] transition hover:bg-[var(--bg-hover)]"
                  >
                    <span className={`font-bold ${PROVIDER_INFO[currentProvider].color}`}>{PROVIDER_INFO[currentProvider].icon}</span>
                    <span className="text-[var(--text-secondary)]">{currentModel}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {showModelPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]">
                        <div className="border-b border-[var(--border-tertiary)] px-3 py-2.5">
                          <div className="flex gap-2">
                            <select value={customModelInput ? "" : currentProvider} onChange={(e) => { if (e.target.value) setCurrentProvider(e.target.value as AIProvider); }} className="input w-20 flex-shrink-0 text-[10px] py-1">
                              <option value="claude">Claude</option>
                              <option value="openai">OpenAI</option>
                              <option value="gemini">Gemini</option>
                            </select>
                            <input type="text" value={customModelInput} onChange={(e) => setCustomModelInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customModelInput.trim()) { handleSelectModel(currentProvider, customModelInput.trim()); setCustomModelInput(""); } }} placeholder="自定义模型名" className="input flex-1 text-[10px] py-1" />
                          </div>
                        </div>
                        <div className="max-h-[360px] overflow-y-auto py-1">
                          {(Object.entries(MODEL_OPTIONS) as [AIProvider, string[]][]).map(([provider, models]) => {
                            const pi = PROVIDER_INFO[provider];
                            return (
                              <div key={provider} className="px-1">
                                <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--bg-elevated)] px-2 py-1.5 text-[10px] font-semibold text-[var(--text-tertiary)]">
                                  <span className={pi.color}>{pi.icon}</span>{pi.label}
                                </div>
                                {models.map((model) => {
                                  const active = currentProvider === provider && currentModel === model;
                                  return (
                                    <button key={model} onClick={() => handleSelectModel(provider, model)} className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition ${active ? "bg-[var(--brand-primary-soft)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"}`}>
                                      {model}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => setToolPanelOpen(!toolPanelOpen)}
                className={`rounded-lg border p-1.5 transition ${toolPanelOpen ? "border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[var(--text-primary)]" : "border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                title="工具面板"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
              </button>
            </div>
          </div>

          {/* Editor content + terminal */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              {/* Main chat/chain content */}
              <div className="flex-1 overflow-hidden">
                {mode === "chat" ? (
                  <ErrorBoundary>
                    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-xs text-[var(--text-tertiary)]">加载中...</div>}>
                      <ChatPanel />
                    </Suspense>
                  </ErrorBoundary>
                ) : mode === "compare" ? (
                  <ErrorBoundary>
                    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-xs text-[var(--text-tertiary)]">加载中...</div>}>
                      <ModelCompare />
                    </Suspense>
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary>
                    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-xs text-[var(--text-tertiary)]">加载中...</div>}>
                      <ChainPanel />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>

              {/* Tool panel (right side) */}
              {mode === "chat" && (
                <Suspense fallback={null}>
                  <ToolPanel
                    open={toolPanelOpen}
                    onClose={() => setToolPanelOpen(false)}
                    onSelect={(cmd: SlashCommand) => {
                      window.dispatchEvent(new CustomEvent("chainmind-slash", { detail: cmd }));
                    }}
                    activeSystemPrompt={activeConv?.systemPrompt}
                  />
                </Suspense>
              )}
            </div>

            {/* Terminal panel */}
            <TerminalPanel open={terminalOpen} onToggle={() => setTerminalOpen(!terminalOpen)} />
          </div>
        </div>
      </div>

      {/* Modal overlays */}
      <ApiKeyManager open={apiKeysOpen} onClose={() => setApiKeysOpen(false)} />
      <MCPConfigPanel open={mcpOpen} onClose={() => setMcpOpen(false)} />
      <PromptEnginePanel open={promptEngineOpen} onClose={() => setPromptEngineOpen(false)} />
      <CommandPalette
        onNewChat={() => handleNewChat()}
        onOpenSettings={() => setActiveTab('settings')}
        onToggleTerminal={() => setTerminalOpen((o) => !o)}
        onExportChat={() => {
          const conv = conversations.find((c) => c.id === activeConversationId);
          if (!conv || conv.messages.length === 0) return;
          const md = conv.messages.map((m) => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`).join('\n\n---\n\n');
          const blob = new Blob([`# ${conv.title}\n\n${md}`], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `chainmind-${conv.id}.md`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
      {showWizard && (
        <Suspense fallback={null}>
          <SetupWizard onComplete={() => setShowWizard(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <PromptTemplatePanel
          open={promptTemplatesOpen}
          onClose={() => setPromptTemplatesOpen(false)}
          onApply={(template) => {
            const conv = conversations.find(c => c.id === activeConversationId);
            if (conv) {
              useChatStore.setState(s => ({
                conversations: s.conversations.map(c =>
                  c.id === activeConversationId ? { ...c, systemPrompt: template.systemPrompt } : c
                ),
              }));
            }
            setPromptTemplatesOpen(false);
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <KnowledgeBasePanel open={knowledgeBaseOpen} onClose={() => setKnowledgeBaseOpen(false)} />
      </Suspense>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ToastProvider>
      <WorkspaceInner />
    </ToastProvider>
  );
}

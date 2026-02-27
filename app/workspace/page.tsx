"use client";

// Workspace — Cursor/OpenCode style layout: sidebar + chat/chain center + settings

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ChatPanel from '@/components/ChatPanel';
import ChainPanel from '@/components/ChainPanel';
import ToolPanel from '@/components/ToolPanel';
import ApiKeyManager from '@/components/ApiKeyManager';
import { ToastProvider, useToast } from '@/components/Toast';
import { useApiKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';
import { useChainStore } from '@/stores/chain-store';
import AuthGuard from '@/components/AuthGuard';
import type { AIProvider } from '@/lib/types';
import { MODEL_OPTIONS } from '@/lib/types';
import type { SlashCommand } from '@/lib/tools';

type WorkspaceMode = 'chat' | 'chain';

function WorkspaceInner() {
  const router = useRouter();
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>('chat');

  const loadKeys = useApiKeyStore((s) => s.loadKeys);
  const keysLoaded = useApiKeyStore((s) => s.loaded);
  const keys = useApiKeyStore((s) => s.keys);

  const {
    conversations, activeConversationId, loaded: chatLoaded,
    loadConversations, createConversation, deleteConversation, setActiveConversation,
  } = useChatStore();

  const {
    discussions, activeDiscussionId, loaded: chainLoaded,
    loadDiscussions, deleteDiscussion, setActiveDiscussion,
  } = useChainStore();

  const { toast } = useToast();

  const hasAnyKey = keys.claude !== null || keys.openai !== null || keys.gemini !== null;

  // Current provider/model for new conversations
  const [currentProvider, setCurrentProvider] = useState<AIProvider>('claude');
  const [currentModel, setCurrentModel] = useState('claude-opus-4-6');

  // Auto-sync default provider to whichever has a key configured
  useEffect(() => {
    if (!keysLoaded) return;
    if (keys.claude !== null) {
      setCurrentProvider('claude');
      setCurrentModel('claude-opus-4-6');
    } else if (keys.openai !== null) {
      setCurrentProvider('openai');
      setCurrentModel('gpt-4o');
    } else if (keys.gemini !== null) {
      setCurrentProvider('gemini');
      setCurrentModel('gemini-2.0-flash');
    }
  }, [keysLoaded, keys.claude, keys.openai, keys.gemini]);

  useEffect(() => {
    if (!keysLoaded) loadKeys();
    if (!chatLoaded) loadConversations();
    if (!chainLoaded) loadDiscussions();
  }, [keysLoaded, loadKeys, chatLoaded, loadConversations, chainLoaded, loadDiscussions]);

  // Auto-open settings if no keys configured
  useEffect(() => {
    if (keysLoaded && !hasAnyKey) {
      setApiKeysOpen(true);
    }
  }, [keysLoaded, hasAnyKey]);

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

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const PROVIDER_INFO: Record<AIProvider, { label: string; icon: string; color: string }> = {
    claude: { label: 'Claude', icon: 'C', color: 'text-orange-400' },
    openai: { label: 'OpenAI', icon: 'O', color: 'text-emerald-400' },
    gemini: { label: 'Gemini', icon: 'G', color: 'text-blue-400' },
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[var(--bg-root)]">
      {/* ===== Left Sidebar ===== */}
      <div className={`flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-secondary)] transition-all duration-200 flex-shrink-0 ${
        sidebarCollapsed ? 'w-12' : 'w-64'
      }`}>
        {/* Sidebar header */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-[var(--border-secondary)] flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold text-[10px]">C</div>
              <span className="text-xs font-bold text-[var(--text-primary)]">Chain<span className="gradient-text">Mind</span></span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="btn btn-ghost btn-icon p-1"
            title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed
                ? <><path d="M13 17l5-5-5-5" /><path d="M6 17l5-5-5-5" /></>
                : <><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></>
              }
            </svg>
          </button>
        </div>

        {/* Mode toggle tabs */}
        {!sidebarCollapsed && (
          <div className="px-2 pt-2 flex gap-1 flex-shrink-0">
            <button
              onClick={() => setMode('chat')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition ${
                mode === 'chat'
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent'
              }`}
            >
              💬 对话
            </button>
            <button
              onClick={() => setMode('chain')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition ${
                mode === 'chain'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent'
              }`}
            >
              🔗 链式讨论
            </button>
          </div>
        )}

        {/* New button */}
        <div className={`p-2 flex-shrink-0 ${sidebarCollapsed ? 'px-1.5' : ''}`}>
          {mode === 'chat' ? (
            <button
              onClick={handleNewChat}
              className={`btn btn-primary w-full text-xs py-2 ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
              title="新对话"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              {!sidebarCollapsed && <span>新对话</span>}
            </button>
          ) : (
            <button
              onClick={() => setMode('chain')}
              className={`btn w-full text-xs py-2 bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
              title="新链式讨论"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              {!sidebarCollapsed && <span>新讨论</span>}
            </button>
          )}
        </div>

        {/* List: conversations or chain discussions */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {mode === 'chat' ? (
              <>
                {conversations.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-tertiary)]">
                    <p className="text-xs">暂无对话</p>
                    <p className="text-[10px] mt-1">点击上方按钮开始</p>
                  </div>
                )}
                {conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const pi = PROVIDER_INFO[conv.provider];
                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[var(--brand-primary-light)] border border-[var(--border-hover)]'
                          : 'hover:bg-[var(--bg-hover)] border border-transparent'
                      }`}
                      onClick={() => setActiveConversation(conv.id)}
                    >
                      <span className={`text-[10px] font-bold ${pi.color} flex-shrink-0`}>{pi.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--text-primary)] truncate">{conv.title}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {conv.messages.length} 条 · {new Date(conv.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        className="hidden group-hover:block text-[var(--text-tertiary)] hover:text-red-400 transition p-0.5"
                        onClick={(e) => { e.stopPropagation(); handleDeleteChat(conv.id); }}
                        title="删除"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {discussions.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-tertiary)]">
                    <p className="text-xs">暂无链式讨论</p>
                    <p className="text-[10px] mt-1">在右侧面板创建</p>
                  </div>
                )}
                {discussions.map((disc) => {
                  const isActive = disc.id === activeDiscussionId;
                  const statusColors: Record<string, string> = {
                    idle: 'text-[var(--text-tertiary)]',
                    running: 'text-cyan-400',
                    paused: 'text-amber-400',
                    completed: 'text-emerald-400',
                    error: 'text-red-400',
                  };
                  return (
                    <div
                      key={disc.id}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? 'bg-cyan-500/10 border border-cyan-500/20'
                          : 'hover:bg-[var(--bg-hover)] border border-transparent'
                      }`}
                      onClick={() => setActiveDiscussion(disc.id)}
                    >
                      <span className="text-[10px] flex-shrink-0">🔗</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--text-primary)] truncate">{disc.title}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          <span className={statusColors[disc.status] || ''}>{disc.agents.length} 智能体</span>
                          {' · '}{disc.turns.length} 条
                        </div>
                      </div>
                      <button
                        className="hidden group-hover:block text-[var(--text-tertiary)] hover:text-red-400 transition p-0.5"
                        onClick={(e) => { e.stopPropagation(); handleDeleteChain(disc.id); }}
                        title="删除"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Sidebar footer: settings */}
        <div className={`border-t border-[var(--border-secondary)] p-2 flex-shrink-0 ${sidebarCollapsed ? 'px-1.5' : ''}`}>
          {!hasAnyKey && !sidebarCollapsed && (
            <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] text-amber-300">请先配置 API 密钥</p>
            </div>
          )}
          <button
            onClick={() => setApiKeysOpen(true)}
            className={`btn w-full text-xs py-2 ${
              hasAnyKey ? 'btn-ghost' : 'btn-ghost !text-amber-400 !border-amber-500/30 !bg-amber-500/10'
            } ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
            title="API 设置"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            {!sidebarCollapsed && <span>{hasAnyKey ? 'API 设置' : '配置密钥'}</span>}
            {!hasAnyKey && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
          </button>
          <button
            onClick={() => router.push('/admin')}
            className={`btn btn-ghost w-full text-xs py-2 mt-1 ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
            title="管理后台"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            {!sidebarCollapsed && <span>管理后台</span>}
          </button>
        </div>
      </div>

      {/* ===== Main Area ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: model selector (chat mode) or chain info */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-secondary)] bg-[var(--bg-secondary)] flex-shrink-0">
          {mode === 'chat' ? (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className="btn btn-ghost text-xs gap-1.5 px-3 py-1.5"
                >
                  <span className={`font-bold ${PROVIDER_INFO[currentProvider].color}`}>
                    {PROVIDER_INFO[currentProvider].icon}
                  </span>
                  <span className="text-[var(--text-primary)]">{currentModel}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                {/* Model picker dropdown */}
                {showModelPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                    <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                      {/* Custom model input */}
                      <div className="p-2 border-b border-[var(--border-secondary)]">
                        <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 px-1">自定义模型名称（中转API适用）</div>
                        <div className="flex gap-1.5">
                          <select
                            value={customModelInput ? '' : currentProvider}
                            onChange={(e) => { if (e.target.value) setCurrentProvider(e.target.value as AIProvider); }}
                            className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-indigo-500/50 w-20 flex-shrink-0"
                          >
                            <option value="claude">Claude</option>
                            <option value="openai">OpenAI</option>
                            <option value="gemini">Gemini</option>
                          </select>
                          <input
                            type="text"
                            value={customModelInput}
                            onChange={(e) => setCustomModelInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customModelInput.trim()) {
                                handleSelectModel(currentProvider, customModelInput.trim());
                                setCustomModelInput('');
                              }
                            }}
                            placeholder="输入模型名，如 claude-opus-4-6"
                            className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50"
                          />
                          <button
                            onClick={() => {
                              if (customModelInput.trim()) {
                                handleSelectModel(currentProvider, customModelInput.trim());
                                setCustomModelInput('');
                              }
                            }}
                            disabled={!customModelInput.trim()}
                            className="btn btn-primary text-[10px] px-2.5 py-1.5 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            使用
                          </button>
                        </div>
                      </div>
                      {/* Preset model list */}
                      <div className="max-h-72 overflow-y-auto">
                        {(Object.entries(MODEL_OPTIONS) as [AIProvider, string[]][]).map(([provider, models]) => {
                          const pi = PROVIDER_INFO[provider];
                          const hasKey = keys[provider] !== null;
                          return (
                            <div key={provider}>
                              <div className="px-3 py-1.5 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider bg-[var(--bg-primary)] flex items-center justify-between sticky top-0">
                                <span className="flex items-center gap-1.5">
                                  <span className={`font-bold ${pi.color}`}>{pi.icon}</span>
                                  {pi.label}
                                </span>
                                {!hasKey && <span className="text-amber-400">未配置密钥</span>}
                              </div>
                              {models.map((model) => (
                                <button
                                  key={model}
                                  onClick={() => handleSelectModel(provider, model)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-hover)] transition flex items-center justify-between ${
                                    currentProvider === provider && currentModel === model
                                      ? 'text-indigo-400 bg-[var(--brand-primary-light)]'
                                      : 'text-[var(--text-primary)]'
                                  }`}
                                >
                                  <span className="font-mono">{model}</span>
                                  {currentProvider === provider && currentModel === model && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                {activeConv && <span>{activeConv.messages.length} 条消息</span>}
                <button
                  onClick={() => setToolPanelOpen(!toolPanelOpen)}
                  className={`btn btn-ghost btn-icon p-1.5 ${toolPanelOpen ? 'text-indigo-400 bg-indigo-500/10' : ''}`}
                  title="工具面板"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm">🔗</span>
                <span className="text-xs font-medium text-[var(--text-primary)]">链式讨论</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">多智能体协作讨论</span>
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)]">
                {discussions.length} 个讨论
              </div>
            </>
          )}
        </div>

        {/* Main content: ChatPanel or ChainPanel */}
        {mode === 'chat' ? <ChatPanel /> : <ChainPanel />}
      </div>

      {/* Right sidebar: Tool Panel (chat mode only) */}
      {mode === 'chat' && (
        <ToolPanel
          open={toolPanelOpen}
          onClose={() => setToolPanelOpen(false)}
          onSelect={(cmd: SlashCommand) => {
            window.dispatchEvent(new CustomEvent('chainmind-slash', { detail: cmd }));
          }}
          activeSystemPrompt={activeConv?.systemPrompt}
        />
      )}

      {/* Modals */}
      <ApiKeyManager open={apiKeysOpen} onClose={() => setApiKeysOpen(false)} />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <AuthGuard>
      <ToastProvider>
        <WorkspaceInner />
      </ToastProvider>
    </AuthGuard>
  );
}

"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import { parseConfig, looksLikeConfig } from '@/lib/config-parser';
import { pickStrongestModel, fuzzyMatchModel } from '@/lib/types';
import { matchCommands, processSlashCommand, SLASH_COMMANDS, type SlashCommand } from '@/lib/tools';
import { probeModelsRequest, streamChatRequest } from '@/lib/llm-client';
import type { AIProvider, ChatMessage } from '@/lib/types';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ConfigBanner, SetupProgress } from '@/components/chat/ConfigWidgets';
import { InlineConfigForm } from '@/components/chat/InlineConfigForm';

export default function ChatPanel() {
  const { conversations, activeConversationId, addMessage, updateMessage, saveConversations, clearMessages, setSystemPrompt } = useChatStore();
  const getKey = useApiKeyStore((s) => s.getKey);
  const keys = useApiKeyStore((s) => s.keys);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);
  const saveKey = useApiKeyStore((s) => s.saveKey);
  const setBaseUrl = useApiKeyStore((s) => s.setBaseUrl);
  const createConversation = useChatStore((s) => s.createConversation);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [configDetected, setConfigDetected] = useState<ReturnType<typeof parseConfig> | null>(null);
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  const [setupSteps, setSetupSteps] = useState<{ text: string; done: boolean; error?: boolean }[]>([]);
  const [showSetup, setShowSetup] = useState(false);

  // Slash command autocomplete state
  const [slashMatches, setSlashMatches] = useState<SlashCommand[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [roleIndicator, setRoleIndicator] = useState<string | null>(null);
  const [showInlineConfig, setShowInlineConfig] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userIsNearBottomRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const hasAnyKey = keys.claude !== null || keys.openai !== null || keys.gemini !== null;

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  // Stop streaming handler
  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  // Shared streaming helper — used by both slash-command and normal message paths
  const streamChat = useCallback(async (opts: {
    convId: string;
    assistantMsgId: string;
    provider: AIProvider;
    model: string;
    apiKey: string;
    baseUrl: string | undefined;
    systemPrompt: string;
    userPrompt: string;
  }) => {
    // Abort previous stream if still running
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = performance.now();
    try {
      let streamError = '';
      let fullContent = '';
      await streamChatRequest(
        {
          provider: opts.provider,
          model: opts.model,
          apiKey: opts.apiKey,
          baseUrl: opts.baseUrl,
          systemPrompt: opts.systemPrompt,
          userPrompt: opts.userPrompt,
          temperature: 0.7,
          maxTokens: 4096,
          effort: 'medium',
          enableMetaPrompt: false,
        },
        {
          signal: controller.signal,
          onChunk: (chunk) => {
            if (chunk.type === 'text') {
              fullContent += chunk.content;
              updateMessage(opts.convId, opts.assistantMsgId, { content: fullContent });
            } else if (chunk.type === 'error') {
              streamError = chunk.content;
              updateMessage(opts.convId, opts.assistantMsgId, { error: chunk.content, isStreaming: false });
            }
          },
        }
      );

      const latencyMs = Math.round(performance.now() - startTime);
      updateMessage(opts.convId, opts.assistantMsgId, {
        content: fullContent,
        error: streamError || undefined,
        latencyMs,
        isStreaming: false,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled — mark message as stopped, keep partial content
        updateMessage(opts.convId, opts.assistantMsgId, { isStreaming: false });
      } else {
        updateMessage(opts.convId, opts.assistantMsgId, { error: String(err), isStreaming: false });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
      saveConversations();
    }
  }, [updateMessage, saveConversations]);

  // Shared helper to resolve API key — tries conversation's provider first, then all providers
  const resolveApiKey = useCallback(async (preferredProvider: AIProvider): Promise<{ provider: AIProvider; apiKey: string; baseUrl: string | undefined } | null> => {
    let apiKey = await getKey(preferredProvider);
    let provider = preferredProvider;
    let baseUrl = baseUrls[preferredProvider];

    if (!apiKey) {
      const allProviders: AIProvider[] = ['claude', 'openai', 'gemini'];
      for (const p of allProviders) {
        if (p === preferredProvider) continue;
        const k = await getKey(p);
        if (k) {
          apiKey = k;
          provider = p;
          baseUrl = baseUrls[p];
          break;
        }
      }
    }

    return apiKey ? { provider, apiKey, baseUrl } : null;
  }, [getKey, baseUrls]);

  // Track scroll position — only auto-scroll if user is near bottom
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 100;
    userIsNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (userIsNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConv?.messages, activeConv?.messages?.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [input]);

  // Detect config when input changes
  useEffect(() => {
    if (input.trim().length > 20 && looksLikeConfig(input)) {
      const parsed = parseConfig(input);
      if (parsed.apiKey) {
        setConfigDetected(parsed);
        return;
      }
    }
    setConfigDetected(null);
  }, [input]);

  // Slash command autocomplete matching
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      const matches = matchCommands(trimmed);
      setSlashMatches(matches);
      setSlashSelectedIdx(0);
    } else {
      setSlashMatches([]);
    }
  }, [input]);

  // Sync role indicator with active conversation's system prompt
  useEffect(() => {
    if (activeConv?.systemPrompt) {
      const cmd = SLASH_COMMANDS.find((c) => c.handler === 'inject' && c.payload === activeConv.systemPrompt);
      setRoleIndicator(cmd ? `${cmd.icon} ${cmd.label}` : '自定义角色');
    } else {
      setRoleIndicator(null);
    }
  }, [activeConv?.systemPrompt]);

  // Apply detected config: save key + URL, probe models, auto-select best, create conversation
  const handleApplyConfig = useCallback(async () => {
    if (!configDetected?.apiKey) return;
    setIsApplyingConfig(true);
    setShowSetup(true);
    setConfigDetected(null);

    const steps: { text: string; done: boolean; error?: boolean }[] = [
      { text: '保存 API 密钥...', done: false },
      { text: '配置中转地址...', done: false },
      { text: '探测可用模型...', done: false },
      { text: '选择最强模型...', done: false },
      { text: '创建对话...', done: false },
    ];
    setSetupSteps([...steps]);

    const provider: AIProvider = (configDetected.provider as AIProvider) || 'openai';
    const key = configDetected.apiKey;
    const url = configDetected.baseUrl || '';

    try {
      // Step 1: Save key — relay APIs use one key for all providers
      const allProviders: AIProvider[] = ['claude', 'openai', 'gemini'];
      if (url) {
        // Relay: save key + URL to ALL providers so any model works
        for (const p of allProviders) {
          await saveKey(p, key);
        }
      } else {
        await saveKey(provider, key);
      }
      steps[0].done = true;
      setSetupSteps([...steps]);

      // Step 2: Save URL
      if (url) {
        for (const p of allProviders) {
          await setBaseUrl(p, url);
        }
      }
      steps[1].done = true;
      setSetupSteps([...steps]);

      // Step 3: Probe models
      let models: string[] = [];
      if (url) {
        try {
          const data = await probeModelsRequest(url, key);
          if (data.models?.length) models = data.models;
        } catch { /* probe failed, use config model or default */ }
      }
      steps[2].done = true;
      steps[2].text = models.length > 0 ? `探测可用模型... 发现 ${models.length} 个` : '探测可用模型... 使用配置中的模型';
      setSetupSteps([...steps]);

      // Step 4: Pick best model
      let finalModel = configDetected.model || '';
      let finalProvider = provider;

      if (models.length > 0) {
        // First: fuzzy-match the parsed model name against actual relay models
        // e.g. "claude-opus-4.5-20251101" → "claude-opus-4-5-20251101"
        if (finalModel) {
          const corrected = fuzzyMatchModel(finalModel, models);
          if (corrected) {
            finalModel = corrected;
          }
        }

        // Then: pick strongest if no model was specified or fuzzy match failed
        if (!finalModel || !models.includes(finalModel)) {
          const best = pickStrongestModel(models);
          if (best && best.score > 0) {
            finalModel = best.model;
            finalProvider = best.provider;
            steps[3].text = `选择最强模型: ${best.model} (评分 ${best.score})`;
          } else if (!finalModel && models.length > 0) {
            finalModel = models[0];
          }
        } else {
          steps[3].text = `匹配模型: ${finalModel}`;
        }
      }

      if (!finalModel) {
        // Fallback defaults
        finalModel = provider === 'claude' ? 'claude-3-5-sonnet' : provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o';
      }
      steps[3].done = true;
      setSetupSteps([...steps]);

      // Step 5: Create conversation
      // If provider changed due to model detection, save key for that provider too
      if (finalProvider !== provider) {
        await saveKey(finalProvider, key);
        if (url) await setBaseUrl(finalProvider, url);
      }
      createConversation(finalProvider, finalModel);
      steps[4].done = true;
      steps[4].text = `创建对话: ${finalProvider}/${finalModel}`;
      setSetupSteps([...steps]);

      setInput('');

      // Hide setup after a moment
      setTimeout(() => {
        setShowSetup(false);
        setSetupSteps([]);
      }, 2000);
    } catch (err) {
      const failIdx = steps.findIndex((s) => !s.done);
      if (failIdx >= 0) {
        steps[failIdx].error = true;
        steps[failIdx].text += ` 失败: ${String(err).slice(0, 100)}`;
      }
      setSetupSteps([...steps]);
    } finally {
      setIsApplyingConfig(false);
    }
  }, [configDetected, saveKey, setBaseUrl, createConversation]);

  const handleDismissConfig = useCallback(() => {
    setConfigDetected(null);
  }, []);

  // Insert a slash command into the input
  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    if (cmd.handler === 'action') {
      // Execute action immediately
      if (cmd.name === '/clear' && activeConv) {
        clearMessages(activeConv.id);
        setInput('');
        setSlashMatches([]);
        return;
      }
      if (cmd.name === '/reset' && activeConv) {
        setSystemPrompt(activeConv.id, undefined);
        setInput('');
        setSlashMatches([]);
        return;
      }
    }
    if (cmd.handler === 'inject' && activeConv) {
      // Set system prompt for conversation
      setSystemPrompt(activeConv.id, cmd.payload);
      setInput('');
      setSlashMatches([]);
      // Add a system notification message
      addMessage(activeConv.id, {
        id: `msg_${Date.now()}_sys`,
        role: 'assistant',
        content: `${cmd.icon} 已切换为「${cmd.label}」模式`,
        timestamp: Date.now(),
      });
      saveConversations();
      return;
    }
    // For transform commands, insert the command prefix so user can type content after it
    setInput(cmd.name + ' ');
    setSlashMatches([]);
    textareaRef.current?.focus();
  }, [activeConv, clearMessages, setSystemPrompt, addMessage, saveConversations]);

  // Listen for slash commands dispatched from ToolPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent).detail as SlashCommand;
      if (cmd) handleSlashSelect(cmd);
    };
    window.addEventListener('chainmind-slash', handler);
    return () => window.removeEventListener('chainmind-slash', handler);
  }, [handleSlashSelect]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !activeConv) return;

    // If config is detected and user hits send, treat as dismiss + send
    setConfigDetected(null);
    setSlashMatches([]);

    const trimmedInput = input.trim();

    // Check for slash command
    const cmdResult = trimmedInput.startsWith('/') ? processSlashCommand(trimmedInput) : null;

    if (cmdResult) {
      if (cmdResult.type === 'action') {
        if (cmdResult.action === '/clear') {
          clearMessages(activeConv.id);
          setInput('');
          return;
        }
        if (cmdResult.action === '/reset') {
          setSystemPrompt(activeConv.id, cmdResult.payload || undefined);
          setInput('');
          addMessage(activeConv.id, {
            id: `msg_${Date.now()}_sys`,
            role: 'assistant',
            content: '↩️ 已重置为默认 AI 助手角色',
            timestamp: Date.now(),
          });
          saveConversations();
          return;
        }
      }
      if (cmdResult.type === 'inject') {
        setSystemPrompt(activeConv.id, cmdResult.systemPrompt);
        setInput('');
        const cmd = SLASH_COMMANDS.find((c) => c.payload === cmdResult.systemPrompt);
        addMessage(activeConv.id, {
          id: `msg_${Date.now()}_sys`,
          role: 'assistant',
          content: `${cmd?.icon || '🎭'} 已切换为「${cmd?.label || '自定义角色'}」模式`,
          timestamp: Date.now(),
        });
        saveConversations();
        return;
      }
      if (cmdResult.type === 'transform') {
        if (!cmdResult.userContent) {
          // No content provided after command — show hint
          addMessage(activeConv.id, {
            id: `msg_${Date.now()}_sys`,
            role: 'assistant',
            content: '请在命令后输入内容，例如：' + trimmedInput.split(' ')[0] + ' 你要处理的文本',
            timestamp: Date.now(),
          });
          setInput('');
          return;
        }
        // Transform: send the transformed prompt to AI
        const userMsg: ChatMessage = {
          id: `msg_${Date.now()}_u`,
          role: 'user',
          content: trimmedInput,
          timestamp: Date.now(),
        };
        addMessage(activeConv.id, userMsg);
        setInput('');
        setIsStreaming(true);
        userIsNearBottomRef.current = true;

        // Resolve API key — try conversation's provider first, then all providers (relay shares keys)
        const resolved = await resolveApiKey(activeConv.provider);
        if (!resolved) {
          setIsStreaming(false);
          setShowInlineConfig(true);
          return;
        }

        const assistantMsgId = `msg_${Date.now()}_a`;
        addMessage(activeConv.id, {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          provider: activeConv.provider,
          model: activeConv.model,
          timestamp: Date.now(),
          isStreaming: true,
        });

        await streamChat({
          convId: activeConv.id,
          assistantMsgId,
          provider: resolved.provider,
          model: activeConv.model,
          apiKey: resolved.apiKey,
          baseUrl: resolved.baseUrl,
          systemPrompt: cmdResult.systemPrompt!,
          userPrompt: cmdResult.userContent!,
        });
        return;
      }
    }

    // Normal message send (no slash command)
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
    };

    addMessage(activeConv.id, userMsg);
    setInput('');
    setIsStreaming(true);
    userIsNearBottomRef.current = true;

    // Resolve API key
    const resolved = await resolveApiKey(activeConv.provider);
    if (!resolved) {
      setIsStreaming(false);
      setShowInlineConfig(true);
      return;
    }

    const assistantMsgId = `msg_${Date.now()}_a`;
    addMessage(activeConv.id, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      provider: activeConv.provider,
      model: activeConv.model,
      timestamp: Date.now(),
      isStreaming: true,
    });

    const sysPrompt = activeConv.systemPrompt || '你是一个有帮助的AI助手。请用中文回答。';

    await streamChat({
      convId: activeConv.id,
      assistantMsgId,
      provider: resolved.provider,
      model: activeConv.model,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      systemPrompt: sysPrompt,
      userPrompt: trimmedInput,
    });
  }, [input, isStreaming, activeConv, resolveApiKey, streamChat, addMessage, clearMessages, setSystemPrompt, saveConversations]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command autocomplete navigation
    if (slashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIdx((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleSlashSelect(slashMatches[slashSelectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMatches([]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (configDetected && configDetected.apiKey) {
        handleApplyConfig();
      } else {
        handleSend();
      }
    }
  };

  // ===== No active conversation =====
  if (!activeConv) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg">
            {showSetup && setupSteps.length > 0 ? (
              <SetupProgress steps={setupSteps} />
            ) : !hasAnyKey ? (
              <InlineConfigForm onDone={() => {}} />
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-[var(--border-primary)] flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">开始新对话</h3>
                <p className="text-xs text-[var(--text-tertiary)] mb-4 leading-relaxed">
                  点击左上角「+」创建对话
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Input area — always visible, even without active conversation */}
        <div className="flex-shrink-0 border-t border-[var(--border-secondary)] p-3">
          {configDetected && configDetected.apiKey && (
            <ConfigBanner parsed={configDetected} onApply={handleApplyConfig} onDismiss={handleDismissConfig} isApplying={isApplyingConfig} />
          )}
          <div className="flex items-end gap-2 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-secondary)] px-3 py-2 focus-within:border-indigo-500/40 transition mt-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasAnyKey ? '输入消息... (Enter 发送)' : '也可以直接粘贴 API 配置文本到这里...'}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none outline-none min-h-[24px] max-h-[160px] leading-relaxed"
              rows={1}
            />
            <button
              onClick={configDetected?.apiKey ? handleApplyConfig : handleSend}
              disabled={!input.trim() || isApplyingConfig}
              className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition ${
                input.trim() && !isApplyingConfig
                  ? configDetected?.apiKey ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-indigo-500 text-white hover:bg-indigo-400'
                  : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)]'
              }`}
            >
              {configDetected?.apiKey ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Active conversation =====
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Messages area — scrollable */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {activeConv.messages.length === 0 && !showInlineConfig && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-[var(--border-primary)] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">有什么可以帮你的？</p>
              <p className="text-xs text-[var(--text-tertiary)]">当前模型: {activeConv.model}</p>
              {!hasAnyKey && (
                <button
                  onClick={() => setShowInlineConfig(true)}
                  className="mt-3 btn btn-primary text-xs px-4 py-2"
                >
                  配置 API 密钥
                </button>
              )}
            </div>
          </div>
        )}
        {showInlineConfig && (
          <div className="flex items-center justify-center py-6 min-h-[300px]">
            <InlineConfigForm onDone={() => setShowInlineConfig(false)} />
          </div>
        )}
        {activeConv.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Setup progress overlay */}
      {showSetup && setupSteps.length > 0 && (
        <SetupProgress steps={setupSteps} />
      )}

      {/* Config detection banner */}
      {configDetected && configDetected.apiKey && (
        <ConfigBanner parsed={configDetected} onApply={handleApplyConfig} onDismiss={handleDismissConfig} isApplying={isApplyingConfig} />
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[var(--border-secondary)] p-3">
        {/* Role indicator */}
        {roleIndicator && (
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[10px] text-indigo-300 font-medium">{roleIndicator}</span>
            <button
              onClick={() => { if (activeConv) { setSystemPrompt(activeConv.id, undefined); } }}
              className="text-[10px] text-[var(--text-tertiary)] hover:text-red-400 transition ml-1"
              title="重置角色"
            >
              [重置]
            </button>
          </div>
        )}

        {/* Slash command autocomplete dropdown */}
        {slashMatches.length > 0 && (
          <div className="mb-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-xl overflow-hidden animate-fade-in">
            {slashMatches.map((cmd, i) => (
              <button
                key={cmd.name}
                onClick={() => handleSlashSelect(cmd)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition ${
                  i === slashSelectedIdx
                    ? 'bg-indigo-500/15 text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-sm flex-shrink-0">{cmd.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-indigo-400">{cmd.name}</span>
                    <span className="text-xs text-[var(--text-primary)]">{cmd.label}</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{cmd.description}</p>
                </div>
                {i === slashSelectedIdx && (
                  <span className="text-[9px] text-[var(--text-tertiary)] flex-shrink-0 font-mono">Tab/Enter</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-secondary)] px-3 py-2 focus-within:border-indigo-500/40 transition">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，/ 调用命令... (Enter 发送, Shift+Enter 换行)"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none outline-none min-h-[24px] max-h-[160px] leading-relaxed"
            rows={1}
            disabled={isStreaming}
          />
          <button
            onClick={isStreaming ? stopStreaming : configDetected?.apiKey ? handleApplyConfig : handleSend}
            disabled={!isStreaming && !input.trim() && !configDetected?.apiKey}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition ${
              isStreaming
                ? 'bg-red-500/80 text-white hover:bg-red-500'
                : (input.trim() || configDetected?.apiKey)
                  ? configDetected?.apiKey ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-indigo-500 text-white hover:bg-indigo-400'
                  : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)]'
            }`}
            title={isStreaming ? '停止生成' : '发送'}
          >
            {isStreaming ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
            ) : configDetected?.apiKey ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {activeConv.provider}/{activeConv.model}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {activeConv.messages.length} 条消息
          </span>
        </div>
      </div>
    </div>
  );
}

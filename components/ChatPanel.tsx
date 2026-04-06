"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import { useMaskStore, getBuiltinMasks, type Mask } from '@/stores/mask-store';
import { parseConfig, looksLikeConfig, type ParsedConfig } from '@/lib/config-parser';
import { DEFAULT_PROVIDER_MODEL, MODEL_SPOTLIGHTS, pickStrongestModel, fuzzyMatchModel, getModelTokenProfile, formatTokenCount } from '@/lib/types';
import { matchCommands, processSlashCommand, SLASH_COMMANDS, type SlashCommand, matchColonCommands, parseColonCommand, type ColonCommand } from '@/lib/tools';
import { probeModelsRequest, streamChatRequest } from '@/lib/llm-client';
import { countTokens, estimateCost, formatCost, formatTokens } from '@/lib/token-counter';
import type { AIProvider, ChatMessage } from '@/lib/types';
import { memorySystem } from '@/lib/memory-system';
import { chatControllerPool } from '@/lib/chat-controller';
import { exportChatAsImage, exportChatAsMarkdown, downloadText } from '@/lib/chat-export';
import { searchFiles, type FileSearchResult } from '@/lib/file-indexer-client';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { TokenProgressBar } from '@/components/chat/TokenProgressBar';
import { ConfigBanner, SetupProgress } from '@/components/chat/ConfigWidgets';
import { InlineConfigForm } from '@/components/chat/InlineConfigForm';
import { useImageUpload } from '@/components/chat/ImageUpload';
import ImageUpload from '@/components/chat/ImageUpload';
import { lazy, Suspense } from 'react';
const ArtifactsPanel = lazy(() => import('@/components/chat/ArtifactsPanel'));

const STARTER_PROMPTS = [
  '先站在专业客服视角，帮我梳理需求并给我 3 个方案',
  '根据现有代码，为我设计一套更像产品的 UI 重构计划',
  '把这个需求拆成 AI 团队可并行执行的任务清单',
];

export default function ChatPanel() {
  const { conversations, activeConversationId, addMessage, updateMessage, saveConversations, clearMessages, setSystemPrompt, deleteConversation, setActiveConversation } = useChatStore();
  const getKey = useApiKeyStore((s) => s.getKey);
  const keys = useApiKeyStore((s) => s.keys);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);
  const saveKey = useApiKeyStore((s) => s.saveKey);
  const setBaseUrl = useApiKeyStore((s) => s.setBaseUrl);
  const hydrateDiscoveredModels = useApiKeyStore((s) => s.hydrateDiscoveredModels);
  const createConversation = useChatStore((s) => s.createConversation);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [configDetected, setConfigDetected] = useState<ParsedConfig | null>(null);
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  const [setupSteps, setSetupSteps] = useState<{ text: string; done: boolean; error?: boolean }[]>([]);
  const [showSetup, setShowSetup] = useState(false);

  // Slash command autocomplete state
  const [slashMatches, setSlashMatches] = useState<SlashCommand[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [roleIndicator, setRoleIndicator] = useState<string | null>(null);
  const [showInlineConfig, setShowInlineConfig] = useState(false);

  // Colon command autocomplete state
  const [colonMatches, setColonMatches] = useState<ColonCommand[]>([]);
  const [colonSelectedIdx, setColonSelectedIdx] = useState(0);

  // File reference (#) autocomplete state
  const [fileMatches, setFileMatches] = useState<FileSearchResult[]>([]);
  const [fileSelectedIdx, setFileSelectedIdx] = useState(0);
  const [fileRefContext, setFileRefContext] = useState<string>(''); // injected file content
  const [isDragOver, setIsDragOver] = useState(false);

  const { images, onAdd: addImage, onRemove: removeImage, onClear: clearImages } = useImageUpload();
  const [artifactsOpen, setArtifactsOpen] = useState(false);

  const [memoryContext, setMemoryContext] = useState<string>('');
  const [memoryCount, setMemoryCount] = useState(0);

  // Track which sibling is active for branched messages: { parentMsgId -> activeSiblingId }
  const [activeSiblings, setActiveSiblings] = useState<Record<string, string>>({});

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userIsNearBottomRef = useRef(true);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeModelProfile = getModelTokenProfile(activeConv?.model || '');
  const hasAnyKey = keys.claude !== null || keys.openai !== null || keys.gemini !== null;

  // Abort all streams on unmount
  useEffect(() => {
    return () => { chatControllerPool.abortAll(); };
  }, []);

  // Load memory system and recall context for active conversation
  useEffect(() => {
    if (!activeConv) return;
    const loadMemory = async () => {
      try {
        await memorySystem.load();
        setMemoryCount(memorySystem.size);
        // Recall memories relevant to the conversation topic
        const lastUserMsg = [...activeConv.messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          const memories = await memorySystem.recall(lastUserMsg.content, 5);
          if (memories.length > 0) {
            setMemoryContext(memorySystem.buildMemoryContext(memories));
          }
        }
      } catch (e) {
        console.warn('Memory load failed:', e);
      }
    };
    loadMemory();
  }, [activeConv?.id, activeConv?.messages?.length]);

  // Build visible messages list — handles sibling branching
  // Messages with siblingIds are grouped; only the active sibling is shown
  const visibleMessages = React.useMemo(() => {
    if (!activeConv) return [];
    const msgs = activeConv.messages;
    const seen = new Set<string>();
    const result: ChatMessage[] = [];

    for (const msg of msgs) {
      if (seen.has(msg.id)) continue;

      if (msg.siblingIds && msg.siblingIds.length > 1) {
        // This message is part of a sibling group
        const activeId = activeSiblings[msg.parentMessageId || msg.id] || msg.siblingIds[0];
        const activeSibling = msgs.find((m) => m.id === activeId) || msg;
        if (!seen.has(activeSibling.id)) {
          result.push(activeSibling);
          // Mark all siblings as seen
          for (const sid of msg.siblingIds) seen.add(sid);
        }
      } else {
        result.push(msg);
      }
      seen.add(msg.id);
    }
    return result;
  }, [activeConv, activeSiblings]);

  // Get sibling info for a message
  const getSiblingInfo = useCallback((msg: ChatMessage): { index: number; count: number } | null => {
    if (!msg.siblingIds || msg.siblingIds.length <= 1) return null;
    const idx = msg.siblingIds.indexOf(msg.id);
    return { index: idx >= 0 ? idx : 0, count: msg.siblingIds.length };
  }, []);

  // Navigate between siblings
  const handleSiblingNav = useCallback((msgId: string, direction: 'prev' | 'next') => {
    if (!activeConv) return;
    const msg = activeConv.messages.find((m) => m.id === msgId);
    if (!msg?.siblingIds || msg.siblingIds.length <= 1) return;
    const currentIdx = msg.siblingIds.indexOf(msgId);
    const newIdx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1;
    if (newIdx < 0 || newIdx >= msg.siblingIds.length) return;
    const parentKey = msg.parentMessageId || msg.id;
    setActiveSiblings((prev) => ({ ...prev, [parentKey]: msg.siblingIds![newIdx] }));
  }, [activeConv]);

  // Stop streaming handler
  const stopStreaming = useCallback(() => {
    if (activeConv) {
      chatControllerPool.abortSession(activeConv.id);
    } else {
      chatControllerPool.abortAll();
    }
    setIsStreaming(false);
  }, [activeConv]);

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
    messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
  }) => {
    // Abort previous stream if still running
    if (opts.convId) chatControllerPool.abort(opts.convId, opts.assistantMsgId);
    const controller = chatControllerPool.create(opts.convId, opts.assistantMsgId);

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
          systemPrompt: [opts.systemPrompt, memoryContext, fileRefContext].filter(Boolean).join('\n\n'),
          userPrompt: opts.userPrompt,
          messages: opts.messages,
          temperature: 0.7,
          maxTokens: 4096,
          effort: 'medium',
          enableMetaPrompt: false,
          images: images.length > 0 ? images.map(img => ({ data: img.data, mimeType: img.mimeType })) : undefined,
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
      const tokenCount = countTokens(fullContent);
      const inputTokens = countTokens(opts.userPrompt + opts.systemPrompt);
      const cost = estimateCost(opts.model, inputTokens, tokenCount);
      updateMessage(opts.convId, opts.assistantMsgId, {
        content: fullContent,
        error: streamError || undefined,
        latencyMs,
        tokenCount,
        isStreaming: false,
      });

      // Extract memories from this conversation turn
      if (fullContent && !streamError) {
        // Auto-open Artifacts panel when code blocks detected
        if (/```[\s\S]+```/.test(fullContent)) {
          setArtifactsOpen(true);
        }
        memorySystem.extractMemories(
          opts.userPrompt,
          fullContent,
          opts.convId,
          opts.apiKey,
          opts.baseUrl
        ).then((newMemories) => {
          if (newMemories.length > 0) {
            setMemoryCount(memorySystem.size);
            memorySystem.save().catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled — mark message as stopped, keep partial content
        updateMessage(opts.convId, opts.assistantMsgId, { isStreaming: false });
      } else {
        updateMessage(opts.convId, opts.assistantMsgId, { error: String(err), isStreaming: false });
      }
    } finally {
      chatControllerPool.remove(opts.convId, opts.assistantMsgId);
      setIsStreaming(false);
      saveConversations();
      clearImages();
      setFileRefContext('');
    }
  }, [updateMessage, saveConversations, clearImages, images, memoryContext, fileRefContext]);

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

  // Slash/colon/file-ref autocomplete matching
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      const matches = matchCommands(trimmed);
      setSlashMatches(matches);
      setSlashSelectedIdx(0);
      setColonMatches([]);
      setFileMatches([]);
    } else if (trimmed.startsWith(':') && !trimmed.includes(' ')) {
      const matches = matchColonCommands(trimmed);
      setColonMatches(matches);
      setColonSelectedIdx(0);
      setSlashMatches([]);
      setFileMatches([]);
    } else {
      setSlashMatches([]);
      setColonMatches([]);

      // Detect # file reference — look for # followed by text at end of input
      const hashMatch = input.match(/#(\S*)$/);
      if (hashMatch && hashMatch[1].length >= 1) {
        const query = hashMatch[1];
        // Try Electron file indexer first, fallback gracefully
        searchFiles(query, 6).then((results) => {
          setFileMatches(results);
          setFileSelectedIdx(0);
        }).catch(() => {
          setFileMatches([]);
        });
      } else {
        setFileMatches([]);
      }
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

  // Apply parsed config: save key + URL, probe models, auto-select strongest, create conversation
  const applyParsedConfig = useCallback(async (parsed: ParsedConfig) => {
    if (!parsed.apiKey) return;

    setIsApplyingConfig(true);
    setShowSetup(true);

    const steps: { text: string; done: boolean; error?: boolean }[] = [
      { text: '保存 API 密钥...', done: false },
      { text: '配置中转地址...', done: false },
      { text: '探测可用模型...', done: false },
      { text: '选择最强模型...', done: false },
      { text: '创建对话...', done: false },
    ];
    setSetupSteps([...steps]);

    const provider: AIProvider = (parsed.provider as AIProvider) || 'openai';
    const key = parsed.apiKey;
    const url = parsed.baseUrl || '';

    try {
      // Step 1: Save key — relay APIs use one key for all providers
      const allProviders: AIProvider[] = ['claude', 'openai', 'gemini'];
      if (url) {
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
          if (data.models?.length) {
            models = data.models;
            await hydrateDiscoveredModels(data.models);
          }
        } catch {
          // probe failed, use parsed model or defaults.
        }
      }
      steps[2].done = true;
      steps[2].text = models.length > 0 ? `探测可用模型... 发现 ${models.length} 个` : '探测可用模型... 使用配置中的模型';
      setSetupSteps([...steps]);

      // Step 4: Pick model
      let finalModel = parsed.model || '';
      let finalProvider = provider;

      if (models.length > 0) {
        if (finalModel) {
          const corrected = fuzzyMatchModel(finalModel, models);
          if (corrected) {
            finalModel = corrected;
          }
        }

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
        finalModel = DEFAULT_PROVIDER_MODEL[provider];
      }
      steps[3].done = true;
      setSetupSteps([...steps]);

      // Step 5: Create conversation
      if (finalProvider !== provider) {
        await saveKey(finalProvider, key);
        if (url) await setBaseUrl(finalProvider, url);
      }
      createConversation(finalProvider, finalModel);
      steps[4].done = true;
      steps[4].text = `创建对话: ${finalProvider}/${finalModel}`;
      setSetupSteps([...steps]);

      setInput('');

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
  }, [createConversation, hydrateDiscoveredModels, saveKey, setBaseUrl]);

  const handleApplyConfig = useCallback(async () => {
    if (!configDetected?.apiKey) return;
    setConfigDetected(null);
    await applyParsedConfig(configDetected);
  }, [configDetected, applyParsedConfig]);

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

  // Handle file reference selection — replace #query with file path and inject content
  const handleFileSelect = useCallback((file: FileSearchResult) => {
    const fileName = file.filePath.split('/').pop() || file.filePath;
    // Replace the #query at end of input with the file name
    const newInput = input.replace(/#\S*$/, `#${fileName} `);
    setInput(newInput);
    setFileMatches([]);
    // Accumulate file content for injection into system prompt
    const fileCtx = `\n\n--- 引用文件: ${file.filePath} (行 ${file.lineStart}-${file.lineEnd}) ---\n${file.chunk}\n---`;
    setFileRefContext((prev) => prev + fileCtx);
    textareaRef.current?.focus();
  }, [input]);

  // Execute colon command (session management actions)
  const handleColonSelect = useCallback((cmd: ColonCommand) => {
    setInput('');
    setColonMatches([]);
    const convIdx = conversations.findIndex((c) => c.id === activeConversationId);

    switch (cmd.action) {
      case 'new': {
        const provider = activeConv?.provider || 'openai';
        const model = activeConv?.model || 'gpt-4o';
        createConversation(provider, model);
        break;
      }
      case 'clear':
        if (activeConv) clearMessages(activeConv.id);
        break;
      case 'del':
        if (activeConv) deleteConversation(activeConv.id);
        break;
      case 'fork': {
        if (!activeConv) break;
        const provider = activeConv.provider;
        const model = activeConv.model;
        const newId = createConversation(provider, model);
        // Copy messages to the new conversation
        for (const msg of activeConv.messages) {
          addMessage(newId, { ...msg, id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
        }
        if (activeConv.systemPrompt) {
          setSystemPrompt(newId, activeConv.systemPrompt);
        }
        break;
      }
      case 'next': {
        if (convIdx >= 0 && convIdx < conversations.length - 1) {
          setActiveConversation(conversations[convIdx + 1].id);
        }
        break;
      }
      case 'prev': {
        if (convIdx > 0) {
          setActiveConversation(conversations[convIdx - 1].id);
        }
        break;
      }
      case 'export': {
        if (!activeConv) break;
        const md = exportChatAsMarkdown(activeConv.messages, activeConv.title);
        downloadText(md, `${activeConv.title || '对话'}.md`, 'text/markdown');
        break;
      }
      case 'search': {
        // Dispatch global search event (CommandPalette listens for this)
        window.dispatchEvent(new CustomEvent('chainmind-search'));
        break;
      }
    }
  }, [activeConv, activeConversationId, conversations, createConversation, clearMessages, deleteConversation, addMessage, setSystemPrompt, setActiveConversation]);

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
    if (!input.trim() || isStreaming) return;

    const trimmedInput = input.trim();

    // Check for colon command first
    if (trimmedInput.startsWith(':')) {
      const colonCmd = parseColonCommand(trimmedInput);
      if (colonCmd) {
        handleColonSelect(colonCmd);
        return;
      }
    }

    // Always try direct parse on send, so users can paste URL+Key and press Enter once.
    const parsedDirect = parseConfig(trimmedInput);
    const shouldAutoApplyConfig = Boolean(parsedDirect.apiKey) && (looksLikeConfig(trimmedInput) || Boolean(parsedDirect.baseUrl));
    if (shouldAutoApplyConfig) {
      setConfigDetected(null);
      setSlashMatches([]);
      await applyParsedConfig(parsedDirect);
      return;
    }

    if (!activeConv) return;

    setConfigDetected(null);
    setSlashMatches([]);

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

    // Build message history for context (exclude the empty assistant placeholder we just added)
    const history = activeConv.messages
      .filter((m) => m.id !== assistantMsgId && !m.isStreaming && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));

    await streamChat({
      convId: activeConv.id,
      assistantMsgId,
      provider: resolved.provider,
      model: activeConv.model,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      systemPrompt: sysPrompt,
      userPrompt: trimmedInput,
      messages: history,
    });
  }, [input, isStreaming, activeConv, applyParsedConfig, resolveApiKey, streamChat, addMessage, clearMessages, setSystemPrompt, saveConversations, clearImages, handleColonSelect]);

  // Drag-and-drop file handling
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Convert image to base64 and add to image upload
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            addImage({ data: reader.result, mimeType: file.type, name: file.name });
          }
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('text/') || file.name.match(/\.(ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|toml|css|html|sql|sh|bash)$/i)) {
        // Read text files and append to input
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const ext = file.name.split('.').pop() || 'txt';
            const fileContent = `\n\`\`\`${ext}\n// ${file.name}\n${reader.result}\n\`\`\`\n`;
            setInput((prev) => prev + fileContent);
          }
        };
        reader.readAsText(file);
      }
    }
  }, [addImage]);

  // Paste image handling
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            addImage({ data: reader.result, mimeType: blob.type, name: `pasted-${Date.now()}.png` });
          }
        };
        reader.readAsDataURL(blob);
        return; // only handle first image
      }
    }
  }, [addImage]);

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

    // Colon command autocomplete navigation
    if (colonMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setColonSelectedIdx((i) => (i + 1) % colonMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setColonSelectedIdx((i) => (i - 1 + colonMatches.length) % colonMatches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleColonSelect(colonMatches[colonSelectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setColonMatches([]);
        return;
      }
    }

    // File reference autocomplete navigation
    if (fileMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFileSelectedIdx((i) => (i + 1) % fileMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFileSelectedIdx((i) => (i - 1 + fileMatches.length) % fileMatches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleFileSelect(fileMatches[fileSelectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setFileMatches([]);
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
      <div className="flex min-w-0 flex-1 flex-col animate-fade-in">
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="mx-auto flex h-full w-full max-w-5xl items-start justify-center pt-4">
            {showSetup && setupSteps.length > 0 ? (
              <SetupProgress steps={setupSteps} />
            ) : showInlineConfig ? (
              <InlineConfigForm onDone={() => setShowInlineConfig(false)} />
            ) : !hasAnyKey ? (
              <div className="panel-shell grid w-full max-w-4xl gap-5 rounded-[28px] border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] p-5 md:grid-cols-[1.06fr_0.94fr] md:p-6">
                <div>
                  <div className="section-kicker">Quick bootstrap</div>
                  <h3 className="font-display mt-4 text-2xl text-[var(--text-primary)]">像发消息一样完成模型接入</h3>
                  <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                    粘贴 Base URL 和 API Key 后，ChainMind 会自动识别配置、探测模型并创建对话，不需要先跳去别的设置页绕一圈。
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="chip chip-warm">自动识别</span>
                    <span className="chip chip-cool">模型探测</span>
                    <span className="chip">立即开聊</span>
                  </div>

                  <button
                    onClick={() => setShowInlineConfig(true)}
                    className="btn btn-secondary mt-6 px-5"
                  >
                    打开手动配置表单
                  </button>
                </div>

                <div className="panel-card p-5">
                  <div className="meta-label">Paste format</div>
                  <div className="glass-light mt-4 rounded-[24px] p-4 font-mono text-xs leading-7 text-[var(--text-secondary)]">
                    base_url=https://your-proxy.com
                    <br />
                    api_key=sk-xxxxxx
                    <br />
                    model=chatgpt-5.4
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                    <div className="panel-card-muted p-4">输入区始终可见，你可以像发消息一样直接粘贴配置文本。</div>
                    <div className="panel-card-muted p-4">如果走第三方中转，系统会优先探测真实可用模型并自动纠正模型名。</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel-shell w-full max-w-3xl rounded-[28px] border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] p-5 text-center md:p-6">
                <div className="section-kicker justify-center">Session ready</div>
                <h3 className="font-display mt-4 text-2xl text-[var(--text-primary)]">模型已接通，开始你的第一条消息</h3>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                  侧边栏已经准备好模型与会话轨道。你可以直接开始单模型对话，也可以切到链式讨论让 AI 团队分工协作。
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <span className="chip chip-cool">已检测到模型密钥</span>
                  <span className="chip chip-muted">在上方控制栏切换模型</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-[var(--border-secondary)] bg-[var(--bg-primary)] px-5 py-4 backdrop-blur-xl sm:px-6">
          {configDetected && configDetected.apiKey && (
            <ConfigBanner parsed={configDetected} onApply={handleApplyConfig} onDismiss={handleDismissConfig} isApplying={isApplyingConfig} />
          )}
          <div className="mx-auto mt-2 w-full max-w-4xl rounded-[32px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] p-3 shadow-[var(--shadow-md)] backdrop-blur-2xl">
            <div className="mb-3 flex flex-wrap gap-2 px-1">
              <span className="chip chip-muted">{hasAnyKey ? '准备对话' : '粘贴配置后自动接入'}</span>
              <span className="chip chip-muted">Enter 发送</span>
            </div>

            <div className="glass-light flex items-end gap-3 rounded-[26px] border-[var(--border-secondary)] px-3 py-3 transition focus-within:border-[var(--border-primary)]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasAnyKey ? '输入消息、需求或命令...' : '也可以直接粘贴 API 配置文本到这里...'}
                className="min-h-[28px] max-h-[160px] flex-1 resize-none bg-transparent text-sm leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                rows={1}
              />
              <button
                onClick={configDetected?.apiKey ? handleApplyConfig : handleSend}
                disabled={!input.trim() || isApplyingConfig}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition ${
                  input.trim() && !isApplyingConfig
                      ? configDetected?.apiKey
                        ? 'bg-emerald-400 text-[var(--text-inverse)] hover:bg-emerald-300'
                        : 'bg-[linear-gradient(180deg,var(--brand-primary-hover),var(--brand-primary))] text-white hover:brightness-110'
                    : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)]'
                }`}
              >
                {configDetected?.apiKey ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Active conversation =====
  return (
    <div className="flex h-full">
    <div className="flex min-w-0 flex-1 flex-col animate-fade-in">
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-5 sm:px-6"
      >
        <div ref={chatMessagesRef} className="mx-auto flex h-full w-full max-w-4xl flex-col gap-5">
          {activeConv.messages.length === 0 && !showInlineConfig && (
            <div className="flex flex-1 items-start justify-center py-4">
              <div className="panel-shell w-full max-w-3xl rounded-[28px] border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] p-5 text-center md:p-6">
                <div className="section-kicker justify-center">Conversation ready</div>
                <h3 className="font-display mt-4 text-2xl text-[var(--text-primary)]">先聊，或者切到 AI 团队链路</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                  当前模型是 <span className="font-mono text-[var(--text-primary)]">{activeConv.model}</span>。
                  你可以直接提需求，也可以先用下面的起手式快速进入工作状态；如果任务更复杂，建议切到链式讨论让团队协作。
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => { setInput(prompt); setTimeout(() => { const btn = document.querySelector('[data-send-btn]') as HTMLButtonElement; btn?.click(); }, 50); }}
                      className="chip chip-muted transition hover:border-[var(--border-primary)] hover:text-[var(--text-primary)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Mask / Role presets */}
                <div className="mt-6">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">角色预设 · 一键切换</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {useMaskStore.getState().getAllMasks().slice(0, 8).map((mask) => (
                      <button
                        key={mask.id}
                        onClick={() => {
                          // Apply mask: set system prompt + inject context
                          if (activeConv) {
                            setSystemPrompt(activeConv.id, mask.systemPrompt);
                            for (const ctx of mask.context) {
                              addMessage(activeConv.id, {
                                id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                role: ctx.role,
                                content: ctx.content,
                                timestamp: Date.now(),
                              });
                            }
                            saveConversations();
                          }
                        }}
                        className="flex items-start gap-2.5 rounded-[16px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-2.5 text-left transition hover:border-[var(--border-primary)] hover:bg-[var(--brand-primary-soft)]"
                      >
                        <span className="text-lg flex-shrink-0">{mask.avatar}</span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[var(--text-primary)]">{mask.name}</div>
                          <div className="mt-0.5 text-[9px] leading-4 text-[var(--text-tertiary)] line-clamp-2">{mask.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {conversations.length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {MODEL_SPOTLIGHTS.slice(0, 4).map((item) => (
                    <div key={item.model} className="rounded-[22px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-4 py-4 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</div>
                          <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{item.model}</div>
                        </div>
                        <span className={`chip !px-2 !py-1 ${item.tier === 'free' ? 'chip-cool' : 'chip-warm'}`}>
                          {item.tier === 'free' ? '免费/低成本' : '高性能'}
                        </span>
                      </div>
                      <div className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">{item.fit}</div>
                    </div>
                  ))}
                </div>
                )}

                {!hasAnyKey && (
                  <button
                    onClick={() => setShowInlineConfig(true)}
                    className="btn btn-primary mt-6 px-5"
                  >
                    配置 API 密钥
                  </button>
                )}
              </div>
            </div>
          )}

        {showInlineConfig && (
          <div className="flex min-h-[320px] items-center justify-center py-6">
            <InlineConfigForm onDone={() => setShowInlineConfig(false)} />
          </div>
        )}
        {visibleMessages.map((msg, idx) => {
          const isLastAssistant = msg.role === 'assistant' && idx === visibleMessages.length - 1;
          const siblingInfo = getSiblingInfo(msg);
          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isLastAssistant={isLastAssistant}
              siblingIndex={siblingInfo?.index}
              siblingCount={siblingInfo?.count}
              onSiblingNav={siblingInfo ? handleSiblingNav : undefined}
              onRegenerate={msg.role === 'assistant' ? (msgId) => {
                // Find the user message before this assistant message
                const allMsgs = activeConv.messages;
                const msgIdx = allMsgs.findIndex((m) => m.id === msgId);
                const prevUserMsg = allMsgs.slice(0, msgIdx).reverse().find((m) => m.role === 'user');
                if (!prevUserMsg || !activeConv) return;

                // Create a new sibling message instead of overwriting
                const newMsgId = `msg_${Date.now()}_a`;
                const oldMsg = allMsgs.find((m) => m.id === msgId);
                const existingSiblings = oldMsg?.siblingIds || [msgId];
                const newSiblings = [...existingSiblings, newMsgId];

                // Update all existing siblings to know about the new one
                for (const sid of existingSiblings) {
                  updateMessage(activeConv.id, sid, { siblingIds: newSiblings });
                }

                // Add the new sibling message
                const parentId = oldMsg?.parentMessageId || prevUserMsg.id;
                addMessage(activeConv.id, {
                  id: newMsgId,
                  role: 'assistant',
                  content: '',
                  provider: activeConv.provider,
                  model: activeConv.model,
                  timestamp: Date.now(),
                  isStreaming: true,
                  parentMessageId: parentId,
                  siblingIds: newSiblings,
                });

                // Set the new sibling as active
                setActiveSiblings((prev) => ({ ...prev, [parentId]: newMsgId }));
                setIsStreaming(true);

                const convId = activeConv.id;
                resolveApiKey(activeConv.provider).then((resolved) => {
                  if (!resolved) return;
                  const sysPrompt = activeConv.systemPrompt || '你是一个有帮助的AI助手。请用中文回答。';
                  const history = allMsgs
                    .filter((m) => m.id !== msgId && !m.isStreaming && m.content.trim() && !(m.siblingIds && m.siblingIds.includes(msgId) && m.id !== msgId))
                    .map((m) => ({ role: m.role, content: m.content }));
                  streamChat({
                    convId, assistantMsgId: newMsgId,
                    provider: resolved.provider, model: activeConv.model,
                    apiKey: resolved.apiKey, baseUrl: resolved.baseUrl,
                    systemPrompt: sysPrompt, userPrompt: prevUserMsg.content, messages: history,
                  });
                });
              } : undefined}
              onEdit={msg.role === 'user' ? (msgId, newContent) => {
                updateMessage(activeConv.id, msgId, { content: newContent });
                saveConversations();
              } : undefined}
            />
          );
        })}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {showSetup && setupSteps.length > 0 && (
        <SetupProgress steps={setupSteps} />
      )}

      {configDetected && configDetected.apiKey && (
        <ConfigBanner parsed={configDetected} onApply={handleApplyConfig} onDismiss={handleDismissConfig} isApplying={isApplyingConfig} />
      )}

      {/* Real-time token progress bar */}
      {activeConv && activeConv.messages.length > 0 && (
        <div className="flex-shrink-0 border-t border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-5 py-1">
          <TokenProgressBar
            model={activeConv.model}
            inputTokens={activeConv.messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + (m.content?.length ? Math.ceil(m.content.length / 3) : 0), 0)}
            outputTokens={activeConv.messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + (m.tokenCount || (m.content?.length ? Math.ceil(m.content.length / 3) : 0)), 0)}
            isStreaming={isStreaming}
            latencyMs={activeConv.messages.filter((m) => m.role === 'assistant' && m.latencyMs).reduce((_, m) => m.latencyMs || 0, 0)}
          />
        </div>
      )}

      <div className="flex-shrink-0 border-t border-[var(--border-secondary)] bg-[var(--bg-primary)] px-5 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto w-full max-w-4xl">
          {roleIndicator && (
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className="chip chip-warm">{roleIndicator}</span>
              <button
                onClick={() => { if (activeConv) { setSystemPrompt(activeConv.id, undefined); } }}
                className="text-[11px] text-[var(--text-tertiary)] transition hover:text-rose-300"
                title="重置角色"
              >
                清除角色
              </button>
            </div>
          )}

          {slashMatches.length > 0 && (
            <div className="panel-shell mb-3 overflow-hidden rounded-[28px] border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] animate-fade-in">
              {slashMatches.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onClick={() => handleSlashSelect(cmd)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      i === slashSelectedIdx
                        ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                  <span className="text-lg">{cmd.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--brand-secondary)]">{cmd.name}</span>
                      <span className="text-sm text-[var(--text-primary)]">{cmd.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{cmd.description}</p>
                  </div>
                  {i === slashSelectedIdx && (
                    <span className="chip chip-muted !px-2 !py-1 font-mono">Tab</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {colonMatches.length > 0 && (
            <div className="panel-shell mb-3 overflow-hidden rounded-[28px] border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] animate-fade-in">
              {colonMatches.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onClick={() => handleColonSelect(cmd)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    i === colonSelectedIdx
                      ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <span className="text-lg">{cmd.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--brand-secondary)]">{cmd.name}</span>
                      <span className="text-sm text-[var(--text-primary)]">{cmd.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{cmd.description}</p>
                  </div>
                  {i === colonSelectedIdx && (
                    <span className="chip chip-muted !px-2 !py-1 font-mono">Tab</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {fileMatches.length > 0 && (
            <div className="panel-shell mb-3 overflow-hidden rounded-[28px] border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] animate-fade-in">
              <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">文件引用</div>
              {fileMatches.map((file, i) => {
                const fileName = file.filePath.split('/').pop() || file.filePath;
                return (
                  <button
                    key={`${file.filePath}-${file.lineStart}`}
                    onClick={() => handleFileSelect(file)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      i === fileSelectedIdx
                        ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-[var(--text-primary)]">{fileName}</div>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--text-tertiary)]">行 {file.lineStart}-{file.lineEnd} · {file.chunk.slice(0, 60)}...</p>
                    </div>
                    {i === fileSelectedIdx && (
                      <span className="chip chip-muted !px-2 !py-1 font-mono">Tab</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-[32px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] p-3 shadow-[var(--shadow-md)] backdrop-blur-2xl">
            <div className="mb-3 flex flex-wrap gap-2 px-1">
              <span className="chip chip-muted">{activeConv.provider}/{activeConv.model}</span>
              {activeModelProfile && (
                <span className="chip chip-muted hidden lg:inline-flex">
                  上下文 {formatTokenCount(activeModelProfile.contextTokens)}
                </span>
              )}
              <span className="chip chip-muted">{activeConv.messages.length} 条消息</span>
              {memoryCount > 0 && (
                <span className="chip chip-cool" title={`AI 已记住 ${memoryCount} 条关于你的信息`}>
                  🧠 {memoryCount} 记忆
                </span>
              )}
              {activeConv.messages.some(m => m.role === 'assistant' && m.content.includes('```')) && (
                <button onClick={() => setArtifactsOpen(!artifactsOpen)} className={`chip ${artifactsOpen ? 'chip-warm' : 'chip-muted'} cursor-pointer`}>
                  Artifacts
                </button>
              )}
              {activeConv.messages.length > 0 && (
                <button
                  onClick={async () => {
                    if (chatMessagesRef.current) {
                      try { await exportChatAsImage(chatMessagesRef.current, `${activeConv.title || '对话'}.png`); }
                      catch { /* fallback to markdown */ const md = exportChatAsMarkdown(activeConv.messages, activeConv.title); downloadText(md, `${activeConv.title || '对话'}.md`, 'text/markdown'); }
                    } else {
                      const md = exportChatAsMarkdown(activeConv.messages, activeConv.title);
                      downloadText(md, `${activeConv.title || '对话'}.md`, 'text/markdown');
                    }
                  }}
                  className="chip chip-muted cursor-pointer"
                  title="导出对话"
                >
                  导出
                </button>
              )}
              {fileRefContext && (
                <span className="chip chip-cool" title="已引用文件内容将注入上下文">
                  # 文件已引用
                </span>
              )}
            </div>

            <div
              className={`glass-light flex items-end gap-3 rounded-[26px] border-[var(--border-secondary)] px-3 py-3 transition focus-within:border-[var(--border-primary)] ${isDragOver ? 'ring-2 ring-[var(--brand-primary)] border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[26px] bg-[var(--brand-primary-soft)] z-10 pointer-events-none">
                  <span className="text-sm text-[var(--brand-primary)]">松开以上传文件或图片</span>
                </div>
              )}
              <ImageUpload
                images={images}
                onAdd={addImage}
                onRemove={removeImage}
                onClear={clearImages}
                disabled={isStreaming}
              />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={isStreaming ? '等待回复中... 点击右侧按钮可停止生成' : '输入消息，/ 命令，: 快捷操作，拖拽文件或粘贴图片...'}
                className="min-h-[28px] max-h-[160px] flex-1 resize-none bg-transparent text-sm leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                rows={1}
                disabled={isStreaming}
              />
              <button
                data-send-btn
                onClick={isStreaming ? stopStreaming : configDetected?.apiKey ? handleApplyConfig : handleSend}
                disabled={!isStreaming && !input.trim() && !configDetected?.apiKey}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition ${
                  isStreaming
                    ? 'bg-rose-400 text-[var(--text-inverse)] hover:bg-rose-300'
                    : (input.trim() || configDetected?.apiKey)
                      ? configDetected?.apiKey
                        ? 'bg-emerald-400 text-[var(--text-inverse)] hover:bg-emerald-300'
                        : 'bg-[linear-gradient(180deg,var(--brand-primary-hover),var(--brand-primary))] text-white hover:brightness-110'
                      : 'bg-[var(--bg-primary)] text-[var(--text-tertiary)]'
                }`}
                title={isStreaming ? '停止生成' : '发送'}
              >
                {isStreaming ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                ) : configDetected?.apiKey ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                )}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-[var(--text-tertiary)]">
              <span>Shift+Enter 换行 · / 命令 · : 快捷操作 · # 引用文件 · ⌘K 面板</span>
              <div className="flex items-center gap-3">
                {input.length > 0 && (
                  <span>{input.length} 字 · ~{formatTokens(countTokens(input))} tokens</span>
                )}
                {activeModelProfile && (
                  <span className="hidden md:inline">
                    上限 {formatTokenCount(activeModelProfile.maxInputTokens)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Suspense fallback={null}>
      <ArtifactsPanel
        messages={activeConv.messages}
        open={artifactsOpen}
        onClose={() => setArtifactsOpen(false)}
      />
    </Suspense>
    </div>
  );
}

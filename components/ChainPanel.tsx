"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChainStore } from '@/stores/chain-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import type { AIProvider, ChainAgent, ChainTurn, ChainDiscussion, AgentToolName } from '@/lib/types';
import { AGENT_PRESETS, MODEL_OPTIONS, ALL_AGENT_TOOLS, ROLE_TOOL_PRESETS, buildToolPrompt } from '@/lib/types';
import { streamChatRequest } from '@/lib/llm-client';
import { parseToolCalls, executeAllTools } from '@/lib/tool-executor';

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ===== Agent Avatar =====
function AgentAvatar({ agent, size = 'md' }: { agent: ChainAgent; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div
      className={`${s} rounded-lg flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: agent.color + '25', color: agent.color }}
    >
      {agent.icon}
    </div>
  );
}

// ===== Turn Bubble =====
function TurnBubble({ turn, agent }: { turn: ChainTurn; agent?: ChainAgent }) {
  return (
    <div className="flex gap-3 animate-fade-in">
      {agent && <AgentAvatar agent={agent} />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium" style={{ color: agent?.color || '#999' }}>
            {turn.agentName}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{turn.model}</span>
        </div>
        <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-[var(--bg-tertiary)] text-sm leading-relaxed whitespace-pre-wrap break-words text-[var(--text-primary)]">
          {turn.content}
          {turn.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
        {turn.error && <div className="mt-1 text-[10px] text-red-400">{turn.error}</div>}
        {!turn.isStreaming && turn.latencyMs > 0 && (
          <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
            {turn.tokenCount ? `${turn.tokenCount} tokens · ` : ''}{turn.latencyMs}ms
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Agent Config Card =====
function AgentCard({
  agent,
  onUpdate,
  onRemove,
}: {
  agent: ChainAgent;
  onUpdate: (a: ChainAgent) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allModels = [
    ...MODEL_OPTIONS.claude,
    ...MODEL_OPTIONS.openai,
    ...MODEL_OPTIONS.gemini,
  ];

  return (
    <div className="p-2.5 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] group">
      <div className="flex items-center gap-2">
        <AgentAvatar agent={agent} size="sm" />
        <input
          value={agent.name}
          onChange={(e) => onUpdate({ ...agent, name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-[var(--text-primary)] outline-none"
          placeholder="智能体名称"
        />
        <button onClick={() => setExpanded(!expanded)} className="btn btn-ghost btn-icon p-1 text-[10px]">
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onRemove} className="btn btn-ghost btn-icon p-1 text-red-400 opacity-0 group-hover:opacity-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2 pt-2 border-t border-[var(--border-secondary)]">
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] mb-0.5 block">模型</label>
            <select
              value={agent.model}
              onChange={(e) => onUpdate({ ...agent, model: e.target.value })}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none"
            >
              {allModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] mb-0.5 block">角色设定</label>
            <textarea
              value={agent.role}
              onChange={(e) => onUpdate({ ...agent, role: e.target.value })}
              rows={3}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none resize-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-[var(--text-tertiary)] mb-0.5 block">温度</label>
              <input
                type="number"
                min={0} max={1} step={0.1}
                value={agent.temperature}
                onChange={(e) => onUpdate({ ...agent, temperature: parseFloat(e.target.value) || 0.7 })}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-[var(--text-tertiary)] mb-0.5 block">最大Token</label>
              <input
                type="number"
                min={256} max={32768} step={256}
                value={agent.maxTokens}
                onChange={(e) => onUpdate({ ...agent, maxTokens: parseInt(e.target.value) || 4096 })}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none"
              />
            </div>
          </div>
          {/* Tool permissions per agent */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-[var(--text-tertiary)]">可用工具</label>
              {ROLE_TOOL_PRESETS[agent.name] && (
                <button
                  onClick={() => onUpdate({ ...agent, tools: [...(ROLE_TOOL_PRESETS[agent.name] || [])] })}
                  className="text-[9px] text-indigo-400 hover:text-indigo-300 transition"
                >
                  重置为预设
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_AGENT_TOOLS.map((tool) => {
                const active = agent.tools.includes(tool.name);
                return (
                  <button
                    key={tool.name}
                    onClick={() => {
                      const next = active
                        ? agent.tools.filter((t) => t !== tool.name)
                        : [...agent.tools, tool.name];
                      onUpdate({ ...agent, tools: next as AgentToolName[] });
                    }}
                    className={`px-2 py-1 rounded-md text-[10px] transition border ${
                      active
                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                        : 'bg-[var(--bg-primary)] border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:border-[var(--border-hover)]'
                    }`}
                    title={tool.description}
                  >
                    {tool.icon} {tool.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Create Discussion Dialog =====
function CreateDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (topic: string, agents: ChainAgent[], rounds: number) => void;
}) {
  const [topic, setTopic] = useState('');
  const [agents, setAgents] = useState<ChainAgent[]>(() =>
    AGENT_PRESETS.slice(0, 3).map((p) => ({ ...p, id: genId('agent') }))
  );
  const [rounds, setRounds] = useState(2);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);

  // Optimize topic prompt using AI
  const handleOptimize = useCallback(async () => {
    if (!topic.trim() || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const providers: AIProvider[] = ['claude', 'openai', 'gemini'];
      let apiKey = '';
      let provider: AIProvider = 'openai';
      let baseUrl = '';
      for (const p of providers) {
        const k = await getKey(p);
        if (k) { apiKey = k; provider = p; baseUrl = baseUrls[p]; break; }
      }
      if (!apiKey) { setIsOptimizing(false); return; }

      const optimizePrompt = `你是一位专业的提示词工程师。请优化以下需求描述，使其：
1. 更加清晰和具体，包含必要的技术细节
2. 明确期望的输出和约束条件
3. 消除歧义，补充关键上下文
4. 保持简洁，不要过度冗长

请直接输出优化后的需求描述，不要解释。

原始需求：
${topic}`;

      let result = '';
      await streamChatRequest(
        {
          provider,
          model: provider === 'claude' ? 'claude-sonnet-4-5' : 'gpt-4o',
          apiKey,
          baseUrl,
          systemPrompt: '你是提示词优化专家。',
          userPrompt: optimizePrompt,
          temperature: 0.5,
          maxTokens: 2048,
          effort: 'medium',
          enableMetaPrompt: false,
        },
        {
          onChunk: (chunk) => {
            if (chunk.type === 'text') {
              result += chunk.content;
              setTopic(result);
            }
          },
        }
      );
    } catch { /* ignore */ }
    setIsOptimizing(false);
  }, [topic, isOptimizing, getKey, baseUrls]);

  const addPreset = (preset: typeof AGENT_PRESETS[0]) => {
    setAgents([...agents, { ...preset, id: genId('agent') }]);
  };

  const updateAgent = (idx: number, a: ChainAgent) => {
    const next = [...agents];
    next[idx] = a;
    setAgents(next);
  };

  const removeAgent = (idx: number) => {
    setAgents(agents.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="w-[560px] max-h-[85vh] bg-[var(--bg-root)] border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">创建链式讨论</h2>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">多个AI智能体围绕你的需求进行多轮讨论</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon p-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Topic */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[var(--text-secondary)] font-medium">讨论主题 / 需求描述</label>
              <button
                onClick={handleOptimize}
                disabled={!topic.trim() || isOptimizing}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {isOptimizing ? (
                  <><span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> 优化中...</>
                ) : (
                  <><span>✨</span> AI优化提示词</>
                )}
              </button>
            </div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="描述你的需求，例如：设计一个高并发的订单系统，需要支持每秒10万笔交易..."
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50 resize-none"
            />
          </div>

          {/* Rounds */}
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block font-medium">讨论轮数</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 5].map((r) => (
                <button
                  key={r}
                  onClick={() => setRounds(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition ${
                    rounds === r
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {r} 轮
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">每轮所有智能体依次发言，后续轮次可看到之前的讨论内容</p>
          </div>

          {/* Agents */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[var(--text-secondary)] font-medium">参与智能体 ({agents.length})</label>
            </div>
            <div className="space-y-2">
              {agents.map((a, i) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  onUpdate={(updated) => updateAgent(i, updated)}
                  onRemove={() => removeAgent(i)}
                />
              ))}
            </div>
            {/* Add from presets */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AGENT_PRESETS.filter((p) => !agents.some((a) => a.name === p.name)).map((p) => (
                <button
                  key={p.name}
                  onClick={() => addPreset(p)}
                  className="px-2 py-1 rounded-lg text-[10px] bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-indigo-500/30 hover:text-indigo-400 transition"
                >
                  + {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-secondary)] flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {agents.length} 个智能体 · {rounds} 轮 · 预计 {agents.length * rounds} 次API调用
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-ghost text-xs px-4 py-2">取消</button>
            <button
              onClick={() => { if (topic.trim() && agents.length >= 2) onCreate(topic.trim(), agents, rounds); }}
              disabled={!topic.trim() || agents.length < 2}
              className="btn btn-primary text-xs px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              开始讨论
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Main Chain Panel =====
export default function ChainPanel() {
  const {
    discussions, activeDiscussionId, loaded,
    loadDiscussions, createDiscussion,
    addTurn, updateTurn, setDiscussionStatus, setCurrentRound, saveDiscussions,
  } = useChainStore();

  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);

  const [showCreate, setShowCreate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userIsNearBottomRef = useRef(true);

  useEffect(() => {
    if (!loaded) loadDiscussions();
  }, [loaded, loadDiscussions]);

  // Track scroll position — only auto-scroll if user is near bottom (Gemini-style)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 120;
    userIsNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (userIsNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [discussions, activeDiscussionId]);

  const activeDisc = discussions.find((d) => d.id === activeDiscussionId);

  // Get API key with provider fallback (same logic as ChatPanel)
  const getApiKeyWithFallback = useCallback(async (): Promise<{ key: string; provider: AIProvider; baseUrl: string } | null> => {
    const providers: AIProvider[] = ['claude', 'openai', 'gemini'];
    for (const p of providers) {
      const k = await getKey(p);
      if (k) return { key: k, provider: p, baseUrl: baseUrls[p] };
    }
    return null;
  }, [getKey, baseUrls]);

  // Run one agent turn
  const runAgentTurn = useCallback(async (
    disc: ChainDiscussion,
    agent: ChainAgent,
    roundNum: number,
    contextTurns: ChainTurn[],
    creds: { key: string; provider: AIProvider; baseUrl: string },
    signal: AbortSignal,
  ): Promise<ChainTurn> => {
    const turnId = genId('turn');
    const turn: ChainTurn = {
      id: turnId,
      agentId: agent.id,
      agentName: agent.name,
      model: agent.model,
      content: '',
      tokenCount: 0,
      latencyMs: 0,
      isStreaming: true,
      timestamp: Date.now(),
    };
    addTurn(disc.id, turn);

    // Build context: topic + all previous turns
    const contextStr = contextTurns.length > 0
      ? contextTurns.map((t) => `【${t.agentName}】(${t.model}):\n${t.content}`).join('\n\n---\n\n')
      : '';

    const userPrompt = contextStr
      ? `## 讨论主题\n${disc.topic}\n\n## 当前是第 ${roundNum} 轮讨论\n\n## 之前的讨论内容\n${contextStr}\n\n请基于以上讨论内容，从你的角色角度给出你的观点和建议。`
      : `## 讨论主题\n${disc.topic}\n\n这是第一轮讨论，请从你的角色角度给出你的初始观点和分析。`;

    const startTime = performance.now();

    // Inject tool descriptions into system prompt if agent has tools
    const systemPrompt = agent.tools.length > 0
      ? agent.role + buildToolPrompt(agent.tools)
      : agent.role;

    try {
      let fullContent = '';
      let streamError = '';

      await streamChatRequest(
        {
          provider: creds.provider,
          model: agent.model,
          apiKey: creds.key,
          baseUrl: creds.baseUrl,
          systemPrompt,
          userPrompt,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          effort: 'medium',
          enableMetaPrompt: false,
        },
        {
          signal,
          onChunk: (chunk) => {
            if (chunk.type === 'text' && chunk.content) {
              fullContent += chunk.content;
              updateTurn(disc.id, turnId, { content: fullContent });
            } else if (chunk.type === 'error' && chunk.content) {
              streamError = chunk.content;
            }
          },
        }
      );

      if (streamError) {
        const errorTurn = {
          ...turn,
          content: fullContent,
          error: streamError,
          isStreaming: false,
          latencyMs: Math.round(performance.now() - startTime),
        };
        updateTurn(disc.id, turnId, errorTurn);
        return errorTurn;
      }

      const latencyMs = Math.round(performance.now() - startTime);
      
      // Parse and execute tool calls from AI response
      const toolCalls = parseToolCalls(fullContent);
      if (toolCalls.length > 0 && agent.tools.length > 0) {
        updateTurn(disc.id, turnId, { content: fullContent + '\n\n⏳ 正在执行工具调用...' });
        const { summary } = await executeAllTools(fullContent, agent.tools);
        if (summary) {
          fullContent += '\n\n---\n📋 **工具执行结果**\n\n' + summary;
        }
      }

      const finalTurn: ChainTurn = { ...turn, content: fullContent, isStreaming: false, latencyMs };
      updateTurn(disc.id, turnId, { content: fullContent, isStreaming: false, latencyMs });
      return finalTurn;
    } catch (err: unknown) {
      if (signal.aborted) {
        updateTurn(disc.id, turnId, { content: turn.content || '(已中止)', isStreaming: false });
        throw err;
      }
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      updateTurn(disc.id, turnId, { error: errorMsg, isStreaming: false, latencyMs: Math.round(performance.now() - startTime) });
      return { ...turn, error: errorMsg, isStreaming: false };
    }
  }, [addTurn, updateTurn]);

  // Execute full chain discussion
  const executeChain = useCallback(async (discId: string) => {
    const disc = useChainStore.getState().discussions.find((d) => d.id === discId);
    if (!disc) return;

    const creds = await getApiKeyWithFallback();
    if (!creds) {
      setDiscussionStatus(discId, 'error');
      return;
    }

    abortRef.current = new AbortController();
    setDiscussionStatus(discId, 'running');

    try {
      const allTurns: ChainTurn[] = [];

      for (let round = 1; round <= disc.rounds; round++) {
        setCurrentRound(discId, round);

        // Sequential: each agent speaks in order, seeing all previous turns
        for (const agent of disc.agents) {
          if (abortRef.current.signal.aborted) throw new Error('aborted');

          const resultTurn = await runAgentTurn(
            disc, agent, round, allTurns, creds, abortRef.current.signal
          );
          if (!resultTurn.error) {
            allTurns.push(resultTurn);
          }
        }
      }

      setDiscussionStatus(discId, 'completed');
    } catch {
      if (abortRef.current?.signal.aborted) {
        setDiscussionStatus(discId, 'paused');
      } else {
        setDiscussionStatus(discId, 'error');
      }
    }

    saveDiscussions();
  }, [getApiKeyWithFallback, runAgentTurn, setDiscussionStatus, setCurrentRound, saveDiscussions]);

  const handleCreate = useCallback((topic: string, agents: ChainAgent[], rounds: number) => {
    const id = createDiscussion(topic.slice(0, 30), topic, agents, rounds, 'sequential');
    setShowCreate(false);
    // Start execution
    setTimeout(() => executeChain(id), 100);
  }, [createDiscussion, executeChain]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const STATUS_LABELS: Record<ChainDiscussion['status'], { text: string; color: string }> = {
    idle: { text: '待开始', color: 'text-[var(--text-tertiary)]' },
    running: { text: '讨论中', color: 'text-cyan-400' },
    paused: { text: '已暂停', color: 'text-amber-400' },
    completed: { text: '已完成', color: 'text-emerald-400' },
    error: { text: '出错', color: 'text-red-400' },
  };

  // Empty state
  if (!activeDisc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
          <span className="text-2xl">🔗</span>
        </div>
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">链式讨论</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-xs">
          创建多个AI智能体，围绕你的需求进行多轮讨论。不同角色、不同模型，碰撞出更好的方案。
        </p>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary text-xs px-5 py-2.5">
          创建链式讨论
        </button>
        {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[activeDisc.status];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-secondary)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">🔗</span>
          <div>
            <div className="text-xs font-medium text-[var(--text-primary)]">{activeDisc.topic.slice(0, 50)}{activeDisc.topic.length > 50 ? '...' : ''}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] ${statusInfo.color}`}>{statusInfo.text}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {activeDisc.agents.length} 个智能体 · 第 {activeDisc.currentRound}/{activeDisc.rounds} 轮 · {activeDisc.turns.length} 条发言
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeDisc.status === 'running' && (
            <button onClick={handleStop} className="btn btn-ghost text-xs px-3 py-1.5 text-red-400">
              停止
            </button>
          )}
          {(activeDisc.status === 'completed' || activeDisc.status === 'error' || activeDisc.status === 'paused') && (
            <button onClick={() => executeChain(activeDisc.id)} className="btn btn-ghost text-xs px-3 py-1.5 text-cyan-400">
              重新开始
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn btn-primary text-xs px-3 py-1.5">
            新讨论
          </button>
        </div>
      </div>

      {/* Agent chips */}
      <div className="px-4 py-2 border-b border-[var(--border-secondary)] flex items-center gap-2 overflow-x-auto flex-shrink-0">
        {activeDisc.agents.map((a) => (
          <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)] flex-shrink-0">
            <span className="text-xs">{a.icon}</span>
            <span className="text-[10px] text-[var(--text-primary)]">{a.name}</span>
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{a.model.split('-').slice(-2).join('-')}</span>
          </div>
        ))}
      </div>

      {/* Turns */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Topic card */}
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <div className="text-[10px] text-indigo-400 mb-1 font-medium">讨论主题</div>
          <div className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{activeDisc.topic}</div>
        </div>

        {/* Round separators + turns */}
        {(() => {
          const elements: React.ReactNode[] = [];
          let turnIdx = 0;

          for (let r = 1; r <= activeDisc.rounds; r++) {
            const roundTurns = activeDisc.turns.slice(turnIdx, turnIdx + activeDisc.agents.length);
            if (roundTurns.length === 0 && r > activeDisc.currentRound) break;

            elements.push(
              <div key={`round-${r}`} className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-[var(--border-secondary)]" />
                <span className="text-[10px] text-[var(--text-tertiary)] font-medium">第 {r} 轮</span>
                <div className="flex-1 h-px bg-[var(--border-secondary)]" />
              </div>
            );

            for (const turn of roundTurns) {
              const agent = activeDisc.agents.find((a) => a.id === turn.agentId);
              elements.push(
                <TurnBubble key={turn.id} turn={turn} agent={agent} />
              );
            }

            turnIdx += roundTurns.length;
          }

          return elements;
        })()}

        {/* Running indicator */}
        {activeDisc.status === 'running' && (
          <div className="flex items-center gap-2 py-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] text-cyan-400">讨论进行中...</span>
          </div>
        )}
      </div>

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}

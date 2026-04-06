"use client";

// ModelCompare — Side-by-side multi-model comparison
// Send the same prompt to 2-4 models simultaneously, stream responses in parallel

import React, { useState, useRef, useCallback } from 'react';
import { useApiKeyStore } from '@/stores/api-key-store';
import { streamChatRequest } from '@/lib/llm-client';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import type { AIProvider, StreamChunk } from '@/lib/types';
import { MODEL_OPTIONS, detectProvider } from '@/lib/types';

interface ModelSlot {
  id: string;
  provider: AIProvider;
  model: string;
  content: string;
  isStreaming: boolean;
  error?: string;
  tokenCount: number;
  latencyMs: number;
  vote?: 'win' | 'lose';
}

function genId() {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_MODELS = ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.0-flash'];

export default function ModelCompare() {
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('你是一个有帮助的AI助手。请用中文回答。');
  const [slots, setSlots] = useState<ModelSlot[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(DEFAULT_MODELS.slice(0, 3));
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);
  const discoveredModels = useApiKeyStore((s) => s.discoveredModels);

  const allModels = Array.from(new Set([
    ...MODEL_OPTIONS.claude, ...MODEL_OPTIONS.openai, ...MODEL_OPTIONS.gemini,
    ...discoveredModels.claude, ...discoveredModels.openai, ...discoveredModels.gemini,
  ]));

  const toggleModel = useCallback((model: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) return prev.filter((m) => m !== model);
      if (prev.length >= 4) return prev;
      return [...prev, model];
    });
  }, []);

  const runComparison = useCallback(async () => {
    if (!prompt.trim() || selectedModels.length < 2) return;
    setIsRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const initialSlots: ModelSlot[] = selectedModels.map((model) => ({
      id: genId(),
      provider: detectProvider(model),
      model,
      content: '',
      isStreaming: true,
      tokenCount: 0,
      latencyMs: 0,
    }));
    setSlots(initialSlots);

    const promises = initialSlots.map(async (slot, idx) => {
      const startTime = Date.now();
      const apiKey = await getKey(slot.provider);
      if (!apiKey) {
        setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, isStreaming: false, error: `未配置 ${slot.provider} API Key` } : s));
        return;
      }

      try {
        let tokenCount = 0;
        await streamChatRequest(
          {
            provider: slot.provider, model: slot.model,
            apiKey, baseUrl: baseUrls[slot.provider],
            systemPrompt, userPrompt: prompt.trim(),
            temperature: 0.7, maxTokens: 4096, effort: 'medium',
          },
          {
            signal: controller.signal,
            onChunk: (chunk: StreamChunk) => {
              if (chunk.type === 'text') {
                tokenCount++;
                setSlots((prev) => prev.map((s, i) =>
                  i === idx ? { ...s, content: s.content + chunk.content, tokenCount, latencyMs: Date.now() - startTime } : s
                ));
              } else if (chunk.type === 'error') {
                setSlots((prev) => prev.map((s, i) =>
                  i === idx ? { ...s, error: chunk.content, isStreaming: false } : s
                ));
              }
            },
          }
        );
        setSlots((prev) => prev.map((s, i) =>
          i === idx ? { ...s, isStreaming: false, latencyMs: Date.now() - startTime } : s
        ));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSlots((prev) => prev.map((s, i) =>
            i === idx ? { ...s, isStreaming: false, error: (err as Error).message } : s
          ));
        }
      }
    });

    await Promise.allSettled(promises);
    setIsRunning(false);
  }, [prompt, selectedModels, systemPrompt, getKey, baseUrls]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setSlots((prev) => prev.map((s) => ({ ...s, isStreaming: false })));
  }, []);

  const handleVote = useCallback((idx: number) => {
    setSlots((prev) => prev.map((s, i) => ({
      ...s,
      vote: i === idx ? 'win' : 'lose',
    })));
  }, []);

  const gridCols = slots.length <= 2 ? 'grid-cols-2' : slots.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4';

  return (
    <div className="flex min-w-0 flex-1 flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-secondary)] bg-[var(--bg-primary)] px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">模型对比</h2>
          <p className="text-[10px] text-[var(--text-tertiary)]">同一 Prompt 并发多模型，实时流式对比</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-lg border border-[var(--border-tertiary)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
          >
            {showSettings ? '收起设置' : '模型选择'}
          </button>
          <span className="text-[10px] text-[var(--text-tertiary)]">{selectedModels.length}/4 模型</span>
        </div>
      </div>

      {/* Model selector */}
      {showSettings && (
        <div className="border-b border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-5 py-3 animate-fade-in">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">选择 2-4 个模型对比</div>
          <div className="flex flex-wrap gap-1.5">
            {allModels.map((model) => (
              <button
                key={model}
                onClick={() => toggleModel(model)}
                className={`rounded-lg px-2.5 py-1 text-[10px] transition ${
                  selectedModels.includes(model)
                    ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)] border border-[var(--border-primary)]'
                    : 'text-[var(--text-tertiary)] border border-[var(--border-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comparison grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {slots.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4">⚔️</div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">模型竞技场</h3>
              <p className="mt-2 text-sm text-[var(--text-tertiary)] max-w-md">
                输入同一个 Prompt，同时发送给多个模型，实时对比它们的回答质量、速度和风格。找到最适合你的模型。
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-3 ${gridCols}`}>
            {slots.map((slot, idx) => (
              <div
                key={slot.id}
                className={`flex flex-col rounded-2xl border overflow-hidden transition ${
                  slot.vote === 'win'
                    ? 'border-[var(--status-success)] bg-[rgba(93,221,149,0.05)]'
                    : slot.vote === 'lose'
                    ? 'border-[var(--border-tertiary)] opacity-60'
                    : 'border-[var(--border-secondary)] bg-[var(--bg-secondary)]'
                }`}
              >
                {/* Slot header */}
                <div className="flex items-center justify-between border-b border-[var(--border-tertiary)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[var(--text-primary)]">{slot.model}</span>
                    {slot.isStreaming && <span className="h-2 w-2 rounded-full bg-[var(--brand-primary)] animate-pulse" />}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-[var(--text-tertiary)]">
                    {slot.tokenCount > 0 && <span>{slot.tokenCount} tok</span>}
                    {slot.latencyMs > 0 && <span>{(slot.latencyMs / 1000).toFixed(1)}s</span>}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-3 py-3 text-sm leading-7 text-[var(--text-primary)] max-h-[60vh]">
                  {slot.error ? (
                    <div className="rounded-lg bg-[rgba(251,113,133,0.08)] px-3 py-2 text-[11px] text-[#ffbeca]">{slot.error}</div>
                  ) : slot.content ? (
                    <MarkdownRenderer content={slot.content} />
                  ) : (
                    <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                      <span className="h-4 w-4 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px]">等待响应...</span>
                    </div>
                  )}
                  {slot.isStreaming && slot.content && (
                    <span className="ml-1 inline-block h-4 w-1.5 rounded-sm bg-[var(--brand-primary)] align-middle animate-pulse" />
                  )}
                </div>

                {/* Vote footer */}
                {!slot.isStreaming && slot.content && !slot.vote && (
                  <div className="border-t border-[var(--border-tertiary)] px-3 py-2 flex justify-center">
                    <button
                      onClick={() => handleVote(idx)}
                      className="rounded-lg bg-[var(--bg-tertiary)] px-4 py-1.5 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--brand-primary-soft)] hover:text-[var(--text-primary)] transition"
                    >
                      👑 选为最佳
                    </button>
                  </div>
                )}
                {slot.vote === 'win' && (
                  <div className="border-t border-[var(--status-success)] px-3 py-2 text-center text-[10px] text-[var(--status-success)]">
                    👑 最佳回答
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[var(--border-secondary)] bg-[var(--bg-primary)] px-5 py-4">
        <div className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isRunning) runComparison();
              }
            }}
            placeholder="输入 Prompt，同时发送给所有选中的模型..."
            rows={2}
            className="w-full resize-none bg-transparent text-sm leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {selectedModels.join(' vs ')}
            </span>
            {isRunning ? (
              <button onClick={handleStop} className="rounded-xl bg-rose-500/20 px-4 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/30 transition">
                停止
              </button>
            ) : (
              <button
                onClick={runComparison}
                disabled={!prompt.trim() || selectedModels.length < 2}
                className="rounded-xl bg-[var(--brand-primary)] px-4 py-1.5 text-[11px] text-white hover:bg-[var(--brand-primary-hover)] transition disabled:opacity-30"
              >
                开始对比
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from 'react';
import { useFlowStore } from '@/stores/flow-store';
import type { AIProvider, EffortLevel, AINodeData } from '@/lib/types';
import { MODEL_OPTIONS } from '@/lib/types';
import { checkTokenBudget } from '@/lib/token-manager';

type Tab = 'model' | 'prompt' | 'output';

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready',
  running: 'Running',
  success: 'Done',
  error: 'Error',
  warning: 'Warning',
};

export default function NodeConfigPanel() {
  const { nodes, selectedNodeId, updateNodeData, globalFacts, setGlobalFacts } = useFlowStore();
  const [tab, setTab] = useState<Tab>('model');
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="panel-shell flex w-80 flex-col overflow-hidden rounded-[28px] border-l border-white/8">
        <div className="border-b border-white/8 px-5 py-4">
          <div className="meta-label">Inspector</div>
          <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">节点配置面板</div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.03]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">选择一个节点开始编辑</h3>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            选中画布上的节点后，可以在这里配置模型、提示词和输出策略。
          </p>
        </div>

        <div className="border-t border-white/8 p-4">
          <label className="meta-label mb-2 block">全局知识库 (L3)</label>
          <textarea
            value={globalFacts}
            onChange={(e) => setGlobalFacts(e.target.value)}
            placeholder="全局上下文，所有节点可通过 {{global.facts}} 引用..."
            className="input text-xs"
            rows={5}
          />
        </div>
      </div>
    );
  }

  const data = selectedNode.data as AINodeData;
  const update = (partial: Partial<AINodeData>) => updateNodeData(selectedNode.id, partial);
  const budget = checkTokenBudget(data.tokenCount ?? 0, data.maxTokens);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'model', label: '模型' },
    { key: 'prompt', label: '提示词' },
    { key: 'output', label: '输出' },
  ];

  return (
    <div className="panel-shell flex w-80 flex-col overflow-hidden rounded-[28px] border-l border-white/8">
      <div className="border-b border-white/8 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="meta-label">Node inspector</div>
            <input
              type="text"
              value={data.label}
              onChange={(e) => update({ label: e.target.value })}
              className="mt-2 w-full bg-transparent p-0 text-base font-semibold text-[var(--text-primary)] outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip chip-muted">{data.provider}</span>
              <span className="chip chip-muted">{STATUS_LABELS[data.status] || data.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-white/8 px-4 py-3">
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  tab === t.key
                  ? 'border border-[var(--border-primary)] bg-[rgba(10,132,255,0.12)] text-[#d7efff]'
                  : 'border border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === 'model' && (
          <div className="space-y-4">
            <Field label="AI 提供商">
              <select
                value={data.provider}
                onChange={(e) => {
                  const p = e.target.value as AIProvider;
                  update({ provider: p, model: MODEL_OPTIONS[p][0] });
                }}
                className="input text-xs"
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini (Google)</option>
              </select>
            </Field>

            <Field label="模型">
              <select value={data.model} onChange={(e) => update({ model: e.target.value })} className="input text-xs">
                {MODEL_OPTIONS[data.provider].map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </Field>

            {data.provider === 'claude' && (
              <Field label="推理强度">
                <select value={data.effort} onChange={(e) => update({ effort: e.target.value as EffortLevel })} className="input text-xs">
                  <option value="low">低 — 快速响应</option>
                  <option value="medium">中等 — 平衡</option>
                  <option value="high">高 — 深度思考</option>
                  <option value="max">最大 — 扩展推理</option>
                </select>
              </Field>
            )}

            <Field label={`温度 ${data.temperature.toFixed(1)}`}>
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={data.temperature}
                  onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
                  className="h-1.5 w-full accent-indigo-500"
                />
                <div className="mt-2 flex justify-between text-[11px] text-[var(--text-tertiary)]">
                  <span>精确</span>
                  <span>创意</span>
                </div>
              </div>
            </Field>

            <Field label="最大输出 Tokens">
              <input type="number" value={data.maxTokens} onChange={(e) => update({ maxTokens: parseInt(e.target.value) || 1024 })} min={1} max={200000} className="input text-xs" />
            </Field>

            <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="meta-label">Token budget</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">输出长度与当前结果占比</div>
                </div>
                <span className={`chip !px-2 !py-1 ${
                  budget.level === 'critical' ? 'chip-warm !text-rose-200' :
                  budget.level === 'warning' ? 'chip-warm !text-amber-100' :
                  'chip-cool'
                }`}>
                  {budget.percentage.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full ${
                    budget.level === 'critical' ? 'bg-rose-400' :
                    budget.level === 'warning' ? 'bg-amber-300' :
                    'bg-[var(--brand-secondary)]'
                  }`}
                  style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-tertiary)]">{data.tokenCount} / {data.maxTokens}</div>
            </div>

            <label className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={data.enableMetaPrompt} onChange={(e) => update({ enableMetaPrompt: e.target.checked })} className="h-4 w-4 accent-indigo-500" />
              <span>
                元提示优化
                <span className="mt-1 block text-[11px] text-[var(--text-tertiary)]">先用轻量模型优化提示词，再正式执行。</span>
              </span>
            </label>
          </div>
        )}

        {tab === 'prompt' && (
          <div className="space-y-4">
            <Field label="系统提示词">
              <textarea value={data.systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })} rows={6} className="input text-xs" />
            </Field>

            <Field label="用户提示词模板">
              <textarea value={data.userPromptTemplate} onChange={(e) => update({ userPromptTemplate: e.target.value })} rows={6} className="input text-xs" />
              <div className="mt-3 flex flex-wrap gap-2">
                {['{{prev.output}}', '{{user.input}}', '{{global.facts}}', '{{node.label}}'].map((v) => (
                  <button key={v} onClick={() => update({ userPromptTemplate: data.userPromptTemplate + v })} className="chip chip-muted transition hover:border-[var(--border-primary)] hover:text-[var(--text-primary)]">
                    {v}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="全局知识库 (L3)">
              <textarea value={globalFacts} onChange={(e) => setGlobalFacts(e.target.value)} rows={5} placeholder="所有节点共享的上下文..." className="input text-xs" />
            </Field>
          </div>
        )}

        {tab === 'output' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-tertiary)]">
              {(data.tokenCount ?? 0) > 0 && <span className="chip chip-muted">{data.tokenCount} tokens</span>}
              {(data.latencyMs ?? 0) > 0 && <span className="chip chip-muted">{data.latencyMs}ms</span>}
              <span className="chip chip-muted">{STATUS_LABELS[data.status] || data.status}</span>
            </div>

            {data.output ? (
              <div className="rounded-[22px] border border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.06)] p-4 font-mono text-[12px] leading-7 text-emerald-100 whitespace-pre-wrap max-h-[420px] overflow-y-auto">
                {data.output}
              </div>
            ) : data.error ? (
              <div className="rounded-[22px] border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] p-4 text-[12px] leading-7 text-[#ffbeca] whitespace-pre-wrap">
                {data.error}
              </div>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] text-center text-sm text-[var(--text-tertiary)]">
                执行流水线后，这里会展示该节点的输出结果。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="meta-label mb-2 block">{label}</label>
      {children}
    </div>
  );
}

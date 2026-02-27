"use client";

import React, { useState } from 'react';
import { useFlowStore } from '@/stores/flow-store';
import type { AIProvider, EffortLevel, AINodeData } from '@/lib/types';
import { MODEL_OPTIONS } from '@/lib/types';
import { checkTokenBudget } from '@/lib/token-manager';

type Tab = 'model' | 'prompt' | 'output';

export default function NodeConfigPanel() {
  const { nodes, selectedNodeId, updateNodeData, globalFacts, setGlobalFacts } = useFlowStore();
  const [tab, setTab] = useState<Tab>('model');
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="w-80 bg-[var(--bg-secondary)] border-l border-[var(--border-secondary)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-secondary)]">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">配置面板</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-1">点击节点进行配置</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">选中画布上的节点查看详细设置</p>
        </div>
        <div className="p-4 border-t border-[var(--border-secondary)]">
          <label className="block text-[10px] text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">全局知识库 (L3)</label>
          <textarea
            value={globalFacts}
            onChange={(e) => setGlobalFacts(e.target.value)}
            placeholder="全局上下文，所有节点可通过 {{global.facts}} 引用..."
            className="input text-xs"
            rows={4}
          />
        </div>
      </div>
    );
  }

  const data = selectedNode.data as AINodeData;
  const update = (partial: Partial<AINodeData>) => updateNodeData(selectedNode.id, partial);
  const budget = checkTokenBudget(data.tokenCount, data.maxTokens);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'model', label: '模型' },
    { key: 'prompt', label: '提示词' },
    { key: 'output', label: '输出' },
  ];

  return (
    <div className="w-80 bg-[var(--bg-secondary)] border-l border-[var(--border-secondary)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-secondary)]">
        <input
          type="text"
          value={data.label}
          onChange={(e) => update({ label: e.target.value })}
          className="text-sm font-semibold text-[var(--text-primary)] bg-transparent border-none outline-none w-full p-0 focus:ring-0"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-secondary)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium transition-all ${
              tab === t.key
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-[var(--brand-primary-light)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'model' && (
          <>
            <Field label="AI 提供商">
              <select value={data.provider} onChange={(e) => { const p = e.target.value as AIProvider; update({ provider: p, model: MODEL_OPTIONS[p][0] }); }} className="input text-xs">
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

            <Field label={`温度: ${data.temperature.toFixed(1)}`}>
              <input type="range" min="0" max="2" step="0.1" value={data.temperature} onChange={(e) => update({ temperature: parseFloat(e.target.value) })} className="w-full accent-indigo-500 h-1.5" />
              <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mt-0.5">
                <span>精确</span><span>创意</span>
              </div>
            </Field>

            <Field label="最大输出 Tokens">
              <input type="number" value={data.maxTokens} onChange={(e) => update({ maxTokens: parseInt(e.target.value) || 1024 })} min={1} max={200000} className="input text-xs" />
            </Field>

            {data.tokenCount > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--text-tertiary)]">Token 使用量</span>
                  <span className={budget.level === 'critical' ? 'text-red-400' : budget.level === 'warning' ? 'text-amber-400' : 'text-green-400'}>
                    {budget.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${budget.level === 'critical' ? 'bg-red-500' : budget.level === 'warning' ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(budget.percentage, 100)}%` }} />
                </div>
                <div className="text-[9px] text-[var(--text-tertiary)]">{data.tokenCount} / {data.maxTokens}</div>
              </div>
            )}

            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)]">
              <input type="checkbox" id="metaPrompt" checked={data.enableMetaPrompt} onChange={(e) => update({ enableMetaPrompt: e.target.checked })} className="accent-indigo-500 w-3.5 h-3.5" />
              <label htmlFor="metaPrompt" className="text-xs text-[var(--text-secondary)] cursor-pointer">
                元提示优化
                <span className="block text-[9px] text-[var(--text-tertiary)] mt-0.5">先用轻量模型优化提示词</span>
              </label>
            </div>
          </>
        )}

        {tab === 'prompt' && (
          <>
            <Field label="系统提示词">
              <textarea value={data.systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })} rows={5} className="input text-xs" />
            </Field>

            <Field label="用户提示词模板">
              <textarea value={data.userPromptTemplate} onChange={(e) => update({ userPromptTemplate: e.target.value })} rows={5} className="input text-xs" />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['{{prev.output}}', '{{user.input}}', '{{global.facts}}', '{{node.label}}'].map((v) => (
                  <button key={v} onClick={() => update({ userPromptTemplate: data.userPromptTemplate + v })} className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition">
                    {v}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="全局知识库 (L3)">
              <textarea value={globalFacts} onChange={(e) => setGlobalFacts(e.target.value)} rows={3} placeholder="所有节点共享的上下文..." className="input text-xs" />
            </Field>
          </>
        )}

        {tab === 'output' && (
          <>
            {data.output ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                  {data.tokenCount > 0 && <span>{data.tokenCount} tokens</span>}
                  {data.latencyMs > 0 && <><span>&middot;</span><span>{data.latencyMs}ms</span></>}
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-xs text-green-300/90 whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                  {data.output}
                </div>
              </div>
            ) : data.error ? (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-red-400 whitespace-pre-wrap">
                {data.error}
              </div>
            ) : (
              <div className="text-center py-10 text-[var(--text-tertiary)]">
                <p className="text-sm mb-1">暂无输出</p>
                <p className="text-[10px]">执行流水线后查看结果</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider font-medium">{label}</label>
      {children}
    </div>
  );
}

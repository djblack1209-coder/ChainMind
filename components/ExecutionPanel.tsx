"use client";

import React, { useState } from 'react';
import { useFlowStore } from '@/stores/flow-store';
import type { AINodeData } from '@/lib/types';

type PanelTab = 'output' | 'log';

export default function ExecutionPanel() {
  const { nodes, selectedNodeId } = useFlowStore();
  const [tab, setTab] = useState<PanelTab>('output');
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const hasAnyOutput = nodes.some((n) => (n.data as AINodeData).output || (n.data as AINodeData).error);

  if (!hasAnyOutput && !selectedNode) return null;

  const data = selectedNode?.data as AINodeData | undefined;

  return (
    <div className="panel-shell mt-3 flex h-[248px] flex-shrink-0 flex-col overflow-hidden rounded-[28px] animate-slide-up">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          {(['output', 'log'] as PanelTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                tab === t
                  ? 'border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[#ffc4b1]'
                  : 'border border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]'
              }`}
            >
              {t === 'output' ? '节点输出' : '执行概览'}
            </button>
          ))}
        </div>

        {data && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            <span className="chip chip-muted !px-2 !py-1">{data.label}</span>
            {(data.tokenCount ?? 0) > 0 && <span className="chip chip-muted !px-2 !py-1">{data.tokenCount} tokens</span>}
            {(data.latencyMs ?? 0) > 0 && <span className="chip chip-muted !px-2 !py-1">{data.latencyMs}ms</span>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === 'output' && (
          <>
            {data?.error ? (
              <div className="rounded-[22px] border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] p-4 font-mono text-[12px] leading-7 text-[#ffbeca] whitespace-pre-wrap">
                {data.error}
              </div>
            ) : data?.output ? (
              <div className="rounded-[22px] border border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.06)] p-4 font-mono text-[12px] leading-7 text-emerald-100 whitespace-pre-wrap">
                {data.output}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] text-sm text-[var(--text-tertiary)]">
                {selectedNode ? '该节点暂无输出' : '选择一个节点查看输出'}
              </div>
            )}
          </>
        )}

        {tab === 'log' && (
          <div className="space-y-2">
            {nodes.filter((n) => (n.data as AINodeData).status !== 'idle').length === 0 ? (
              <div className="flex h-full min-h-[130px] items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] text-sm text-[var(--text-tertiary)]">
                尚未执行
              </div>
            ) : (
              nodes.map((n) => {
                const nd = n.data as AINodeData;
                if (nd.status === 'idle') return null;

                return (
                  <div key={n.id} className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-[11px] font-mono">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      nd.status === 'success' ? 'bg-emerald-300' :
                      nd.status === 'error' ? 'bg-rose-300' :
                      nd.status === 'running' ? 'bg-[var(--brand-secondary)] animate-pulse' :
                      'bg-white/30'
                    }`} />
                    <span className="w-28 truncate text-[var(--text-secondary)]">{nd.label}</span>
                    <span className="text-[var(--text-tertiary)]">{nd.model.split('-').slice(0, 2).join('-')}</span>
                    {(nd.tokenCount ?? 0) > 0 && <span className="text-[var(--text-tertiary)]">{nd.tokenCount}t</span>}
                    {(nd.latencyMs ?? 0) > 0 && <span className="text-[var(--text-tertiary)]">{nd.latencyMs}ms</span>}
                    {nd.error && <span className="min-w-0 flex-1 truncate text-[#ffbeca]">{nd.error.slice(0, 72)}</span>}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

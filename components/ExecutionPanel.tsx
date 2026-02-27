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
    <div className="h-44 bg-[var(--bg-secondary)] border-t border-[var(--border-secondary)] flex flex-col flex-shrink-0 animate-slide-up" style={{ animationDuration: '0.2s' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-secondary)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-0.5">
          {(['output', 'log'] as PanelTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all ${
                tab === t
                  ? 'text-indigo-300 bg-[var(--brand-primary-light)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t === 'output' ? '节点输出' : '执行概览'}
            </button>
          ))}
        </div>

        {data && (
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
            <span className="font-medium text-[var(--text-secondary)]">{data.label}</span>
            {data.tokenCount > 0 && <span>{data.tokenCount} tokens</span>}
            {data.latencyMs > 0 && <span>{data.latencyMs}ms</span>}
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
              data.status === 'success' ? 'bg-green-500/15 text-green-400' :
              data.status === 'error' ? 'bg-red-500/15 text-red-400' :
              data.status === 'running' ? 'bg-indigo-500/15 text-indigo-400' :
              'bg-gray-500/15 text-gray-400'
            }`}>
              {data.status === 'success' ? '完成' : data.status === 'error' ? '错误' : data.status === 'running' ? '运行中' : '就绪'}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {tab === 'output' && (
          <>
            {data?.error ? (
              <pre className="text-xs text-red-400/90 whitespace-pre-wrap font-mono leading-relaxed">{data.error}</pre>
            ) : data?.output ? (
              <pre className="text-xs text-green-300/80 whitespace-pre-wrap font-mono leading-relaxed">{data.output}</pre>
            ) : (
              <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">
                {selectedNode ? '该节点暂无输出' : '选择一个节点查看输出'}
              </div>
            )}
          </>
        )}

        {tab === 'log' && (
          <div className="space-y-0.5">
            {nodes.filter((n) => (n.data as AINodeData).status !== 'idle').length === 0 ? (
              <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">尚未执行</div>
            ) : (
              nodes.map((n) => {
                const nd = n.data as AINodeData;
                if (nd.status === 'idle') return null;
                return (
                  <div key={n.id} className="flex items-center gap-2 py-1 text-[10px] font-mono">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      nd.status === 'success' ? 'bg-green-400' :
                      nd.status === 'error' ? 'bg-red-400' :
                      nd.status === 'running' ? 'bg-indigo-400 animate-pulse' :
                      'bg-gray-400'
                    }`} />
                    <span className="text-[var(--text-secondary)] w-28 truncate">{nd.label}</span>
                    <span className="text-[var(--text-tertiary)]">{nd.model.split('-').slice(0, 2).join('-')}</span>
                    {nd.tokenCount > 0 && <span className="text-[var(--text-tertiary)]">{nd.tokenCount}t</span>}
                    {nd.latencyMs > 0 && <span className="text-[var(--text-tertiary)]">{nd.latencyMs}ms</span>}
                    {nd.error && <span className="text-red-400 truncate flex-1">{nd.error.slice(0, 60)}</span>}
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

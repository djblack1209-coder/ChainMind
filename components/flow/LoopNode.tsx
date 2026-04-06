"use client";

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useFlowStore } from '@/stores/flow-store';

export interface LoopNodeData {
  label: string;
  mode: 'sequential' | 'parallel';
  maxIterations: number;
  itemVariable: string;
  status: 'idle' | 'running' | 'success' | 'error';
  currentIteration?: number;
  totalItems?: number;
  error?: string;
}

export const DEFAULT_LOOP_DATA: LoopNodeData = {
  label: '循环执行',
  mode: 'sequential',
  maxIterations: 50,
  itemVariable: 'item',
  status: 'idle',
};

const STATUS_COLORS = {
  idle: { border: 'border-white/8', dot: 'bg-white/20', text: 'Ready' },
  running: { border: 'border-[rgba(168,85,247,0.4)]', dot: 'bg-purple-400 animate-pulse', text: 'Looping' },
  success: { border: 'border-[rgba(74,222,128,0.24)]', dot: 'bg-emerald-300', text: 'Done' },
  error: { border: 'border-[rgba(251,113,133,0.24)]', dot: 'bg-rose-300', text: 'Error' },
};

function LoopNodeComponent({ id, data, selected }: NodeProps<LoopNodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const status = STATUS_COLORS[data.status] || STATUS_COLORS.idle;

  return (
    <div
      className={`relative w-[268px] rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.86))] transition-all duration-200 backdrop-blur-2xl ${status.border} ${selected ? 'ring-2 ring-[rgba(168,85,247,0.3)]' : 'shadow-[var(--shadow-sm)]'}`}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} id="items" className="!h-3 !w-3 !-top-[6px] !border-2 !border-[var(--bg-secondary)] !bg-purple-400" />

      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10 text-base">
          🔄
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{data.label}</div>
          <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            {data.mode === 'parallel' ? '并行' : '顺序'} · max {data.maxIterations}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)] border border-white/8">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.text}
          </div>
          <button
            className="rounded-lg p-1 text-[var(--text-tertiary)] transition hover:bg-red-500/10 hover:text-rose-300"
            onClick={(e) => { e.stopPropagation(); removeNode(id); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="space-y-2 px-4 py-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          <span className="text-purple-300">for</span> {data.itemVariable} <span className="text-purple-300">in</span> items
        </div>

        {data.status === 'running' && data.currentIteration != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Progress</span>
              <span>{data.currentIteration}/{data.totalItems || '?'}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-400 transition-all"
                style={{ width: `${data.totalItems ? (data.currentIteration / data.totalItems) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {data.error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200 line-clamp-2">
            {data.error}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="results" className="!h-3 !w-3 !-bottom-[6px] !border-2 !border-[var(--bg-secondary)] !bg-purple-400" />
    </div>
  );
}

export default memo(LoopNodeComponent);

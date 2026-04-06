"use client";

import React, { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useFlowStore } from '@/stores/flow-store';
import type { ConditionMode } from '@/lib/flow-variables';

export interface ConditionNodeData {
  label: string;
  mode: ConditionMode;
  pattern: string;
  llmPrompt: string;
  status: 'idle' | 'running' | 'success' | 'error';
  result?: 'true' | 'false';
  reason?: string;
  error?: string;
}

export const DEFAULT_CONDITION_DATA: ConditionNodeData = {
  label: '条件判断',
  mode: 'contains',
  pattern: '',
  llmPrompt: '判断以下内容是否满足条件，回答 true 或 false：',
  status: 'idle',
};

const MODE_LABELS: Record<ConditionMode, string> = {
  contains: '包含匹配',
  regex: '正则匹配',
  llm_judge: 'LLM 判断',
};

const STATUS_COLORS = {
  idle: { border: 'border-white/8', dot: 'bg-white/20', text: 'Ready' },
  running: { border: 'border-[rgba(245,158,11,0.34)]', dot: 'bg-amber-400 animate-pulse', text: 'Evaluating' },
  success: { border: 'border-[rgba(74,222,128,0.24)]', dot: 'bg-emerald-300', text: 'Done' },
  error: { border: 'border-[rgba(251,113,133,0.24)]', dot: 'bg-rose-300', text: 'Error' },
};

function ConditionNodeComponent({ id, data, selected }: NodeProps<ConditionNodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const status = STATUS_COLORS[data.status] || STATUS_COLORS.idle;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`relative w-[268px] rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.86))] transition-all duration-200 backdrop-blur-2xl ${status.border} ${selected ? 'ring-2 ring-[rgba(245,158,11,0.3)]' : 'shadow-[var(--shadow-sm)]'}`}
      onClick={() => setSelectedNode(id)}
    >
      {/* Input handle - top center */}
      <Handle type="target" position={Position.Top} id="value" className="!h-3 !w-3 !-top-[6px] !border-2 !border-[var(--bg-secondary)] !bg-amber-400" />

      {/* Header */}
      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-base font-bold text-amber-200">
          ⑂
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{data.label}</div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{MODE_LABELS[data.mode]}</div>
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

      {/* Body */}
      <div className="space-y-2 px-4 py-3">
        {data.mode !== 'llm_judge' && data.pattern && (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)] truncate">
            {data.mode === 'regex' ? `/${data.pattern}/` : `"${data.pattern}"`}
          </div>
        )}

        {data.result && (
          <button
            className="w-full text-left"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <div className={`rounded-xl border px-3 py-2 text-[11px] ${data.result === 'true' ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-200' : 'border-rose-500/20 bg-rose-500/8 text-rose-200'}`}>
              <span className="font-semibold">{data.result === 'true' ? '✓ True' : '✗ False'}</span>
              {expanded && data.reason && <div className="mt-1 text-[10px] opacity-70">{data.reason}</div>}
            </div>
          </button>
        )}

        {data.error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200 line-clamp-2">
            {data.error}
          </div>
        )}

        {/* Branch labels */}
        <div className="flex justify-between pt-1 text-[10px] font-medium">
          <span className="text-emerald-300/70">True ↓</span>
          <span className="text-rose-300/70">↓ False</span>
        </div>
      </div>

      {/* Output handles - true (left-bottom), false (right-bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!h-3 !w-3 !-bottom-[6px] !left-[30%] !border-2 !border-[var(--bg-secondary)] !bg-emerald-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!h-3 !w-3 !-bottom-[6px] !left-[70%] !border-2 !border-[var(--bg-secondary)] !bg-rose-400"
      />
    </div>
  );
}

export default memo(ConditionNodeComponent);

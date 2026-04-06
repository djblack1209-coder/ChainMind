"use client";

import React, { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useFlowStore } from '@/stores/flow-store';

export interface CodeNodeData {
  label: string;
  language: 'javascript' | 'python';
  code: string;
  status: 'idle' | 'running' | 'success' | 'error';
  output?: string;
  error?: string;
}

export const DEFAULT_CODE_DATA: CodeNodeData = {
  label: '代码执行',
  language: 'javascript',
  code: '// input available as `data`\nreturn data;',
  status: 'idle',
};

const STATUS_COLORS = {
  idle: { border: 'border-white/8', dot: 'bg-white/20', text: 'Ready' },
  running: { border: 'border-[rgba(100,116,139,0.4)]', dot: 'bg-slate-400 animate-pulse', text: 'Running' },
  success: { border: 'border-[rgba(74,222,128,0.24)]', dot: 'bg-emerald-300', text: 'Done' },
  error: { border: 'border-[rgba(251,113,133,0.24)]', dot: 'bg-rose-300', text: 'Error' },
};

function CodeNodeComponent({ id, data, selected }: NodeProps<CodeNodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const status = STATUS_COLORS[data.status] || STATUS_COLORS.idle;
  const [expanded, setExpanded] = useState(false);
  const lines = data.code.split('\n').length;

  return (
    <div
      className={`relative w-[268px] rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.86))] transition-all duration-200 backdrop-blur-2xl ${status.border} ${selected ? 'ring-2 ring-[rgba(100,116,139,0.4)]' : 'shadow-[var(--shadow-sm)]'}`}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} id="data" className="!h-3 !w-3 !-top-[6px] !border-2 !border-[var(--bg-secondary)] !bg-slate-400" />

      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-500/20 bg-slate-500/10 text-sm font-bold text-slate-200">
          {'{ }'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{data.label}</div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{data.language} · {lines} lines</div>
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
        <button
          className="w-full text-left rounded-xl border border-white/8 bg-black/30 px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? (
            <pre className="whitespace-pre-wrap max-h-[120px] overflow-y-auto">{data.code}</pre>
          ) : (
            <div className="truncate">{data.code.split('\n')[0]}</div>
          )}
        </button>

        {data.output && data.status === 'success' && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-200 line-clamp-3 font-mono">
            {data.output}
          </div>
        )}

        {data.error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200 line-clamp-2">
            {data.error}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="result" className="!h-3 !w-3 !-bottom-[6px] !border-2 !border-[var(--bg-secondary)] !bg-slate-400" />
    </div>
  );
}

export default memo(CodeNodeComponent);

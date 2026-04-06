"use client";

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useFlowStore } from '@/stores/flow-store';

export interface HttpRequestNodeData {
  label: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: string;
  body: string;
  timeout: number;
  status: 'idle' | 'running' | 'success' | 'error';
  responseStatus?: number;
  output?: string;
  error?: string;
}

export const DEFAULT_HTTP_REQUEST_DATA: HttpRequestNodeData = {
  label: 'HTTP 请求',
  method: 'GET',
  url: 'https://api.example.com/data',
  headers: '{"Content-Type": "application/json"}',
  body: '',
  timeout: 10000,
  status: 'idle',
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10',
  POST: 'text-blue-300 border-blue-500/20 bg-blue-500/10',
  PUT: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
  PATCH: 'text-orange-300 border-orange-500/20 bg-orange-500/10',
  DELETE: 'text-rose-300 border-rose-500/20 bg-rose-500/10',
};

const STATUS_COLORS = {
  idle: { border: 'border-white/8', dot: 'bg-white/20', text: 'Ready' },
  running: { border: 'border-[rgba(59,130,246,0.4)]', dot: 'bg-blue-400 animate-pulse', text: 'Fetching' },
  success: { border: 'border-[rgba(74,222,128,0.24)]', dot: 'bg-emerald-300', text: 'Done' },
  error: { border: 'border-[rgba(251,113,133,0.24)]', dot: 'bg-rose-300', text: 'Error' },
};

function HttpRequestNodeComponent({ id, data, selected }: NodeProps<HttpRequestNodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const status = STATUS_COLORS[data.status] || STATUS_COLORS.idle;
  const methodStyle = METHOD_COLORS[data.method] || METHOD_COLORS.GET;

  return (
    <div
      className={`relative w-[268px] rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.86))] transition-all duration-200 backdrop-blur-2xl ${status.border} ${selected ? 'ring-2 ring-[rgba(59,130,246,0.3)]' : 'shadow-[var(--shadow-sm)]'}`}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} id="url" className="!h-3 !w-3 !-top-[6px] !border-2 !border-[var(--bg-secondary)] !bg-blue-400" />

      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-base">
          🌐
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{data.label}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${methodStyle}`}>{data.method}</span>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)] truncate max-w-[120px]">{data.url.replace(/^https?:\/\//, '')}</span>
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
        {data.responseStatus && data.status === 'success' && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-200">
            Status: {data.responseStatus}
          </div>
        )}
        {data.error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200 line-clamp-2">
            {data.error}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="response" className="!h-3 !w-3 !-bottom-[6px] !left-[30%] !border-2 !border-[var(--bg-secondary)] !bg-blue-400" />
      <Handle type="source" position={Position.Bottom} id="status" className="!h-3 !w-3 !-bottom-[6px] !left-[70%] !border-2 !border-[var(--bg-secondary)] !bg-slate-400" />
    </div>
  );
}

export default memo(HttpRequestNodeComponent);

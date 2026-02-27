"use client";

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { AINodeData } from '@/lib/types';
import { useFlowStore } from '@/stores/flow-store';

const STATUS_STYLES: Record<string, { border: string; glow: string; badge: string; badgeText: string }> = {
  idle: { border: 'border-[var(--border-primary)]', glow: '', badge: 'bg-gray-500/20 text-gray-400', badgeText: '就绪' },
  running: { border: 'border-indigo-500/60', glow: 'animate-pulse-glow', badge: 'bg-indigo-500/20 text-indigo-300', badgeText: '运行中' },
  success: { border: 'border-green-500/50', glow: '', badge: 'bg-green-500/20 text-green-300', badgeText: '完成' },
  error: { border: 'border-red-500/50', glow: '', badge: 'bg-red-500/20 text-red-300', badgeText: '错误' },
  warning: { border: 'border-amber-500/50', glow: '', badge: 'bg-amber-500/20 text-amber-300', badgeText: '警告' },
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'from-orange-500/20 to-orange-600/5 text-orange-300',
  openai: 'from-emerald-500/20 to-emerald-600/5 text-emerald-300',
  gemini: 'from-blue-500/20 to-blue-600/5 text-blue-300',
};

const PROVIDER_ICONS: Record<string, string> = {
  claude: 'C',
  openai: 'O',
  gemini: 'G',
};

function AINodeComponent({ id, data, selected }: NodeProps<AINodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const st = STATUS_STYLES[data.status] || STATUS_STYLES.idle;
  const pc = PROVIDER_COLORS[data.provider] || PROVIDER_COLORS.claude;

  return (
    <div
      className={`relative w-[240px] rounded-xl border ${st.border} ${st.glow} bg-[var(--bg-secondary)] transition-all duration-200 ${
        selected ? 'ring-2 ring-indigo-400/50 shadow-lg' : 'shadow-md'
      }`}
      style={{ boxShadow: selected ? '0 0 24px rgba(99,102,241,0.15)' : 'var(--shadow-md)' }}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-indigo-400 !border-2 !border-[var(--bg-secondary)] !-top-[5px]" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-secondary)]">
        <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${pc} flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>
          {PROVIDER_ICONS[data.provider]}
        </div>
        <span className="text-xs font-semibold text-[var(--text-primary)] truncate flex-1">{data.label}</span>
        <div className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${st.badge}`}>{st.badgeText}</div>
        <button
          className="text-[var(--text-tertiary)] hover:text-red-400 text-[10px] ml-0.5 transition"
          onClick={(e) => { e.stopPropagation(); removeNode(id); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[10px] text-[var(--text-tertiary)] truncate">
          {data.model}
        </div>

        {data.status === 'running' && (
          <div className="w-full h-1 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full" style={{ animation: 'shimmer 1.5s ease-in-out infinite', backgroundSize: '200% 100%' }} />
          </div>
        )}

        {data.tokenCount > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
            <span>{data.tokenCount} tokens</span>
            <span className="w-0.5 h-0.5 rounded-full bg-[var(--text-tertiary)]" />
            <span>{data.latencyMs}ms</span>
          </div>
        )}

        {data.output && data.status === 'success' && (
          <div className="text-[10px] text-green-400/80 line-clamp-2 leading-relaxed">
            {data.output.slice(0, 120)}
          </div>
        )}

        {data.error && (
          <div className="text-[10px] text-red-400/80 line-clamp-2">{data.error.slice(0, 100)}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-green-400 !border-2 !border-[var(--bg-secondary)] !-bottom-[5px]" />
    </div>
  );
}

export default memo(AINodeComponent);

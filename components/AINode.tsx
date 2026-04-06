"use client";

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { AINodeData } from '@/lib/types';
import { useFlowStore } from '@/stores/flow-store';

const STATUS_STYLES: Record<string, { border: string; glow: string; badge: string; badgeText: string; dot: string }> = {
  idle: {
    border: 'border-white/8',
    glow: '',
    badge: 'bg-white/[0.05] text-[var(--text-tertiary)] border border-white/8',
    badgeText: 'Ready',
    dot: 'bg-white/20',
  },
  running: {
    border: 'border-[rgba(10,132,255,0.34)]',
    glow: 'shadow-[0_0_0_1px_rgba(10,132,255,0.08),0_20px_48px_rgba(10,132,255,0.14)]',
    badge: 'bg-[rgba(10,132,255,0.12)] text-[#d7efff] border border-[rgba(10,132,255,0.22)]',
    badgeText: 'Running',
    dot: 'bg-[var(--brand-primary)] animate-pulse',
  },
  success: {
    border: 'border-[rgba(74,222,128,0.24)]',
    glow: '',
    badge: 'bg-[rgba(74,222,128,0.12)] text-emerald-300 border border-[rgba(74,222,128,0.18)]',
    badgeText: 'Done',
    dot: 'bg-emerald-300',
  },
  error: {
    border: 'border-[rgba(251,113,133,0.24)]',
    glow: '',
    badge: 'bg-[rgba(251,113,133,0.12)] text-rose-200 border border-[rgba(251,113,133,0.2)]',
    badgeText: 'Error',
    dot: 'bg-rose-300',
  },
  warning: {
    border: 'border-[rgba(255,190,114,0.26)]',
    glow: '',
    badge: 'bg-[rgba(255,255,255,0.1)] text-[#f3f5fa] border border-white/14',
    badgeText: 'Warning',
    dot: 'bg-white/70',
  },
};

const PROVIDER_STYLES: Record<string, { shell: string; icon: string }> = {
  claude: {
    shell: 'border-white/12 bg-white/[0.08] text-[#f3f5fa]',
    icon: 'C',
  },
  openai: {
    shell: 'border-[rgba(10,132,255,0.2)] bg-[rgba(10,132,255,0.08)] text-[#d7efff]',
    icon: 'O',
  },
  gemini: {
    shell: 'border-[rgba(139,184,255,0.2)] bg-[rgba(139,184,255,0.1)] text-[#b9d1ff]',
    icon: 'G',
  },
};

function AINodeComponent({ id, data, selected }: NodeProps<AINodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const status = STATUS_STYLES[data.status] || STATUS_STYLES.idle;
  const provider = PROVIDER_STYLES[data.provider] || PROVIDER_STYLES.claude;

  return (
    <div
      className={`relative w-[268px] rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.86))] transition-all duration-200 backdrop-blur-2xl ${status.border} ${status.glow} ${selected ? 'ring-2 ring-[rgba(10,132,255,0.24)]' : 'shadow-[var(--shadow-sm)]'}`}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !-top-[6px] !border-2 !border-[var(--bg-secondary)] !bg-[var(--brand-secondary)]" />

      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border text-xs font-bold ${provider.shell}`}>
          {provider.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{data.label}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-[var(--text-tertiary)]">{data.model}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${status.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.badgeText}
          </div>
          <button
            className="rounded-lg p-1 text-[var(--text-tertiary)] transition hover:bg-red-500/10 hover:text-rose-300"
            onClick={(e) => {
              e.stopPropagation();
              removeNode(id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-tertiary)]">
          <span className="chip chip-muted !px-2 !py-1">{data.provider}</span>
          {(data.tokenCount ?? 0) > 0 && <span className="chip chip-muted !px-2 !py-1">{data.tokenCount} tokens</span>}
          {(data.latencyMs ?? 0) > 0 && <span className="chip chip-muted !px-2 !py-1">{data.latencyMs}ms</span>}
        </div>

        {data.status === 'running' && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(125,211,252,0.86),rgba(10,132,255,0.92),rgba(125,211,252,0.86))]"
              style={{ animation: 'shimmer 1.4s linear infinite', backgroundSize: '200% 100%' }}
            />
          </div>
        )}

        {data.output && data.status === 'success' && (
          <div className="rounded-2xl border border-[rgba(74,222,128,0.16)] bg-[rgba(74,222,128,0.06)] px-3 py-2 text-[11px] leading-6 text-emerald-100 line-clamp-3">
            {data.output.slice(0, 160)}
          </div>
        )}

        {data.error && (
          <div className="rounded-2xl border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)] px-3 py-2 text-[11px] leading-6 text-[#ffbeca] line-clamp-3">
            {data.error.slice(0, 140)}
          </div>
        )}

        {!data.output && !data.error && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] leading-6 text-[var(--text-tertiary)]">
            通过上方配置区设置模型与提示词，然后连接其他节点形成工作流。
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !-bottom-[6px] !border-2 !border-[var(--bg-secondary)] !bg-[var(--brand-primary)]" />
    </div>
  );
}

export default memo(AINodeComponent);

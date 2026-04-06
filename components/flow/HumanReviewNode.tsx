"use client";

import React, { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useFlowStore } from '@/stores/flow-store';

export interface HumanReviewNodeData {
  label: string;
  instruction: string;
  timeout: number;
  status: 'idle' | 'waiting' | 'approved' | 'rejected' | 'edited' | 'error';
  draft?: string;
  editedContent?: string;
  reviewerNote?: string;
  error?: string;
}

export const DEFAULT_HUMAN_REVIEW_DATA: HumanReviewNodeData = {
  label: '人工审核',
  instruction: '请审核以下内容并决定是否通过。',
  timeout: 300,
  status: 'idle',
};

const STATUS_MAP = {
  idle: { border: 'border-white/8', dot: 'bg-white/20', text: 'Ready', badge: 'bg-white/[0.05] text-[var(--text-tertiary)] border-white/8' },
  waiting: { border: 'border-[rgba(236,72,153,0.34)]', dot: 'bg-pink-400 animate-pulse', text: '等待审核', badge: 'bg-pink-500/12 text-pink-200 border-pink-500/22' },
  approved: { border: 'border-[rgba(74,222,128,0.24)]', dot: 'bg-emerald-300', text: '已通过', badge: 'bg-emerald-500/12 text-emerald-200 border-emerald-500/18' },
  rejected: { border: 'border-[rgba(251,113,133,0.24)]', dot: 'bg-rose-300', text: '已拒绝', badge: 'bg-rose-500/12 text-rose-200 border-rose-500/18' },
  edited: { border: 'border-[rgba(139,92,246,0.24)]', dot: 'bg-violet-300', text: '已编辑', badge: 'bg-violet-500/12 text-violet-200 border-violet-500/18' },
  error: { border: 'border-[rgba(251,113,133,0.24)]', dot: 'bg-rose-300', text: 'Error', badge: 'bg-rose-500/12 text-rose-200 border-rose-500/18' },
};

function HumanReviewNodeComponent({ id, data, selected }: NodeProps<HumanReviewNodeData>) {
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const st = STATUS_MAP[data.status] || STATUS_MAP.idle;
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(data.draft ?? '');

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, { status: 'approved', editedContent: data.draft } as never);
  };

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, { status: 'rejected' } as never);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, { status: 'edited', editedContent: editText } as never);
    setEditMode(false);
  };

  return (
    <div
      className={`relative w-[288px] rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.86))] transition-all duration-200 backdrop-blur-2xl ${st.border} ${selected ? 'ring-2 ring-[rgba(236,72,153,0.3)]' : 'shadow-[var(--shadow-sm)]'}`}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} id="draft" className="!h-3 !w-3 !-top-[6px] !border-2 !border-[var(--bg-secondary)] !bg-pink-400" />

      {/* Header */}
      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-pink-500/20 bg-pink-500/10 text-base">
          👤
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{data.label}</div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">超时 {data.timeout}s</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium border ${st.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.text}
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
        {/* Instruction */}
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-[var(--text-secondary)] line-clamp-2">
          {data.instruction}
        </div>

        {/* Draft preview */}
        {data.draft && !editMode && (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-[var(--text-primary)] line-clamp-4">
            {data.draft.slice(0, 200)}
          </div>
        )}

        {/* Edit mode */}
        {editMode && (
          <textarea
            className="w-full rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[11px] text-[var(--text-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            rows={4}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Action buttons - only show when waiting */}
        {data.status === 'waiting' && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleApprove}
              className="flex-1 rounded-xl bg-emerald-500/15 border border-emerald-500/25 px-3 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/25"
            >
              通过
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setEditMode(!editMode); }}
              className="flex-1 rounded-xl bg-violet-500/15 border border-violet-500/25 px-3 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/25"
            >
              {editMode ? '取消' : '编辑'}
            </button>
            <button
              onClick={handleReject}
              className="flex-1 rounded-xl bg-rose-500/15 border border-rose-500/25 px-3 py-1.5 text-[11px] font-medium text-rose-200 transition hover:bg-rose-500/25"
            >
              拒绝
            </button>
          </div>
        )}

        {editMode && data.status === 'waiting' && (
          <button
            onClick={handleSaveEdit}
            className="w-full rounded-xl bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/30"
          >
            保存编辑并通过
          </button>
        )}

        {data.error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-200 line-clamp-2">
            {data.error}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="approved" className="!h-3 !w-3 !-bottom-[6px] !border-2 !border-[var(--bg-secondary)] !bg-pink-400" />
    </div>
  );
}

export default memo(HumanReviewNodeComponent);

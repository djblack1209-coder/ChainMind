"use client";

import React, { useState } from 'react';

interface Props {
  stageId: string;
  stageName: string;
  agentName: string;
  output: string;
  onApprove: (stageId: string) => void;
  onEdit: (stageId: string, editedOutput: string) => void;
  onReject: (stageId: string, feedback: string) => void;
}

export default function HumanApprovalCard({ stageId, stageName, agentName, output, onApprove, onEdit, onReject }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [editedOutput, setEditedOutput] = useState(output);
  const [feedback, setFeedback] = useState('');

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-xs">⏸</span>
        <div>
          <div className="text-xs font-semibold text-amber-200">需要审批</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">{stageName} · {agentName}</div>
        </div>
      </div>

      {/* Output preview */}
      {mode === 'view' && (
        <div className="rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] p-3 mb-3 max-h-[300px] overflow-y-auto">
          <pre className="whitespace-pre-wrap text-xs text-[var(--text-secondary)] font-mono">{output}</pre>
        </div>
      )}

      {/* Edit mode */}
      {mode === 'edit' && (
        <div className="mb-3">
          <textarea
            value={editedOutput}
            onChange={e => setEditedOutput(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-primary)] font-mono outline-none resize-y min-h-[150px]"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onEdit(stageId, editedOutput); setMode('view'); }} className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/30 transition">
              确认修改并继续
            </button>
            <button onClick={() => setMode('view')} className="rounded-lg px-3 py-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Reject mode */}
      {mode === 'reject' && (
        <div className="mb-3">
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="请说明拒绝原因和改进建议..."
            className="w-full rounded-xl border border-rose-500/30 bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-primary)] outline-none resize-y min-h-[100px] placeholder:text-[var(--text-tertiary)]"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onReject(stageId, feedback); setMode('view'); }} className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/30 transition">
              确认拒绝并重试
            </button>
            <button onClick={() => setMode('view')} className="rounded-lg px-3 py-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {mode === 'view' && (
        <div className="flex gap-2">
          <button onClick={() => onApprove(stageId)} className="flex-1 rounded-xl bg-emerald-500/20 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/30 transition">
            批准并继续
          </button>
          <button onClick={() => setMode('edit')} className="flex-1 rounded-xl bg-amber-500/20 py-2 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30 transition">
            修改后继续
          </button>
          <button onClick={() => setMode('reject')} className="flex-1 rounded-xl bg-rose-500/20 py-2 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/30 transition">
            拒绝并重试
          </button>
        </div>
      )}
    </div>
  );
}

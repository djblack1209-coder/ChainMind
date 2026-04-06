"use client";

import React, { useState } from 'react';

interface StageInfo {
  id: string;
  name: string;
  agentName: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'waiting_approval';
  output?: string;
  duration?: number;
  error?: string;
}

interface Props {
  stages: StageInfo[];
  currentStageId: string | null;
}

const STATUS_CONFIG = {
  pending: { color: 'bg-[var(--text-tertiary)]', ring: '', label: '等待中', textColor: 'text-[var(--text-tertiary)]' },
  running: { color: 'bg-blue-400', ring: 'ring-2 ring-blue-400/30 animate-pulse', label: '执行中', textColor: 'text-blue-300' },
  success: { color: 'bg-emerald-400', ring: '', label: '已完成', textColor: 'text-emerald-300' },
  error: { color: 'bg-rose-400', ring: '', label: '失败', textColor: 'text-rose-300' },
  waiting_approval: { color: 'bg-amber-400', ring: 'ring-2 ring-amber-400/30 animate-pulse', label: '待审批', textColor: 'text-amber-300' },
};

export default function ExecutionTimeline({ stages, currentStageId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (stages.length === 0) return null;

  return (
    <div className="space-y-0">
      {stages.map((stage, idx) => {
        const config = STATUS_CONFIG[stage.status];
        const isLast = idx === stages.length - 1;
        const isExpanded = expandedId === stage.id;
        const isCurrent = stage.id === currentStageId;

        return (
          <div key={stage.id} className="flex gap-3">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div className={`h-3 w-3 rounded-full flex-shrink-0 ${config.color} ${config.ring} ${isCurrent ? 'scale-125' : ''} transition-all`} />
              {!isLast && (
                <div className={`w-px flex-1 min-h-[24px] ${stage.status === 'success' ? 'bg-emerald-400/30' : 'bg-[var(--border-tertiary)]'}`} />
              )}
            </div>

            {/* Content */}
            <div className={`flex-1 pb-3 ${isLast ? '' : ''}`}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : stage.id)}
                className="w-full text-left group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{stage.name}</span>
                  <span className={`text-[9px] font-medium ${config.textColor}`}>{config.label}</span>
                  {stage.duration != null && (
                    <span className="text-[9px] text-[var(--text-tertiary)]">{(stage.duration / 1000).toFixed(1)}s</span>
                  )}
                  {(stage.output || stage.error) && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`text-[var(--text-tertiary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{stage.agentName}</div>
              </button>

              {/* Expanded content */}
              {isExpanded && (stage.output || stage.error) && (
                <div className={`mt-2 rounded-lg border p-2.5 text-[11px] font-mono max-h-[200px] overflow-y-auto ${
                  stage.error
                    ? 'border-rose-500/20 bg-rose-500/5 text-rose-200'
                    : 'border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}>
                  <pre className="whitespace-pre-wrap">{stage.error || stage.output}</pre>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

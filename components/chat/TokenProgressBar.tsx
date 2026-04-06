"use client";

// TokenProgressBar — Real-time token usage + cost estimation during streaming
// Shows context window usage, token count, speed (tok/s), and estimated cost

import React from 'react';
import { formatTokens, formatCost, estimateCost } from '@/lib/token-counter';
import { getModelTokenProfile } from '@/lib/types';

interface TokenProgressBarProps {
  model: string;
  inputTokens: number;
  outputTokens: number;
  isStreaming: boolean;
  latencyMs: number;
}

export function TokenProgressBar({ model, inputTokens, outputTokens, isStreaming, latencyMs }: TokenProgressBarProps) {
  const profile = getModelTokenProfile(model);
  const totalTokens = inputTokens + outputTokens;
  const contextLimit = profile?.contextTokens || 128000;
  const usagePercent = Math.min((totalTokens / contextLimit) * 100, 100);
  const cost = estimateCost(model, inputTokens, outputTokens);
  const tokPerSec = latencyMs > 0 && outputTokens > 0 ? (outputTokens / (latencyMs / 1000)).toFixed(1) : null;

  // Color based on usage
  const barColor = usagePercent > 80 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-[var(--brand-primary)]';

  return (
    <div className="flex items-center gap-3 px-1 py-1">
      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor} ${isStreaming ? 'animate-pulse' : ''}`}
          style={{ width: `${Math.max(usagePercent, 0.5)}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-[9px] text-[var(--text-tertiary)] tabular-nums flex-shrink-0">
        {isStreaming && tokPerSec && (
          <span className="text-[var(--brand-primary)]">{tokPerSec} tok/s</span>
        )}
        <span>{formatTokens(inputTokens)}↑ {formatTokens(outputTokens)}↓</span>
        <span className={usagePercent > 80 ? 'text-rose-400' : ''}>{usagePercent.toFixed(0)}%</span>
        {cost !== null && <span className="text-[var(--text-secondary)]">{formatCost(cost)}</span>}
      </div>
    </div>
  );
}

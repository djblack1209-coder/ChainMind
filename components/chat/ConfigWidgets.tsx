"use client";

import React from 'react';

// Config detection banner shown when paste is detected
export function ConfigBanner({ parsed, onApply, onDismiss, isApplying }: {
  parsed: { apiKey: string | null; baseUrl: string | null; model: string | null; provider: string | null };
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
}) {
  return (
    <div className="mx-4 mt-2 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-indigo-300 mb-1.5">检测到 API 配置信息</p>
          <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
            {parsed.baseUrl && <p>地址: <span className="font-mono text-[var(--text-primary)]">{parsed.baseUrl}</span></p>}
            {parsed.apiKey && <p>密钥: <span className="font-mono text-[var(--text-primary)]">{parsed.apiKey.slice(0, 8)}...{parsed.apiKey.slice(-4)}</span></p>}
            {parsed.model && <p>模型: <span className="font-mono text-[var(--text-primary)]">{parsed.model}</span></p>}
            {parsed.provider && <p>类型: <span className="font-mono text-[var(--text-primary)]">{parsed.provider}</span></p>}
          </div>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={onApply}
              disabled={isApplying}
              className="btn btn-primary text-[11px] px-3 py-1.5 disabled:opacity-50"
            >
              {isApplying ? '正在配置...' : '一键配置并探测模型'}
            </button>
            <button onClick={onDismiss} className="btn btn-ghost text-[11px] px-3 py-1.5">
              忽略，当作普通消息发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Setup progress shown during auto-configuration
export function SetupProgress({ steps }: { steps: { text: string; done: boolean; error?: boolean }[] }) {
  return (
    <div className="mx-4 mt-2 p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)] animate-fade-in">
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {step.error ? (
              <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-400"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </span>
            ) : step.done ? (
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
            ) : (
              <span className="w-4 h-4 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin flex-shrink-0" />
            )}
            <span className={step.error ? 'text-red-400' : step.done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}>
              {step.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

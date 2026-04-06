"use client";

import React from 'react';

export function ConfigBanner({ parsed, onApply, onDismiss, isApplying }: {
  parsed: { apiKey: string | null; baseUrl: string | null; model: string | null; provider: string | null };
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
}) {
  return (
    <div className="mx-auto mt-4 w-full max-w-4xl rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(18,22,30,0.82))] p-4 shadow-[var(--shadow-md)] animate-fade-in backdrop-blur-2xl">
      <div className="flex items-start gap-4">
        <div className="brand-mark-shell flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[18px] text-[#d7efff]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-warm">检测到 API 配置</span>
            <span className="chip chip-muted">自动接入</span>
          </div>

          <div className="mt-3 grid gap-2 text-[12px] text-[var(--text-secondary)] sm:grid-cols-2">
            {parsed.baseUrl && (
              <div className="panel-card-muted p-3 shadow-none">
                <div className="meta-label mb-1">Base URL</div>
                <div className="font-mono break-all text-[var(--text-primary)]">{parsed.baseUrl}</div>
              </div>
            )}
            {parsed.model && (
              <div className="panel-card-muted p-3">
                <div className="meta-label mb-1">Model</div>
                <div className="font-mono break-all text-[var(--text-primary)]">{parsed.model}</div>
              </div>
            )}
            {parsed.provider && (
              <div className="panel-card-muted p-3">
                <div className="meta-label mb-1">Provider</div>
                <div className="font-mono text-[var(--text-primary)]">{parsed.provider}</div>
              </div>
            )}
            {parsed.apiKey && (
              <div className="panel-card-muted p-3">
                <div className="meta-label mb-1">API Key</div>
                <div className="font-mono text-[var(--text-primary)]">
                  {parsed.apiKey.slice(0, 8)}...{parsed.apiKey.slice(-4)}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onApply} disabled={isApplying} className="btn btn-primary px-4 py-2 text-xs disabled:opacity-50">
              {isApplying ? '正在配置...' : '一键配置并探测模型'}
            </button>
            <button onClick={onDismiss} className="btn btn-secondary px-4 py-2 text-xs">
              忽略，当作普通消息发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SetupProgress({ steps }: { steps: { text: string; done: boolean; error?: boolean }[] }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-3xl rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(18,22,30,0.8))] p-5 shadow-[var(--shadow-md)] animate-fade-in backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="meta-label">Auto setup</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">正在初始化模型连接与会话环境</div>
        </div>
        <span className="chip chip-cool">运行中</span>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm">
            {step.error ? (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(251,113,133,0.14)] text-[#ffbeca]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </span>
            ) : step.done ? (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(74,222,128,0.16)] text-emerald-300">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
            ) : (
              <span className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-[rgba(10,132,255,0.18)] border-t-[var(--brand-primary)] animate-spin" />
            )}

            <span className={step.error ? 'text-[#ffbeca]' : step.done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}>
              {step.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import React from 'react';
import { groupedCommands, CATEGORY_LABELS, type SlashCommand } from '@/lib/tools';

const CATEGORY_ICONS: Record<string, string> = {
  prompt: 'Prompt',
  role: 'Role',
  tool: 'Tool',
  system: 'System',
};

interface ToolPanelProps {
  open: boolean;
  onClose: () => void;
  onSelect: (cmd: SlashCommand) => void;
  activeSystemPrompt?: string;
}

export default function ToolPanel({ open, onClose, onSelect, activeSystemPrompt }: ToolPanelProps) {
  if (!open) return null;

  const groups = groupedCommands();

  return (
    <div className="panel-shell animate-panel-in-right flex w-[332px] flex-shrink-0 flex-col overflow-hidden rounded-[32px] border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(17,21,29,0.78))]">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <div className="meta-label">Tool panel</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Slash commands</div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {activeSystemPrompt && (
        <div className="glass-light mx-4 mt-4 rounded-[24px] border-white/12 p-4">
          <div className="flex items-center gap-2">
            <span className="chip chip-cool">Active role</span>
            <span className="chip chip-muted">prompt injected</span>
          </div>
          <p className="mt-3 line-clamp-3 text-[12px] leading-6 text-[var(--text-secondary)]">
            {activeSystemPrompt}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">
          {Object.entries(groups).map(([category, cmds]) => (
            <div key={category}>
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="meta-label">{CATEGORY_LABELS[category] || category}</div>
                <span className="chip chip-muted !px-2 !py-1">{CATEGORY_ICONS[category] || 'Cmd'}</span>
              </div>

              <div className="space-y-2">
                {cmds.map((cmd) => (
                  <button
                    key={cmd.name}
                    onClick={() => onSelect(cmd)}
                    className="w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-[rgba(10,132,255,0.18)] hover:bg-white/[0.08]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="glass-light flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[18px] border-white/12 text-lg">
                        {cmd.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{cmd.label}</span>
                          <span className="font-mono text-[11px] text-[#b8d4ff]">{cmd.name}</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-6 text-[var(--text-tertiary)]">{cmd.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/8 px-5 py-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[12px] leading-6 text-[var(--text-tertiary)]">
          输入 <span className="font-mono text-[#b8d4ff]">/</span> 可以快速调出命令列表，也可以从这里直接切换角色或执行系统命令。
        </div>
      </div>
    </div>
  );
}

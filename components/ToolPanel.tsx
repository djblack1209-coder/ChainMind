"use client";

import React from 'react';
import { groupedCommands, CATEGORY_LABELS, type SlashCommand } from '@/lib/tools';

const CATEGORY_ICONS: Record<string, string> = {
  prompt: '✨',
  role: '🎭',
  tool: '🔧',
  system: '⚙️',
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
    <div className="w-72 flex flex-col bg-[var(--bg-secondary)] border-l border-[var(--border-secondary)] flex-shrink-0 animate-fade-in">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-secondary)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="text-xs font-semibold text-[var(--text-primary)]">工具面板</span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-icon p-1" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Active role indicator */}
      {activeSystemPrompt && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[10px] font-medium text-indigo-300">当前角色已激活</span>
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] line-clamp-2 leading-relaxed">
            {activeSystemPrompt.slice(0, 80)}...
          </p>
        </div>
      )}

      {/* Command groups */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {Object.entries(groups).map(([category, cmds]) => (
          <div key={category}>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <span className="text-xs">{CATEGORY_ICONS[category] || '📌'}</span>
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {CATEGORY_LABELS[category] || category}
              </span>
            </div>
            <div className="space-y-1">
              {cmds.map((cmd) => (
                <button
                  key={cmd.name}
                  onClick={() => onSelect(cmd)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm flex-shrink-0">{cmd.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{cmd.label}</span>
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition">
                          {cmd.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                        {cmd.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-[var(--border-secondary)] px-4 py-2.5 flex-shrink-0">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          在输入框输入 <span className="font-mono text-indigo-400">/</span> 可快速调用命令
        </p>
      </div>
    </div>
  );
}

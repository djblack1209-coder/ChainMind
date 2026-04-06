"use client";

import React, { useState, useCallback } from 'react';
import { Copy, Check, RefreshCw, Pencil, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Brain, GitFork } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

// ── Thinking Block (collapsible reasoning chain) ────────
function ThinkingBlock({ thinking, durationMs, isStreaming }: { thinking: string; durationMs?: number; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = thinking.split('\n').length;
  const preview = thinking.slice(0, 120).replace(/\n/g, ' ');

  return (
    <div className="mb-2 rounded-2xl border border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.06)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition hover:bg-[rgba(139,92,246,0.08)] rounded-2xl"
      >
        <Brain size={13} className={`text-purple-400 flex-shrink-0 ${isStreaming ? 'animate-pulse' : ''}`} />
        <span className="font-medium text-purple-300">
          {isStreaming ? 'Thinking...' : 'Thought process'}
        </span>
        {durationMs && !isStreaming && (
          <span className="text-[10px] text-purple-400/60">{(durationMs / 1000).toFixed(1)}s</span>
        )}
        {!isStreaming && (
          <span className="text-[10px] text-purple-400/40">{lines} lines</span>
        )}
        <span className="ml-auto flex-shrink-0 text-purple-400/50">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {!expanded && !isStreaming && (
        <div className="px-3 pb-2 text-[11px] text-purple-300/50 truncate">
          {preview}...
        </div>
      )}
      {(expanded || isStreaming) && (
        <div className="border-t border-[rgba(139,92,246,0.12)] px-3 py-2 text-[12px] leading-5 text-purple-200/70 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
          {thinking}
          {isStreaming && (
            <span className="ml-1 inline-block h-3 w-1.5 rounded-sm bg-purple-400 align-middle animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  msg: ChatMessage;
  isLastAssistant?: boolean;
  onRegenerate?: (msgId: string) => void;
  onEdit?: (msgId: string, newContent: string) => void;
  onFork?: (msgId: string) => void;
  siblingIndex?: number;
  siblingCount?: number;
  onSiblingNav?: (msgId: string, direction: 'prev' | 'next') => void;
}

export function MessageBubble({ msg, isLastAssistant, onRegenerate, onEdit, onFork, siblingIndex, siblingCount, onSiblingNav }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [msg.content]);

  const handleEditSubmit = useCallback(() => {
    if (editContent.trim() && editContent !== msg.content) {
      onEdit?.(msg.id, editContent.trim());
    }
    setEditing(false);
  }, [editContent, msg.content, msg.id, onEdit]);

  return (
    <div className={`group flex gap-4 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border text-[11px] font-semibold ${
          isUser
            ? 'border-[rgba(255,239,232,0.18)] bg-[linear-gradient(180deg,var(--brand-primary-hover),var(--brand-primary))] text-white shadow-[0_16px_30px_rgba(255,107,87,0.22)]'
            : 'glass-light text-[var(--brand-cream)]'
        }`}
      >
        {isUser ? 'ME' : 'AI'}
      </div>

      <div className={`min-w-0 max-w-[84%] ${isUser ? 'items-end text-right' : ''}`}>
        <div className={`mb-2 flex items-center gap-2 text-[11px] ${isUser ? 'justify-end' : ''}`}>
          <span className={`meta-label ${isUser ? 'text-[var(--brand-cream)]' : 'text-[var(--brand-secondary)]'}`}>
            {isUser ? 'User' : 'Assistant'}
          </span>
          {!isUser && msg.isStreaming && <span className="chip chip-cool !px-2 !py-1">streaming</span>}
        </div>

        {/* Thinking block — shown for reasoning models */}
        {!isUser && msg.thinking && (
          <ThinkingBlock
            thinking={msg.thinking}
            durationMs={msg.thinkingDurationMs}
            isStreaming={msg.isStreaming && !msg.content}
          />
        )}

        <div
          className={`inline-block rounded-[22px] border px-4 py-3 text-left text-sm leading-7 text-[var(--text-primary)] shadow-[var(--shadow-sm)] ${
            isUser
              ? 'rounded-tr-md border-[rgba(255,239,232,0.16)] bg-[linear-gradient(180deg,var(--brand-primary-hover),var(--brand-primary))] text-white'
              : 'rounded-tl-md border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]'
          }`}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[60px] bg-transparent border border-white/10 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-[var(--brand-primary)]"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">取消</button>
                <button onClick={handleEditSubmit} className="text-xs text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)]">确认</button>
              </div>
            </div>
          ) : isUser ? (
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          ) : (
            <MarkdownRenderer content={msg.content} />
          )}
          {msg.isStreaming && (
            <span className="ml-1 inline-block h-5 w-2 rounded-sm bg-[var(--brand-primary)] align-middle animate-pulse shadow-[0_0_8px_rgba(255,107,87,0.5)]" />
          )}
        </div>

        {/* Action buttons — show on hover */}
        {!msg.isStreaming && msg.content && (
          <div className={`mt-1.5 flex items-center gap-1 transition-opacity ${isLastAssistant ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'} ${isUser ? 'justify-end' : ''}`}>
            {/* Sibling navigation (← 2/3 →) */}
            {siblingCount && siblingCount > 1 && onSiblingNav && (
              <div className="flex items-center gap-0.5 mr-1">
                <button
                  onClick={() => onSiblingNav(msg.id, 'prev')}
                  disabled={siblingIndex === 0}
                  className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-30"
                  title="上一个版本"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">
                  {(siblingIndex ?? 0) + 1}/{siblingCount}
                </span>
                <button
                  onClick={() => onSiblingNav(msg.id, 'next')}
                  disabled={siblingIndex === siblingCount - 1}
                  className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-30"
                  title="下一个版本"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="复制">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {isUser && onEdit && (
              <button onClick={() => { setEditContent(msg.content); setEditing(true); }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="编辑">
                <Pencil size={14} />
              </button>
            )}
            {!isUser && onRegenerate && (
              <button onClick={() => onRegenerate(msg.id)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="重新生成">
                <RefreshCw size={14} />
              </button>
            )}
            {onFork && (
              <button onClick={() => onFork(msg.id)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="从此处分支对话">
                <GitFork size={14} />
              </button>
            )}
          </div>
        )}

        {msg.error && (
          <div className="mt-2 rounded-2xl border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)] px-3 py-2 text-[11px] text-[#ffbeca]">
            {msg.error}
          </div>
        )}

        {!isUser && msg.latencyMs && !msg.isStreaming && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            {msg.tokenCount ? <span>{msg.tokenCount} tokens</span> : null}
            {msg.tokenCount ? <span className="h-1 w-1 rounded-full bg-white/20" /> : null}
            <span>{msg.latencyMs}ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

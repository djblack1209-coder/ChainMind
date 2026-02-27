"use client";

import React from 'react';
import type { ChatMessage } from '@/lib/types';

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
        isUser
          ? 'bg-indigo-500/20 text-indigo-300'
          : 'bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 text-cyan-300'
      }`}>
        {isUser ? '你' : 'AI'}
      </div>
      <div className={`max-w-[80%] min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-indigo-500/15 text-[var(--text-primary)] rounded-tr-md'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tl-md'
        }`}>
          {msg.content}
          {msg.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
        {msg.error && (
          <div className="mt-1 text-[10px] text-red-400">{msg.error}</div>
        )}
        {!isUser && msg.latencyMs && !msg.isStreaming && (
          <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
            {msg.tokenCount ? `${msg.tokenCount} tokens · ` : ''}{msg.latencyMs}ms
          </div>
        )}
      </div>
    </div>
  );
}

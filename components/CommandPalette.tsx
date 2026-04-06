"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Command } from "cmdk";
import {
  MessageSquarePlus, Trash2, Settings, Moon, Sun, Download,
  Terminal, Search, Keyboard, Zap, RotateCcw, MessageCircle
} from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useTheme } from "@/components/ThemeProvider";

interface CommandPaletteProps {
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  onToggleTerminal?: () => void;
  onToggleTheme?: () => void;
  onExportChat?: () => void;
}

interface MessageSearchResult {
  convId: string;
  convTitle: string;
  msgId: string;
  role: string;
  snippet: string;
}

export default function CommandPalette({
  onNewChat,
  onOpenSettings,
  onToggleTerminal,
  onToggleTheme,
  onExportChat,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { theme, toggleTheme } = useTheme();
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Full-text message search
  const messageResults = useMemo<MessageSearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: MessageSearchResult[] = [];
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (!msg.content) continue;
        const idx = msg.content.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 20);
        const end = Math.min(msg.content.length, idx + q.length + 40);
        const snippet = (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '');
        results.push({
          convId: conv.id,
          convTitle: conv.title,
          msgId: msg.id,
          role: msg.role === 'user' ? '用户' : 'AI',
          snippet,
        });
        if (results.length >= 20) return results;
      }
    }
    return results;
  }, [query, conversations]);

  // Cmd+K to toggle
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onNewChat?.();
      }
      if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenSettings?.();
      }
      if (e.key === "`" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onToggleTerminal?.();
      }
      if (e.key === "e" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        onExportChat?.();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onNewChat, onOpenSettings, onToggleTerminal, onExportChat]);

  // Listen for chainmind-search event (from :search colon command)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('chainmind-search', handler);
    return () => window.removeEventListener('chainmind-search', handler);
  }, []);

  const runAndClose = useCallback((fn?: () => void) => {
    fn?.();
    setOpen(false);
    setQuery("");
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setOpen(false); setQuery(""); }} />
      <div className="fixed left-1/2 top-[20%] w-full max-w-[520px] -translate-x-1/2">
        <Command
          className="cmdk-root rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-elevated)] shadow-2xl backdrop-blur-xl overflow-hidden"
          label="Command Palette"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border-tertiary)] px-4">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <Command.Input
              placeholder="搜索命令、对话、消息内容..."
              value={query}
              onValueChange={setQuery}
              className="h-12 w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
            <kbd className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">ESC</kbd>
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              没有找到匹配的命令或消息
            </Command.Empty>

            <Command.Group heading="操作" className="cmdk-group">
              <Command.Item onSelect={() => runAndClose(onNewChat)} className="cmdk-item">
                <MessageSquarePlus size={16} />
                <span>新建对话</span>
                <kbd className="cmdk-kbd">⌘N</kbd>
              </Command.Item>
              <Command.Item onSelect={() => runAndClose(onToggleTerminal)} className="cmdk-item">
                <Terminal size={16} />
                <span>切换终端</span>
                <kbd className="cmdk-kbd">⌘`</kbd>
              </Command.Item>
              <Command.Item onSelect={() => runAndClose(onOpenSettings)} className="cmdk-item">
                <Settings size={16} />
                <span>打开设置</span>
                <kbd className="cmdk-kbd">⌘,</kbd>
              </Command.Item>
              <Command.Item onSelect={() => { toggleTheme(); setOpen(false); setQuery(""); }} className="cmdk-item">
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                <span>{theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}</span>
              </Command.Item>
              <Command.Item onSelect={() => runAndClose(onExportChat)} className="cmdk-item">
                <Download size={16} />
                <span>导出对话</span>
                <kbd className="cmdk-kbd">⇧⌘E</kbd>
              </Command.Item>
              {activeConversationId && (
                <Command.Item onSelect={() => { clearMessages(activeConversationId); setOpen(false); setQuery(""); }} className="cmdk-item">
                  <Trash2 size={16} />
                  <span>清空当前对话</span>
                </Command.Item>
              )}
            </Command.Group>

            {conversations.length > 0 && (
              <Command.Group heading="最近对话" className="cmdk-group">
                {conversations.slice(0, 8).map((conv) => (
                  <Command.Item
                    key={conv.id}
                    value={`conv-${conv.title}`}
                    onSelect={() => { setActiveConversation(conv.id); setOpen(false); setQuery(""); }}
                    className="cmdk-item"
                  >
                    <Zap size={16} />
                    <span className="truncate">{conv.title}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                      {conv.messages.length} 条
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {messageResults.length > 0 && (
              <Command.Group heading={`消息搜索 (${messageResults.length} 条)`} className="cmdk-group">
                {messageResults.map((r, i) => (
                  <Command.Item
                    key={`${r.convId}-${r.msgId}-${i}`}
                    value={`msg-${r.snippet}`}
                    onSelect={() => { setActiveConversation(r.convId); setOpen(false); setQuery(""); }}
                    className="cmdk-item flex-col !items-start !gap-1"
                  >
                    <div className="flex w-full items-center gap-2">
                      <MessageCircle size={14} />
                      <span className="truncate text-[11px] text-[var(--text-secondary)]">{r.convTitle}</span>
                      <span className="ml-auto text-[9px] text-[var(--text-tertiary)]">{r.role}</span>
                    </div>
                    <p className="w-full truncate text-[11px] text-[var(--text-tertiary)]">{r.snippet}</p>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { FileSearchResult, IndexStatus } from "@/lib/file-indexer-client";

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;

const EMPTY_STATUS: IndexStatus = { watching: false, directory: null, filesIndexed: 0, totalChunks: 0, lastIndexedAt: null };

export default function KnowledgeBasePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<IndexStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!isElectron) return;
    try {
      const { getIndexStatus } = await import("@/lib/file-indexer-client");
      setStatus(await getIndexStatus());
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshStatus();
    pollRef.current = setInterval(refreshStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, refreshStatus]);

  const handlePickDir = async () => {
    if (!isElectron) return;
    const result = await (window as any).electronAPI?.showOpenDialog?.({ properties: ["openDirectory"] });
    if (result?.canceled || !result?.filePaths?.[0]) return;
    const dir = result.filePaths[0];
    setStatus((s) => ({ ...s, directory: dir }));
  };

  const handleToggleIndex = async () => {
    if (!isElectron) return;
    setLoading(true);
    try {
      if (status.watching) {
        const { stopIndexing } = await import("@/lib/file-indexer-client");
        await stopIndexing();
      } else if (status.directory) {
        const { startIndexing } = await import("@/lib/file-indexer-client");
        await startIndexing(status.directory);
      }
      await refreshStatus();
    } catch {} finally { setLoading(false); }
  };

  const handleSearch = async () => {
    if (!isElectron || !query.trim()) return;
    setSearching(true);
    try {
      const { searchFiles } = await import("@/lib/file-indexer-client");
      setResults(await searchFiles(query.trim(), 10));
    } catch {} finally { setSearching(false); }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,16,20,0.98),rgba(8,8,10,0.98))] shadow-[var(--shadow-lg)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Knowledge Base</div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">知识库 — 本地文件索引与语义搜索</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!isElectron ? (
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-6 text-center">
              <div className="text-sm text-[var(--text-secondary)]">仅桌面版可用</div>
              <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">文件索引功能需要在 Electron 桌面客户端中使用</div>
            </div>
          ) : (
            <>
              {/* Directory picker */}
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">索引目录</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
                    {status.directory || "未选择"}
                  </div>
                  <button onClick={handlePickDir} className="btn btn-secondary px-3 py-2 text-[11px] flex-shrink-0">选择目录</button>
                  <button
                    onClick={handleToggleIndex}
                    disabled={loading || !status.directory}
                    className={`btn px-3 py-2 text-[11px] flex-shrink-0 ${status.watching ? "btn-secondary" : "btn-primary"}`}
                  >
                    {loading ? "处理中..." : status.watching ? "停止索引" : "开始索引"}
                  </button>
                </div>
              </div>

              {/* Index status */}
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">索引状态</div>
                  {status.watching && (
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />运行中
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-center">
                    <div className="text-lg font-semibold text-[var(--text-primary)]">{status.filesIndexed}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">已索引文件</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-center">
                    <div className="text-lg font-semibold text-[var(--text-primary)]">{status.totalChunks}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">文本块</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-center">
                    <div className="text-[11px] font-medium text-[var(--text-primary)]">
                      {status.lastIndexedAt ? new Date(status.lastIndexedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">最后索引</div>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">语义搜索</div>
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="搜索文件内容..."
                    className="input flex-1 text-xs"
                  />
                  <button onClick={handleSearch} disabled={searching || !query.trim()} className="btn btn-primary px-4 py-2 text-[11px]">
                    {searching ? "搜索中..." : "搜索"}
                  </button>
                </div>
                {results.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
                    {results.map((r, i) => (
                      <div
                        key={i}
                        onClick={() => handleCopy(r.chunk, i)}
                        className="cursor-pointer rounded-lg border border-white/8 bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{r.filePath}</span>
                          <span className="flex-shrink-0 ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">
                            {copied === i ? "已复制" : `${(r.score * 100).toFixed(0)}%`}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{r.chunk}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Indexed files list */}
              {status.filesIndexed > 0 && (
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <button onClick={() => setFilesExpanded(!filesExpanded)} className="flex w-full items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      已索引文件 ({status.filesIndexed})
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-[var(--text-tertiary)] transition ${filesExpanded ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {filesExpanded && (
                    <div className="mt-3 text-[11px] text-[var(--text-tertiary)]">
                      共 {status.filesIndexed} 个文件，{status.totalChunks} 个文本块
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";

interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error";
  tools: string[];
}

const DEFAULT_SERVERS: MCPServer[] = [
  {
    id: "gva-mcp",
    name: "GVA MCP Server",
    url: "http://localhost:8889",
    status: "disconnected",
    tools: ["readFile", "writeFile", "listDir", "search", "terminal"],
  },
];

export default function MCPConfigPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [servers, setServers] = useState<MCPServer[]>(DEFAULT_SERVERS);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setServers((prev) => [
      ...prev,
      {
        id: `mcp_${Date.now()}`,
        name: newName.trim(),
        url: newUrl.trim(),
        status: "disconnected",
        tools: [],
      },
    ]);
    setNewName("");
    setNewUrl("");
  };

  const handleRemove = (id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleConnect = (id: string) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "connected" as const } : s))
    );
  };

  const handleDisconnect = (id: string) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "disconnected" as const } : s))
    );
  };

  if (!open) return null;

  const statusColor = (s: MCPServer["status"]) => {
    switch (s) {
      case "connected": return "bg-emerald-400";
      case "disconnected": return "bg-white/30";
      case "error": return "bg-rose-400";
    }
  };

  const statusLabel = (s: MCPServer["status"]) => {
    switch (s) {
      case "connected": return "已连接";
      case "disconnected": return "未连接";
      case "error": return "错误";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,16,20,0.98),rgba(8,8,10,0.98))] shadow-[var(--shadow-lg)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">MCP Configuration</div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">Model Context Protocol 服务管理</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Server list */}
          {servers.map((server) => (
            <div key={server.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${statusColor(server.status)}`} />
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">{server.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">{server.url}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-tertiary)]">{statusLabel(server.status)}</span>
                  {server.status === "disconnected" ? (
                    <button onClick={() => handleConnect(server.id)} className="btn btn-secondary px-3 py-1.5 text-[11px]">连接</button>
                  ) : server.status === "connected" ? (
                    <button onClick={() => handleDisconnect(server.id)} className="btn btn-secondary px-3 py-1.5 text-[11px]">断开</button>
                  ) : null}
                  <button onClick={() => handleRemove(server.id)} className="rounded p-1 text-[var(--text-tertiary)] transition hover:text-rose-300">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {server.tools.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {server.tools.map((tool) => (
                    <span key={tool} className="rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] text-[var(--text-tertiary)]">
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Add new server */}
          <div className="rounded-[18px] border border-dashed border-white/12 bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">添加 MCP 服务</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="服务名称"
                className="input text-xs"
              />
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="ws://localhost:8889"
                className="input text-xs"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || !newUrl.trim()}
                className="btn btn-primary px-4 py-2 text-xs"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

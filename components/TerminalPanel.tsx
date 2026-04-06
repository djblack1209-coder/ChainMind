"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { Trash2, X } from "lucide-react";

interface TerminalPanelProps {
  open: boolean;
  onToggle: () => void;
}

export default function TerminalPanel({ open, onToggle }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const [height, setHeight] = useState(240);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const inputBuf = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const initRef = useRef(false);

  // Initialize xterm
  useEffect(() => {
    if (!open || !containerRef.current || initRef.current) return;

    let cancelled = false;

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");

      if (cancelled || !containerRef.current) return;

      // Load xterm CSS
      if (!document.getElementById("xterm-css")) {
        const link = document.createElement("link");
        link.id = "xterm-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.min.css";
        document.head.appendChild(link);
      }

      const term = new Terminal({
        theme: {
          background: "#06060a",
          foreground: "#d4d0cc",
          cursor: "#ff6b57",
          cursorAccent: "#06060a",
          selectionBackground: "rgba(255,107,87,0.25)",
          black: "#1a1a2e",
          red: "#fb7185",
          green: "#4ade80",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#22d3ee",
          white: "#d4d0cc",
          brightBlack: "#6b7280",
          brightRed: "#ff8b72",
          brightGreen: "#86efac",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#67e8f9",
          brightWhite: "#ffffff",
        },
        fontFamily: "var(--font-mono), 'SF Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback: 5000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      initRef.current = true;

      // Welcome message
      term.writeln("\x1b[38;2;255;107;87m╭─────────────────────────────────────╮\x1b[0m");
      term.writeln("\x1b[38;2;255;107;87m│\x1b[0m  \x1b[1mChainMind Terminal\x1b[0m                  \x1b[38;2;255;107;87m│\x1b[0m");
      term.writeln("\x1b[38;2;255;107;87m│\x1b[0m  \x1b[2mAI Chain IDE v1.0\x1b[0m                   \x1b[38;2;255;107;87m│\x1b[0m");
      term.writeln("\x1b[38;2;255;107;87m╰─────────────────────────────────────╯\x1b[0m");
      term.writeln("");

      writePrompt(term);

      // Handle input
      term.onData((data: string) => {
        handleTermData(term, data);
      });
    })();

    return () => { cancelled = true; };
  }, [open]);

  // Fit on resize / height change
  useEffect(() => {
    if (!open || !fitAddonRef.current) return;
    const timer = setTimeout(() => fitAddonRef.current?.fit(), 50);
    return () => clearTimeout(timer);
  }, [open, height]);

  // Window resize
  useEffect(() => {
    if (!open) return;
    const onResize = () => fitAddonRef.current?.fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  function writePrompt(term: any) {
    term.write("\x1b[38;2;255;107;87m❯\x1b[0m ");
  }

  function handleTermData(term: any, data: string) {
    const code = data.charCodeAt(0);

    if (data === "\r") {
      // Enter
      const cmd = inputBuf.current.trim();
      term.writeln("");
      if (cmd) {
        historyRef.current.push(cmd);
        historyIdxRef.current = -1;
        executeCommand(term, cmd);
      } else {
        writePrompt(term);
      }
      inputBuf.current = "";
    } else if (code === 127 || code === 8) {
      // Backspace
      if (inputBuf.current.length > 0) {
        inputBuf.current = inputBuf.current.slice(0, -1);
        term.write("\b \b");
      }
    } else if (data === "\x1b[A") {
      // Arrow up — history
      if (historyRef.current.length > 0) {
        const idx = historyIdxRef.current < 0
          ? historyRef.current.length - 1
          : Math.max(0, historyIdxRef.current - 1);
        historyIdxRef.current = idx;
        clearLine(term);
        inputBuf.current = historyRef.current[idx];
        term.write(inputBuf.current);
      }
    } else if (data === "\x1b[B") {
      // Arrow down — history
      if (historyIdxRef.current >= 0) {
        const idx = historyIdxRef.current + 1;
        clearLine(term);
        if (idx >= historyRef.current.length) {
          historyIdxRef.current = -1;
          inputBuf.current = "";
        } else {
          historyIdxRef.current = idx;
          inputBuf.current = historyRef.current[idx];
          term.write(inputBuf.current);
        }
      }
    } else if (data === "\x03") {
      // Ctrl+C
      inputBuf.current = "";
      term.writeln("^C");
      writePrompt(term);
    } else if (code >= 32) {
      // Printable
      inputBuf.current += data;
      term.write(data);
    }
  }

  function clearLine(term: any) {
    const len = inputBuf.current.length;
    if (len > 0) {
      term.write("\b".repeat(len) + " ".repeat(len) + "\b".repeat(len));
    }
  }

  async function executeCommand(term: any, cmd: string) {
    if (cmd === "clear") {
      term.clear();
      writePrompt(term);
      return;
    }
    if (cmd === "help") {
      term.writeln("\x1b[1mAvailable commands:\x1b[0m");
      term.writeln("  \x1b[33mclear\x1b[0m     Clear terminal");
      term.writeln("  \x1b[33mhelp\x1b[0m      Show this help");
      term.writeln("  \x1b[33mversion\x1b[0m   Show version info");
      term.writeln("  \x1b[33m<cmd>\x1b[0m     Execute via system shell");
      term.writeln("");
      writePrompt(term);
      return;
    }
    if (cmd === "version") {
      term.writeln("\x1b[1mChainMind\x1b[0m v1.0.0");
      term.writeln("  Next.js 14 + Electron 33 + React 18");
      term.writeln("");
      writePrompt(term);
      return;
    }

    // Execute via Electron IPC or API
    try {
      const api = (window as any).electronAPI;
      if (api?.execCommand) {
        const result = await api.execCommand(cmd);
        if (result?.stdout) term.writeln(result.stdout.replace(/\n$/, ""));
        if (result?.stderr) term.writeln(`\x1b[31m${result.stderr.replace(/\n$/, "")}\x1b[0m`);
        if (result?.error) term.writeln(`\x1b[31mError: ${result.error}\x1b[0m`);
      } else {
        // Fallback: use /api/exec
        const res = await fetch("/api/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json();
        if (data.stdout) term.writeln(data.stdout.replace(/\n$/, ""));
        if (data.stderr) term.writeln(`\x1b[31m${data.stderr.replace(/\n$/, "")}\x1b[0m`);
        if (data.error) term.writeln(`\x1b[31m${data.error}\x1b[0m`);
      }
    } catch (err) {
      term.writeln(`\x1b[31mExecution failed: ${String(err)}\x1b[0m`);
    }
    writePrompt(term);
  }

  const handleClear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setHeight(Math.max(120, Math.min(600, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      fitAddonRef.current?.fit();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [height]);

  if (!open) return null;

  return (
    <div className="flex-shrink-0 border-t border-[var(--border-secondary)]" style={{ height }}>
      <div
        onMouseDown={handleDragStart}
        className="flex h-8 cursor-row-resize items-center justify-between border-b border-[var(--border-tertiary)] bg-[rgba(12,11,15,0.9)] px-3"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-[3px] w-8 rounded-full bg-white/20" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleClear} className="rounded p-1 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]" title="清空">
            <Trash2 size={12} />
          </button>
          <button onClick={onToggle} className="rounded p-1 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]" title="关闭">
            <X size={12} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="h-[calc(100%-32px)] bg-[#06060a]" />
    </div>
  );
}

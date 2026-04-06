"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Copy, Check, Download, Code, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────
export interface Artifact {
  id: string;
  type: 'code' | 'html' | 'svg' | 'mermaid' | 'markdown' | 'react';
  language: string;
  title: string;
  content: string;
  messageId: string;
}

interface ArtifactsPanelProps {
  messages: ChatMessage[];
  open: boolean;
  onClose: () => void;
}

// ─── Extraction ──────────────────────────────────────────
const CODE_BLOCK_RE = /```(\w+)?\n([\s\S]*?)```/g;

const LANG_TYPE_MAP: Record<string, Artifact['type']> = {
  html: 'html', htm: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
  markdown: 'markdown', md: 'markdown',
  jsx: 'react', tsx: 'react', react: 'react',
};

function inferTitle(lang: string, content: string, idx: number): string {
  if (lang === 'html' || lang === 'htm') {
    const m = content.match(/<title>(.*?)<\/title>/i);
    if (m) return m[1];
  }
  return `${lang || 'code'} #${idx + 1}`;
}

export function extractArtifacts(messages: ChatMessage[]): Artifact[] {
  const artifacts: Artifact[] = [];
  let globalIdx = 0;
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.content) continue;
    let match: RegExpExecArray | null;
    CODE_BLOCK_RE.lastIndex = 0;
    while ((match = CODE_BLOCK_RE.exec(msg.content)) !== null) {
      const lang = (match[1] || '').toLowerCase();
      const code = match[2].trim();
      if (!code) continue;
      artifacts.push({
        id: `${msg.id}_${globalIdx}`,
        type: LANG_TYPE_MAP[lang] || 'code',
        language: lang || 'text',
        title: inferTitle(lang, code, globalIdx),
        content: code,
        messageId: msg.id,
      });
      globalIdx++;
    }
  }
  return artifacts;
}

// ─── Syntax highlight (lazy shiki) ──────────────────────
let shikiHighlighter: any = null;
async function highlight(code: string, lang: string): Promise<string> {
  try {
    if (!shikiHighlighter) {
      const { createHighlighter } = await import('shiki');
      shikiHighlighter = await createHighlighter({
        themes: ['github-dark'],
        langs: [lang || 'text'],
      });
    }
    // Load lang on demand
    const loaded = shikiHighlighter.getLoadedLanguages();
    if (lang && !loaded.includes(lang)) {
      try { await shikiHighlighter.loadLanguage(lang); } catch { /* unsupported lang */ }
    }
    return shikiHighlighter.codeToHtml(code, { lang: lang || 'text', theme: 'github-dark' });
  } catch {
    // Fallback: escaped plain text
    const esc = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<pre style="padding:16px;overflow-x:auto;font-size:13px;line-height:1.6"><code>${esc}</code></pre>`;
  }
}

// ─── Code Viewer ─────────────────────────────────────────
function CodeViewer({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    highlight(code, language).then((h) => { if (!cancelled) setHtml(h); });
    return () => { cancelled = true; };
  }, [code, language]);

  if (!html) {
    return (
      <pre className="overflow-auto p-4 font-mono text-xs leading-6 text-[var(--text-secondary)]">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="overflow-auto text-xs leading-6 [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!bg-transparent"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── HTML Preview (sandboxed) ────────────────────────────
function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      className="h-full w-full border-0 bg-white"
      title="HTML Preview"
    />
  );
}

// ─── React/JSX Preview (sandboxed via iframe + Babel standalone) ─
function ReactPreview({ content }: { content: string }) {
  const html = useMemo(() => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; background: #fff; color: #1a1a1a; }
    #root { min-height: 100vh; }
    #error { color: #e11d48; font-family: monospace; font-size: 13px; white-space: pre-wrap; padding: 16px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="error"></div>
  <script type="text/babel" data-type="module">
    try {
      ${content}
      // Auto-render: look for default export or App component
      const Component = typeof App !== 'undefined' ? App : (typeof exports !== 'undefined' && exports.default ? exports.default : null);
      if (Component) {
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));
      }
    } catch (e) {
      document.getElementById('error').textContent = e.message + '\\n' + (e.stack || '');
    }
  <\/script>
</body>
</html>`, [content]);

  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      className="h-full w-full border-0 bg-white"
      title="React Preview"
    />
  );
}

// ─── Main Panel ──────────────────────────────────────────
function ArtifactsPanel({ messages, open, onClose }: ArtifactsPanelProps) {
  const artifacts = useMemo(() => extractArtifacts(messages), [messages]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [panelWidth, setPanelWidth] = useState(480);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Clamp active index
  useEffect(() => {
    if (activeIdx >= artifacts.length) setActiveIdx(Math.max(0, artifacts.length - 1));
  }, [artifacts.length, activeIdx]);

  // Auto-select latest artifact when new ones appear
  useEffect(() => {
    if (artifacts.length > 0) setActiveIdx(artifacts.length - 1);
  }, [artifacts.length]);

  // Reset preview mode on tab switch
  useEffect(() => { setPreviewMode(false); }, [activeIdx]);

  const current = artifacts[activeIdx];
  const isPreviewable = current && (current.type === 'html' || current.type === 'svg' || current.type === 'react');

  // ─── Drag resize ────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setPanelWidth(Math.max(320, Math.min(900, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  // ─── Actions ────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!current) return;
    navigator.clipboard.writeText(current.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [current]);

  const handleDownload = useCallback(() => {
    if (!current) return;
    const ext: Record<string, string> = {
      html: 'html', svg: 'svg', mermaid: 'mmd', markdown: 'md',
      javascript: 'js', typescript: 'ts', python: 'py', css: 'css',
      json: 'json', go: 'go', rust: 'rs', java: 'java',
    };
    const fileExt = ext[current.language] || current.language || 'txt';
    const blob = new Blob([current.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact-${activeIdx + 1}.${fileExt}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [current, activeIdx]);

  if (!open) return null;

  // No artifacts state
  if (artifacts.length === 0) {
    return (
      <div
        className="flex h-full flex-col border-l border-[var(--border-secondary)] bg-[var(--bg-primary)]"
        style={{ width: panelWidth }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-secondary)] px-4 py-3">
          <span className="text-sm font-medium text-[var(--text-primary)]">Artifacts</span>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--text-tertiary)]">
          AI 回复中的代码块会自动出现在这里
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col border-l border-[var(--border-secondary)] bg-[var(--bg-primary)]" style={{ width: panelWidth }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition hover:bg-[var(--brand-primary-light)]"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-secondary)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">Artifacts</span>
          <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
            {artifacts.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isPreviewable && (
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                previewMode
                  ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
              title={previewMode ? 'Show code' : 'Preview'}
            >
              {previewMode ? <Code size={13} /> : <Eye size={13} />}
              {previewMode ? 'Code' : 'Preview'}
            </button>
          )}
          <button onClick={handleCopy} className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" title="Copy">
            {copied ? <Check size={14} className="text-[var(--status-success)]" /> : <Copy size={14} />}
          </button>
          <button onClick={handleDownload} className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" title="Download">
            <Download size={14} />
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {artifacts.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-secondary)] px-3 py-1.5 scrollbar-none">
          {artifacts.length > 5 && activeIdx > 0 && (
            <button onClick={() => setActiveIdx(activeIdx - 1)} className="flex-shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <ChevronLeft size={14} />
            </button>
          )}
          {artifacts.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setActiveIdx(i)}
              className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                i === activeIdx
                  ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {a.title}
            </button>
          ))}
          {artifacts.length > 5 && activeIdx < artifacts.length - 1 && (
            <button onClick={() => setActiveIdx(activeIdx + 1)} className="flex-shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {current && previewMode && isPreviewable ? (
          current.type === 'react' ? (
            <ReactPreview content={current.content} />
          ) : (
            <HtmlPreview content={current.content} />
          )
        ) : current ? (
          <CodeViewer code={current.content} language={current.language} />
        ) : null}
      </div>

      {/* Footer */}
      {current && (
        <div className="flex items-center justify-between border-t border-[var(--border-secondary)] px-4 py-2 text-[11px] text-[var(--text-tertiary)]">
          <span>{current.language} · {current.content.split('\n').length} lines</span>
          <span>{(new Blob([current.content]).size / 1024).toFixed(1)} KB</span>
        </div>
      )}
    </div>
  );
}

export default ArtifactsPanel;

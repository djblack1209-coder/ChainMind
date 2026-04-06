"use client";

import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { Copy, Check, X } from 'lucide-react';

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  enableMath?: boolean;
  enableMermaid?: boolean;
  enableCopy?: boolean;
}

// ── LaTeX delimiter pre-processing ──────────────────────
// Normalize common LaTeX delimiters so remark-math can parse them.
// Handles: \(...\) → $...$, \[...\] → $$...$$
function preprocessLaTeX(content: string): string {
  // \( ... \) → inline math ([\s\S] instead of dotAll flag for ES2017 compat)
  let result = content.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => `$${inner}$`);
  // \[ ... \] → display math
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => `$$${inner}$$`);
  return result;
}

// ── Mermaid block renderer ──────────────────────────────
function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore — mermaid is dynamically imported; install via: npm install mermaid
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: 'transparent',
            primaryColor: '#ff6b57',
            primaryTextColor: '#f7f2ec',
            lineColor: '#998f89',
          },
        });
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { svg: rendered } = await mermaid.render(id, code.trim());
        if (!cancelled) setSvg(rendered);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Mermaid render failed');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-block-lang">mermaid (error)</span>
        </div>
        <pre className="code-block text-[var(--status-error)]">{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 flex items-center justify-center rounded-[var(--radius-md)] border border-white/8 bg-black/20 p-6">
        <span className="text-xs text-[var(--text-tertiary)] animate-pulse">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container my-3 overflow-x-auto rounded-[var(--radius-md)] border border-white/8 bg-black/20 p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ── Shiki syntax highlight (lazy, shared with ArtifactsPanel) ──
let shikiHighlighter: any = null;
async function highlightCode(code: string, lang: string): Promise<string | null> {
  try {
    if (!shikiHighlighter) {
      const { createHighlighter } = await import('shiki');
      shikiHighlighter = await createHighlighter({
        themes: ['github-dark'],
        langs: [lang || 'text'],
      });
    }
    const loaded = shikiHighlighter.getLoadedLanguages();
    if (lang && !loaded.includes(lang)) {
      try { await shikiHighlighter.loadLanguage(lang); } catch { /* unsupported */ }
    }
    return shikiHighlighter.codeToHtml(code, { lang: lang || 'text', theme: 'github-dark' });
  } catch {
    return null;
  }
}

// ── Code block with line numbers, language tag, copy button, Shiki highlight ──
function CodeBlock({
  className: codeClass,
  children,
  enableCopy = true,
  enableMermaid = true,
}: {
  className?: string;
  children?: React.ReactNode;
  enableCopy?: boolean;
  enableMermaid?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const text = String(children).replace(/\n$/, '');
  const lang = codeClass?.replace('language-', '') || '';
  const lines = text.split('\n');
  const isLong = lines.length > 30;

  // Mermaid detection
  if (enableMermaid && lang === 'mermaid') {
    return <MermaidBlock code={text} />;
  }

  // Lazy Shiki highlight
  useEffect(() => {
    let cancelled = false;
    highlightCode(text, lang).then((html) => {
      if (!cancelled && html) setHighlightedHtml(html);
    });
    return () => { cancelled = true; };
  }, [text, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  const displayLines = collapsed ? lines.slice(0, 15) : lines;

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <div className="flex items-center gap-2">
          <span className="code-block-lang">{lang || 'code'}</span>
          <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums">{lines.length} 行</span>
        </div>
        <div className="flex items-center gap-1">
          {isLong && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="code-block-copy"
              title={collapsed ? '展开' : '折叠'}
            >
              <span>{collapsed ? '展开' : '折叠'}</span>
            </button>
          )}
          {enableCopy && (
            <button onClick={handleCopy} className="code-block-copy" title="复制代码">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          )}
        </div>
      </div>
      <div className="code-block-body">
        {highlightedHtml && !collapsed ? (
          <div
            className="shiki-wrapper overflow-auto text-[13px] leading-6 [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!bg-transparent [&_pre]:!p-4"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="code-block !my-0"><code className={codeClass}>{displayLines.map((line, i) => (
            <span key={i} className="code-line">
              <span className="code-line-number">{i + 1}</span>
              <span className="code-line-content">{line}{i < displayLines.length - 1 ? '\n' : ''}</span>
            </span>
          ))}</code></pre>
        )}
      </div>
      {collapsed && isLong && (
        <div className="border-t border-white/5 px-4 py-2 text-center">
          <button onClick={() => setCollapsed(false)} className="text-[10px] text-[var(--brand-secondary)] hover:text-[var(--brand-primary)] transition">
            ... 还有 {lines.length - 15} 行，点击展开
          </button>
        </div>
      )}
    </div>
  );
}

// ── Image with click-to-zoom lightbox ───────────────────
function ImageWithZoom({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt || ''}
        className="my-2 max-w-full rounded-lg border border-white/8 cursor-zoom-in transition-transform hover:scale-[1.01]"
        onClick={() => setOpen(true)}
        {...props}
      />
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={src}
            alt={alt || ''}
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ── Main renderer ───────────────────────────────────────
function MarkdownRendererInner({
  content,
  className = '',
  enableMath = true,
  enableMermaid: mermaidEnabled = true,
  enableCopy = true,
}: MarkdownRendererProps) {
  const processed = enableMath ? preprocessLaTeX(content) : content;

  const remarkPlugins: any[] = [remarkGfm];
  if (enableMath) remarkPlugins.push(remarkMath);

  const rehypePlugins: any[] = [rehypeRaw];
  if (enableMath) rehypePlugins.push(rehypeKatex);

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          pre({ children }) {
            const codeEl = React.Children.toArray(children).find(
              (child) => React.isValidElement(child) && child.type === 'code'
            ) as React.ReactElement | undefined;

            if (codeEl) {
              return (
                <CodeBlock
                  className={codeEl.props.className}
                  enableCopy={enableCopy}
                  enableMermaid={mermaidEnabled}
                >
                  {codeEl.props.children}
                </CodeBlock>
              );
            }
            return <pre className="code-block">{children}</pre>;
          },
          code({ className: codeClass, children, ...props }) {
            const isInline = !codeClass;
            if (isInline) {
              return <code className="inline-code" {...props}>{children}</code>;
            }
            return <code className={codeClass} {...props}>{children}</code>;
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="md-link" {...props}>
                {children}
              </a>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table className="md-table" {...props}>{children}</table>
              </div>
            );
          },
          img({ src, alt, ...props }) {
            return <ImageWithZoom src={src} alt={alt} {...props} />;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);

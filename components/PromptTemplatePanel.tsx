"use client";

import React, { useState, useMemo } from 'react';
import type { PromptTemplate } from '@/lib/prompt-templates';
import { BUILTIN_TEMPLATES } from '@/lib/prompt-templates';

const CATEGORIES = [
  { id: 'all', label: '全部', icon: '📦' },
  { id: 'coding', label: '编程', icon: '💻' },
  { id: 'writing', label: '写作', icon: '✏️' },
  { id: 'analysis', label: '分析', icon: '📊' },
  { id: 'creative', label: '创意', icon: '🎨' },
  { id: 'translation', label: '翻译', icon: '🌐' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (template: PromptTemplate) => void;
}

export default function PromptTemplatePanel({ open, onClose, onApply }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filtered = useMemo(() => {
    let list = BUILTIN_TEMPLATES;
    if (activeCategory !== 'all') {
      list = list.filter(t => t.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.includes(q))
      );
    }
    return list;
  }, [search, activeCategory]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-full border-l border-[var(--border-secondary)] bg-[var(--bg-primary)] shadow-[var(--shadow-lg)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-tertiary)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">提示词模板</h2>
            <p className="text-[10px] text-[var(--text-tertiary)]">{filtered.length} 个模板</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索模板..."
            className="w-full rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-primary)]"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto px-4 pt-3 pb-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                activeCategory === cat.id
                  ? 'bg-[var(--brand-primary-soft)] text-[var(--text-primary)] border border-[var(--border-primary)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] border border-transparent'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-1 gap-2">
            {filtered.map(template => (
              <button
                key={template.id}
                onClick={() => { onApply(template); onClose(); }}
                className="group rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-3 text-left transition hover:border-[var(--border-primary)] hover:bg-[var(--brand-primary-soft)]"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{template.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{template.name}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)] line-clamp-2">{template.description}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {template.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-xs text-[var(--text-tertiary)]">没有匹配的模板</div>
          )}
        </div>
      </div>
    </>
  );
}

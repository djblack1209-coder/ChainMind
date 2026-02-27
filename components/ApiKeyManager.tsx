"use client";

import React, { useState, useEffect } from 'react';
import { useApiKeyStore } from '@/stores/api-key-store';
import type { AIProvider } from '@/lib/types';
import { DEFAULT_BASE_URLS } from '@/lib/types';

const PROVIDERS: { id: AIProvider; label: string; desc: string; placeholder: string; color: string; icon: string; defaultUrl: string }[] = [
  {
    id: 'claude', label: 'Claude', desc: 'Anthropic',
    placeholder: 'sk-ant-api03-...',
    color: 'from-orange-500/20 to-orange-600/10 border-orange-500/20',
    icon: 'C',
    defaultUrl: DEFAULT_BASE_URLS.claude,
  },
  {
    id: 'openai', label: 'OpenAI', desc: 'GPT-4o',
    placeholder: 'sk-proj-...',
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20',
    icon: 'O',
    defaultUrl: DEFAULT_BASE_URLS.openai,
  },
  {
    id: 'gemini', label: 'Gemini', desc: 'Google AI',
    placeholder: 'AIza...',
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/20',
    icon: 'G',
    defaultUrl: DEFAULT_BASE_URLS.gemini,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ApiKeyManager({ open, onClose }: Props) {
  const { keys, baseUrls, loaded, loadKeys, saveKey, removeKey, setBaseUrl, testConnection } = useApiKeyStore();
  const [inputs, setInputs] = useState<Record<AIProvider, string>>({ claude: '', openai: '', gemini: '' });
  const [urlInputs, setUrlInputs] = useState<Record<AIProvider, string>>({ claude: '', openai: '', gemini: '' });
  const [testing, setTesting] = useState<Record<AIProvider, boolean>>({ claude: false, openai: false, gemini: false });
  const [results, setResults] = useState<Record<AIProvider, { ok: boolean; latencyMs: number; error?: string } | null>>({ claude: null, openai: null, gemini: null });
  const [showAdvanced, setShowAdvanced] = useState<Record<AIProvider, boolean>>({ claude: false, openai: false, gemini: false });
  const [testModels, setTestModels] = useState<Record<AIProvider, string>>({ claude: 'claude-3-haiku', openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash' });
  const [justSaved, setJustSaved] = useState<AIProvider | null>(null);

  useEffect(() => { if (!loaded) loadKeys(); }, [loaded, loadKeys]);

  // Sync URL inputs with store
  useEffect(() => {
    if (loaded) {
      setUrlInputs(baseUrls);
    }
  }, [loaded, baseUrls]);

  if (!open) return null;

  const handleSave = async (p: AIProvider) => {
    const val = inputs[p].trim();
    if (!val) return;
    await saveKey(p, val);
    // Also save URL if changed
    const urlVal = urlInputs[p].trim();
    if (urlVal && urlVal !== baseUrls[p]) {
      await setBaseUrl(p, urlVal);
    }
    setInputs((prev) => ({ ...prev, [p]: '' }));
    setResults((prev) => ({ ...prev, [p]: null }));
    setJustSaved(p);
    setTimeout(() => setJustSaved(null), 2000);
  };

  const handleSaveUrl = async (p: AIProvider) => {
    const urlVal = urlInputs[p].trim();
    if (urlVal) {
      await setBaseUrl(p, urlVal);
      setJustSaved(p);
      setTimeout(() => setJustSaved(null), 2000);
    }
  };

  const handleTest = async (p: AIProvider) => {
    setTesting((prev) => ({ ...prev, [p]: true }));
    setResults((prev) => ({ ...prev, [p]: null }));
    const r = await testConnection(p, testModels[p]);
    setResults((prev) => ({ ...prev, [p]: r }));
    setTesting((prev) => ({ ...prev, [p]: false }));
  };

  const handleResetUrl = async (p: AIProvider) => {
    const defaultUrl = PROVIDERS.find((pr) => pr.id === p)?.defaultUrl || '';
    setUrlInputs((prev) => ({ ...prev, [p]: defaultUrl }));
    await setBaseUrl(p, defaultUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[580px] max-h-[90vh] bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl flex flex-col animate-fade-in-scale" style={{ boxShadow: 'var(--shadow-glow-strong)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-secondary)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
              API 设置
            </h2>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">支持官方 API 和第三方中转服务</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {PROVIDERS.map(({ id, label, desc, placeholder, color, icon, defaultUrl }) => {
            const hasKey = keys[id] !== null;
            const result = results[id];
            const isSaved = justSaved === id;
            const isCustomUrl = urlInputs[id] !== defaultUrl;

            return (
              <div key={id} className={`p-4 rounded-xl bg-gradient-to-br ${color} border transition-all ${isSaved ? 'ring-2 ring-green-400/50' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-sm font-bold text-[var(--text-primary)]">{icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">{desc}</div>
                  </div>
                  {hasKey ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      已配置{isCustomUrl ? ' (中转)' : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-primary)] px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      未配置
                    </span>
                  )}
                </div>

                {/* API Key input */}
                <div className="flex gap-2 mb-2">
                  <input
                    type="password"
                    value={inputs[id]}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder={hasKey ? '输入新密钥替换...' : placeholder}
                    className="input text-xs flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(id); }}
                  />
                  <button onClick={() => handleSave(id)} disabled={!inputs[id].trim()} className="btn btn-primary text-xs py-1.5 px-4">
                    {isSaved ? '已保存' : '保存'}
                  </button>
                </div>

                {/* Advanced: Base URL */}
                <button
                  onClick={() => setShowAdvanced((prev) => ({ ...prev, [id]: !prev[id] }))}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition mb-1"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    className={`transition-transform ${showAdvanced[id] ? 'rotate-90' : ''}`}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {showAdvanced[id] ? '收起高级设置' : '高级设置 (自定义接口地址)'}
                  {isCustomUrl && !showAdvanced[id] && <span className="text-amber-400 ml-1">· 使用中转</span>}
                </button>

                {showAdvanced[id] && (
                  <div className="mt-2 p-3 rounded-lg bg-[var(--bg-primary)]/50 border border-[var(--border-secondary)] space-y-2 animate-fade-in">
                    <label className="block text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">
                      API 接口地址 (Base URL)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={urlInputs[id]}
                        onChange={(e) => setUrlInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                        placeholder={defaultUrl}
                        className="input text-xs flex-1 font-mono"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUrl(id); }}
                      />
                      <button onClick={() => handleSaveUrl(id)} className="btn btn-secondary text-xs py-1.5 px-3">保存</button>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        如使用第三方中转，填入中转服务地址即可，如: https://your-proxy.com
                      </p>
                      {isCustomUrl && (
                        <button onClick={() => handleResetUrl(id)} className="text-[10px] text-amber-400 hover:text-amber-300 transition">
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {hasKey && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={testModels[id]}
                        onChange={(e) => setTestModels((prev) => ({ ...prev, [id]: e.target.value }))}
                        placeholder="测试用模型名称"
                        className="input text-xs flex-1 font-mono"
                      />
                      <button onClick={() => handleTest(id)} disabled={testing[id]} className="btn btn-secondary text-[11px] py-1.5 px-3 flex-shrink-0">
                        {testing[id] ? (
                          <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg> 测试中...</>
                        ) : '测试连接'}
                      </button>
                      <button onClick={() => { removeKey(id); setResults((prev) => ({ ...prev, [id]: null })); }} className="btn btn-ghost text-[11px] py-1.5 px-3 flex-shrink-0 !text-red-400 hover:!bg-red-500/10">
                        删除
                      </button>
                    </div>
                    {result && (
                      <div className={`text-[11px] font-medium ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {result.ok ? `连接成功 (${result.latencyMs}ms)` : `失败: ${result.error?.slice(0, 120)}`}
                      </div>
                    )}
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      填入你的中转服务支持的模型名称再测试，如: claude-3-haiku, gpt-4o-mini
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-secondary)] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            密钥加密存储在浏览器本地
          </div>
          <button onClick={onClose} className="btn btn-primary text-xs py-1.5 px-5">完成</button>
        </div>
      </div>
    </div>
  );
}

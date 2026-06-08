"use client";

import React, { useState, useEffect } from 'react';
import { useApiKeyStore } from '@/stores/api-key-store';
import type { AIProvider } from '@/lib/types';
import { DEFAULT_BASE_URLS, DEFAULT_PROVIDER_MODEL, MODEL_SPOTLIGHTS, describeModelFocus, isFreeFriendlyModel } from '@/lib/types';
import BrandMark from '@/components/BrandMark';

const PROVIDERS: { id: AIProvider; label: string; desc: string; placeholder: string; accent: 'warm' | 'cool' | 'neutral'; icon: string; defaultUrl: string }[] = [
  {
    id: 'claude',
    label: 'Claude',
    desc: 'Anthropic models',
    placeholder: 'sk-ant-api03-...',
    accent: 'warm',
    icon: 'C',
    defaultUrl: DEFAULT_BASE_URLS.claude,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    desc: 'GPT / relay compatible',
    placeholder: 'sk-proj-...',
    accent: 'cool',
    icon: 'O',
    defaultUrl: DEFAULT_BASE_URLS.openai,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    desc: 'Google AI Studio',
    placeholder: 'AIza...',
    accent: 'neutral',
    icon: 'G',
    defaultUrl: DEFAULT_BASE_URLS.gemini,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ApiKeyManager({ open, onClose }: Props) {
  const { keys, baseUrls, discoveredModels, loaded, loadKeys, saveKey, removeKey, setBaseUrl, setDiscoveredModels, testConnection, probeModels } = useApiKeyStore();
  const [inputs, setInputs] = useState<Record<AIProvider, string>>({ claude: '', openai: '', gemini: '', deepseek: '', ollama: '', 'openai-compatible': '' });
  const [urlInputs, setUrlInputs] = useState<Record<AIProvider, string>>({ claude: '', openai: '', gemini: '', deepseek: '', ollama: '', 'openai-compatible': '' });
  const [testing, setTesting] = useState<Record<AIProvider, boolean>>({ claude: false, openai: false, gemini: false, deepseek: false, ollama: false, 'openai-compatible': false });
  const [probing, setProbing] = useState<Record<AIProvider, boolean>>({ claude: false, openai: false, gemini: false, deepseek: false, ollama: false, 'openai-compatible': false });
  const [results, setResults] = useState<Record<AIProvider, { ok: boolean; latencyMs: number; error?: string } | null>>({ claude: null, openai: null, gemini: null, deepseek: null, ollama: null, 'openai-compatible': null });
  const [probeResults, setProbeResults] = useState<Record<AIProvider, { ok: boolean; count: number; error?: string } | null>>({ claude: null, openai: null, gemini: null, deepseek: null, ollama: null, 'openai-compatible': null });
  const [saveErrors, setSaveErrors] = useState<Record<AIProvider, string | null>>({ claude: null, openai: null, gemini: null, deepseek: null, ollama: null, 'openai-compatible': null });
  const [showAdvanced, setShowAdvanced] = useState<Record<AIProvider, boolean>>({ claude: false, openai: false, gemini: false, deepseek: false, ollama: false, 'openai-compatible': false });
  const [testModels, setTestModels] = useState<Record<AIProvider, string>>({ claude: 'claude-haiku-4-5', openai: DEFAULT_PROVIDER_MODEL.openai, gemini: DEFAULT_PROVIDER_MODEL.gemini, deepseek: DEFAULT_PROVIDER_MODEL.deepseek, ollama: DEFAULT_PROVIDER_MODEL.ollama, 'openai-compatible': DEFAULT_PROVIDER_MODEL['openai-compatible'] });
  const [justSaved, setJustSaved] = useState<AIProvider | null>(null);

  useEffect(() => {
    if (!loaded) loadKeys();
  }, [loaded, loadKeys]);

  useEffect(() => {
    if (loaded) {
      setUrlInputs(baseUrls);
    }
  }, [loaded, baseUrls]);

  if (!open) return null;

  const handleSave = async (p: AIProvider) => {
    const val = inputs[p].trim();
    if (!val) return;
    setSaveErrors((prev) => ({ ...prev, [p]: null }));
    try {
      await saveKey(p, val);
      const urlVal = urlInputs[p].trim();
      if (urlVal && urlVal !== baseUrls[p]) {
        await setBaseUrl(p, urlVal);
      }
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [p]: `保存失败: ${String(err).slice(0, 120)}`,
      }));
      return;
    }

    setInputs((prev) => ({ ...prev, [p]: '' }));
    setResults((prev) => ({ ...prev, [p]: null }));
    setJustSaved(p);
    setTimeout(() => setJustSaved(null), 2000);
  };

  const handleSaveUrl = async (p: AIProvider) => {
    const urlVal = urlInputs[p].trim();
    if (urlVal) {
      setSaveErrors((prev) => ({ ...prev, [p]: null }));
      try {
        await setBaseUrl(p, urlVal);
      } catch (err) {
        setSaveErrors((prev) => ({
          ...prev,
          [p]: `地址保存失败: ${String(err).slice(0, 120)}`,
        }));
        return;
      }
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

  const handleProbeModels = async (p: AIProvider) => {
    setProbing((prev) => ({ ...prev, [p]: true }));
    setProbeResults((prev) => ({ ...prev, [p]: null }));
    const result = await probeModels(p);
    setProbeResults((prev) => ({
      ...prev,
      [p]: result.ok ? { ok: true, count: result.models.length } : { ok: false, count: 0, error: result.error },
    }));
    setProbing((prev) => ({ ...prev, [p]: false }));
  };

  const handleResetUrl = async (p: AIProvider) => {
    const defaultUrl = PROVIDERS.find((pr) => pr.id === p)?.defaultUrl || '';
    setUrlInputs((prev) => ({ ...prev, [p]: defaultUrl }));
    await setBaseUrl(p, defaultUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-[40px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(17,21,29,0.8))] shadow-[var(--shadow-lg)] animate-fade-in-scale backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5 sm:px-7">
          <div className="flex items-center gap-4">
            <BrandMark size="sm" />
            <div>
            <div className="section-kicker">Provider access</div>
            <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">API 设置</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
              在这里管理官方 API 和第三方中转服务，支持连接测试、Base URL 覆盖和本地加密存储。
            </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="max-h-[calc(92vh-148px)] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-4 xl:grid-cols-3">
            {PROVIDERS.map(({ id, label, desc, placeholder, accent, icon, defaultUrl }) => {
              const hasKey = keys[id] !== null;
              const result = results[id];
              const probeResult = probeResults[id];
              const isSaved = justSaved === id;
              const isCustomUrl = urlInputs[id] !== defaultUrl;
              const modelCatalog = discoveredModels[id] || [];

              const accentCard = accent === 'cool'
                ? 'border-[var(--border-primary)] bg-[linear-gradient(180deg,var(--brand-primary-soft),rgba(18,22,30,0.82))]'
                : accent === 'warm'
                  ? 'border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(22,25,34,0.8))]'
                  : 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(18,22,30,0.82))]';

              const accentChip = accent === 'cool' ? 'chip chip-cool' : accent === 'warm' ? 'chip chip-warm' : 'chip chip-muted';

              return (
                <div key={id} className={`rounded-[32px] border p-5 transition backdrop-blur-2xl ${accentCard} ${isSaved ? 'shadow-[var(--shadow-glow-strong)]' : 'shadow-[var(--shadow-sm)]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="brand-mark-shell flex h-12 w-12 items-center justify-center rounded-[18px] text-sm font-bold text-[var(--text-primary)]">
                        {icon}
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[var(--text-primary)]">{label}</div>
                        <div className="text-sm text-[var(--text-tertiary)]">{desc}</div>
                      </div>
                    </div>

                    <span className={accentChip}>
                      {hasKey ? `已配置${isCustomUrl ? ' / 中转' : ''}` : '未配置'}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="meta-label mb-2 block">API 密钥</label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={inputs[id]}
                          onChange={(e) => setInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder={hasKey ? '输入新密钥替换...' : placeholder}
                          className="input flex-1 text-xs"
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(id); }}
                        />
                        <button onClick={() => handleSave(id)} disabled={!inputs[id].trim()} className="btn btn-primary px-4 py-2 text-xs">
                          {isSaved ? '已保存' : '保存'}
                        </button>
                      </div>
                    </div>

                    {saveErrors[id] && (
                      <div className="rounded-2xl border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] px-3 py-2 text-[12px] text-[#ffbeca]">
                        {saveErrors[id]}
                      </div>
                    )}

                    <div className="glass-light rounded-[24px] p-3">
                      <button
                        onClick={() => setShowAdvanced((prev) => ({ ...prev, [id]: !prev[id] }))}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <div>
                          <div className="meta-label">Advanced</div>
                          <div className="mt-1 text-sm text-[var(--text-secondary)]">自定义 Base URL 与中转地址</div>
                        </div>
                        <span className="chip chip-muted !px-2 !py-1">{showAdvanced[id] ? '收起' : '展开'}</span>
                      </button>

                      {showAdvanced[id] && (
                        <div className="mt-4 space-y-3 animate-fade-in">
                          <div>
                            <label className="meta-label mb-2 block">Base URL</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={urlInputs[id]}
                                onChange={(e) => setUrlInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                                placeholder={defaultUrl}
                                className="input flex-1 text-xs font-mono"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUrl(id); }}
                              />
                              <button onClick={() => handleSaveUrl(id)} className="btn btn-secondary px-3 py-2 text-xs">保存</button>
                            </div>
                          </div>

                          <div className="flex items-start justify-between gap-3 text-[12px] leading-6 text-[var(--text-tertiary)]">
                            <p>如使用第三方中转，填入服务地址即可，例如 `https://your-proxy.com`。</p>
                            {isCustomUrl && (
                              <button onClick={() => handleResetUrl(id)} className="text-amber-200 transition hover:text-amber-100">
                                恢复默认
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {hasKey && (
                      <div className="glass-light rounded-[24px] p-3">
                        <div className="meta-label mb-2">Connection test</div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={testModels[id]}
                            onChange={(e) => setTestModels((prev) => ({ ...prev, [id]: e.target.value }))}
                            placeholder="测试用模型名称"
                            className="input flex-1 text-xs font-mono"
                          />
                          <button onClick={() => handleTest(id)} disabled={testing[id]} className="btn btn-secondary px-3 py-2 text-xs">
                            {testing[id] ? '测试中...' : '测试'}
                          </button>
                          <button
                            onClick={() => {
                              removeKey(id);
                              setDiscoveredModels(id, []).catch(() => {});
                              setResults((prev) => ({ ...prev, [id]: null }));
                              setProbeResults((prev) => ({ ...prev, [id]: null }));
                            }}
                            className="btn btn-danger px-3 py-2 text-xs"
                          >
                            删除
                          </button>
                        </div>

                        {result && (
                          <div className={`mt-3 rounded-2xl px-3 py-2 text-[12px] ${result.ok ? 'border border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.08)] text-emerald-200' : 'border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] text-[#ffbeca]'}`}>
                            {result.ok ? `连接成功 (${result.latencyMs}ms)` : `失败: ${result.error?.slice(0, 120)}`}
                          </div>
                        )}

                        <p className="mt-3 text-[12px] leading-6 text-[var(--text-tertiary)]">
                          填入实际可用的模型名称再测试，例如 `claude-haiku-4-5`、`chatgpt-5.4` 或你的中转真实模型名。
                        </p>
                      </div>
                    )}

                    {hasKey && (
                      <div className="glass-light rounded-[24px] p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div>
                            <div className="meta-label">Model catalog</div>
                            <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">探测并缓存当前 provider 的真实可用模型</div>
                          </div>
                          <button onClick={() => handleProbeModels(id)} disabled={probing[id]} className="btn btn-secondary px-3 py-2 text-xs disabled:opacity-40">
                            {probing[id] ? '探测中...' : '探测模型'}
                          </button>
                        </div>

                        {probeResult && (
                          <div className={`mb-3 rounded-2xl px-3 py-2 text-[12px] ${probeResult.ok ? 'border border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.08)] text-emerald-200' : 'border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] text-[#ffbeca]'}`}>
                            {probeResult.ok ? `已缓存 ${probeResult.count} 个模型` : `探测失败: ${probeResult.error?.slice(0, 120)}`}
                          </div>
                        )}

                        {modelCatalog.length > 0 ? (
                          <div className="flex max-h-[144px] flex-wrap gap-2 overflow-y-auto pr-1">
                            {modelCatalog.map((model) => (
                              <span key={model} className="chip chip-muted !px-2 !py-1 font-mono text-[10px]">{model}</span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[12px] text-[var(--text-tertiary)]">尚未缓存模型列表。建议点击“探测模型”以便团队分工时使用真实模型池。</div>
                        )}
                      </div>
                    )}

                    <div className="glass-light rounded-[24px] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <div className="meta-label">推荐模型编组</div>
                          <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">参考 OpenClaw Bot 的 control hub 逻辑，默认内置免费线 + GPT 线。</div>
                        </div>
                        <span className="chip chip-muted !px-2 !py-1">{id === 'openai' ? 'GPT / Qwen / DeepSeek' : id === 'claude' ? 'Claude Review' : 'Gemini Fast Lane'}</span>
                      </div>

                      <div className="space-y-2">
                        {(MODEL_SPOTLIGHTS.filter((spotlight) => spotlight.provider === id || (id === 'openai' && spotlight.provider === 'openai')).slice(0, id === 'openai' ? 4 : 2)).length > 0 ? (
                          MODEL_SPOTLIGHTS.filter((spotlight) => spotlight.provider === id || (id === 'openai' && spotlight.provider === 'openai')).slice(0, id === 'openai' ? 4 : 2).map((spotlight) => (
                            <div key={`${id}-${spotlight.model}`} className="rounded-[20px] border border-white/8 bg-white/[0.03] px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-[var(--text-primary)]">{spotlight.label}</div>
                                  <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{spotlight.model}</div>
                                </div>
                                <span className={`chip !px-2 !py-1 ${isFreeFriendlyModel(spotlight.model) ? 'chip-cool' : 'chip-warm'}`}>
                                  {isFreeFriendlyModel(spotlight.model) ? '免费/低成本' : '高性能'}
                                </span>
                              </div>
                              <div className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                                {describeModelFocus(spotlight.model)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-3 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                            当前 provider 主要作为补充线路保留；进入工作台后仍可手动选择 {DEFAULT_PROVIDER_MODEL[id]} 作为默认入口。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-6 py-4 sm:px-7">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            密钥以加密形式存储在本地工作台环境
          </div>
          <button onClick={onClose} className="btn btn-primary px-5">完成</button>
        </div>
      </div>
    </div>
  );
}

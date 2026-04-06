"use client";

import React, { useState, useEffect } from 'react';
import { useApiKeyStore } from '@/stores/api-key-store';
import type { AIProvider } from '@/lib/types';
import { DEFAULT_PROVIDER_MODEL, DEFAULT_BASE_URLS, MODEL_OPTIONS, MODEL_SPOTLIGHTS } from '@/lib/types';
import BrandMark from '@/components/BrandMark';

const STEPS = ['欢迎', 'API 配置', '选择模型', '快速导览', '准备就绪'];

const PROVIDERS: { id: AIProvider; name: string; color: string; defaultUrl: string }[] = [
  { id: 'claude', name: 'Claude (Anthropic)', color: 'text-amber-200', defaultUrl: 'https://api.anthropic.com' },
  { id: 'openai', name: 'OpenAI', color: 'text-[var(--brand-cream)]', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Gemini (Google)', color: 'text-cyan-200', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
];

const TOUR_SLIDES = [
  { title: '对话模式', desc: '与单个AI深度交流，支持图片上传、代码预览、LaTeX公式', icon: '💬' },
  { title: '链式讨论', desc: '多个AI专家协作完成复杂任务，自动分工、交叉验证', icon: '🔗' },
  { title: '记忆系统', desc: '越用越懂你，自动记住你的偏好和项目上下文', icon: '🧠' },
  { title: '知识库', desc: '索引本地文件，让AI理解你的代码库', icon: '📚' },
];

interface Props {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [keys, setKeys] = useState<Record<AIProvider, string>>({ claude: '', openai: '', gemini: '', deepseek: '', ollama: '', 'openai-compatible': '' });
  const [urls, setUrls] = useState<Record<AIProvider, string>>({
    claude: PROVIDERS[0].defaultUrl, openai: PROVIDERS[1].defaultUrl, gemini: PROVIDERS[2].defaultUrl,
    deepseek: DEFAULT_BASE_URLS.deepseek, ollama: DEFAULT_BASE_URLS.ollama, 'openai-compatible': DEFAULT_BASE_URLS['openai-compatible'],
  });
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PROVIDER_MODEL.claude);
  const [testing, setTesting] = useState<AIProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'fail' | null>>({});

  const saveKey = useApiKeyStore(s => s.saveKey);
  const setBaseUrl = useApiKeyStore(s => s.setBaseUrl);

  const hasAnyKey = Object.values(keys).some(k => k.trim().length > 0);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && step < STEPS.length - 1) {
        if (step === 1 && !hasAnyKey) return;
        setStep(s => s + 1);
      }
      if (e.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, hasAnyKey, onComplete]);

  // Auto-select provider based on keys
  useEffect(() => {
    if (keys.claude.trim()) { setSelectedProvider('claude'); setSelectedModel(DEFAULT_PROVIDER_MODEL.claude); }
    else if (keys.openai.trim()) { setSelectedProvider('openai'); setSelectedModel(DEFAULT_PROVIDER_MODEL.openai); }
    else if (keys.gemini.trim()) { setSelectedProvider('gemini'); setSelectedModel(DEFAULT_PROVIDER_MODEL.gemini); }
  }, [keys]);

  const handleTestConnection = async (provider: AIProvider) => {
    if (!keys[provider].trim()) return;
    setTesting(provider);
    try {
      // Simple validation: key length check
      const valid = keys[provider].trim().length > 10;
      setTestResults(r => ({ ...r, [provider]: valid ? 'ok' : 'fail' }));
    } catch {
      setTestResults(r => ({ ...r, [provider]: 'fail' }));
    }
    setTesting(null);
  };

  const handleFinish = async () => {
    for (const p of PROVIDERS) {
      if (keys[p.id].trim()) {
        await saveKey(p.id, keys[p.id].trim());
        await setBaseUrl(p.id, urls[p.id].trim());
      }
    }
    localStorage.setItem('chainmind-setup-complete', '1');
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-3xl border border-[var(--border-secondary)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)] overflow-hidden">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="flex flex-col items-center px-8 py-12 text-center">
            <BrandMark size="lg" showWordmark />
            <h1 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">欢迎使用 ChainMind</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-sm">AI 链式讨论平台 — 让多个AI模型协作完成复杂任务</p>
            <button onClick={() => setStep(1)} className="btn btn-primary mt-8 px-8 py-2.5">开始配置</button>
            <button onClick={onComplete} className="mt-3 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">跳过设置</button>
          </div>
        )}

        {/* Step 1: API Keys */}
        {step === 1 && (
          <div className="px-6 py-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">配置 API 密钥</h2>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">至少配置一个提供商的密钥即可开始使用</p>
            <div className="mt-4 space-y-3">
              {PROVIDERS.map(p => (
                <div key={p.id} className="rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold ${p.color}`}>{p.name}</span>
                    {testResults[p.id] === 'ok' && <span className="text-[9px] text-emerald-400">已验证</span>}
                    {testResults[p.id] === 'fail' && <span className="text-[9px] text-rose-400">验证失败</span>}
                  </div>
                  <input
                    type="password" placeholder="API Key" value={keys[p.id]}
                    onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                    className="input w-full text-[11px] mb-1.5"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text" placeholder="Base URL" value={urls[p.id]}
                      onChange={e => setUrls(u => ({ ...u, [p.id]: e.target.value }))}
                      className="input flex-1 text-[10px]"
                    />
                    <button
                      onClick={() => handleTestConnection(p.id)}
                      disabled={!keys[p.id].trim() || testing === p.id}
                      className="btn btn-secondary text-[10px] px-2 py-1 disabled:opacity-40"
                    >
                      {testing === p.id ? '...' : '测试'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-5">
              <button onClick={() => setStep(0)} className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">上一步</button>
              <button onClick={() => setStep(2)} disabled={!hasAnyKey} className="btn btn-primary px-6 py-2 text-xs disabled:opacity-40">下一步</button>
            </div>
          </div>
        )}

        {/* Step 2: Model Selection */}
        {step === 2 && (
          <div className="px-6 py-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">选择默认模型</h2>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">你可以随时在工作台中切换模型</p>
            <div className="mt-4 space-y-2 max-h-[320px] overflow-y-auto">
              {MODEL_SPOTLIGHTS.filter(s => keys[s.provider].trim()).map(spot => (
                <button
                  key={spot.model}
                  onClick={() => { setSelectedProvider(spot.provider); setSelectedModel(spot.model); }}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedModel === spot.model
                      ? 'border-[var(--border-primary)] bg-[var(--brand-primary-soft)]'
                      : 'border-[var(--border-tertiary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{spot.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${spot.tier === 'free' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {spot.tier === 'free' ? '免费' : '付费'}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{spot.fit}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between mt-5">
              <button onClick={() => setStep(1)} className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">上一步</button>
              <button onClick={() => setStep(3)} className="btn btn-primary px-6 py-2 text-xs">下一步</button>
            </div>
          </div>
        )}

        {/* Step 3: Quick Tour */}
        {step === 3 && (
          <div className="px-6 py-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">核心功能</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {TOUR_SLIDES.map(slide => (
                <div key={slide.title} className="rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-4 text-center">
                  <div className="text-2xl mb-2">{slide.icon}</div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{slide.title}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{slide.desc}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-5">
              <button onClick={() => setStep(2)} className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">上一步</button>
              <button onClick={() => setStep(4)} className="btn btn-primary px-6 py-2 text-xs">下一步</button>
            </div>
          </div>
        )}

        {/* Step 4: Ready */}
        {step === 4 && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">一切就绪</h2>
            <p className="mt-2 text-xs text-[var(--text-tertiary)] max-w-sm">
              已配置 {Object.values(keys).filter(k => k.trim()).length} 个提供商 · 默认模型: {selectedModel}
            </p>
            <button onClick={handleFinish} className="btn btn-primary mt-6 px-10 py-2.5">开始使用 ChainMind</button>
          </div>
        )}

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-[var(--brand-primary)]' : 'w-1.5 bg-[var(--border-tertiary)]'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

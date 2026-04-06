"use client";

import React, { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import { probeModelsRequest } from '@/lib/llm-client';
import { DEFAULT_PROVIDER_MODEL, pickStrongestModel, fuzzyMatchModel } from '@/lib/types';
import type { AIProvider } from '@/lib/types';

const PROVIDERS: { value: AIProvider; label: string; tone: 'warm' | 'cool' | 'neutral' }[] = [
  { value: 'openai', label: 'OpenAI / 中转', tone: 'cool' },
  { value: 'claude', label: 'Claude', tone: 'warm' },
  { value: 'gemini', label: 'Gemini', tone: 'neutral' },
];

export function InlineConfigForm({ onDone }: { onDone: () => void }) {
  const saveKey = useApiKeyStore((s) => s.saveKey);
  const setBaseUrl = useApiKeyStore((s) => s.setBaseUrl);
  const hydrateDiscoveredModels = useApiKeyStore((s) => s.hydrateDiscoveredModels);
  const testConnection = useApiKeyStore((s) => s.testConnection);
  const createConversation = useChatStore((s) => s.createConversation);

  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl_] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'testing' | 'probing' | 'done' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [probedModels, setProbedModels] = useState<string[]>([]);

  useEffect(() => {
    const k = apiKey.trim();
    if (k.startsWith('sk-ant-')) setProvider('claude');
    else if (k.startsWith('AIza')) setProvider('gemini');
  }, [apiKey]);

  const handleSaveAndTest = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    setStatusMsg('正在保存密钥...');

    try {
      const allProviders: AIProvider[] = ['claude', 'openai', 'gemini'];
      if (baseUrl.trim()) {
        for (const p of allProviders) {
          await saveKey(p, apiKey.trim());
        }
      } else {
        await saveKey(provider, apiKey.trim());
      }

      if (baseUrl.trim()) {
        let cleanUrl = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
        if (cleanUrl.startsWith('https://https://')) cleanUrl = cleanUrl.replace('https://https://', 'https://');

        for (const p of allProviders) {
          await setBaseUrl(p, cleanUrl);
        }

        setStatus('probing');
        setStatusMsg('正在探测可用模型...');

        try {
          const data = await probeModelsRequest(cleanUrl, apiKey.trim());
          if (data.models?.length) {
            await hydrateDiscoveredModels(data.models);
            setProbedModels(data.models);
            if (model) {
              const corrected = fuzzyMatchModel(model, data.models);
              if (corrected) setModel(corrected);
            }
            if (!model) {
              const best = pickStrongestModel(data.models);
              if (best && best.score > 0) {
                setModel(best.model);
                if (best.provider !== provider) {
                  setProvider(best.provider);
                }
              } else {
                setModel(data.models[0]);
              }
            }
            setStatusMsg(`发现 ${data.models.length} 个模型`);
          }
        } catch {
          // ignore probe failure and continue with manual/default model
        }
      }

      setStatus('testing');
      setStatusMsg('正在测试连接...');
      const finalModel = model.trim() || DEFAULT_PROVIDER_MODEL[provider];
      const result = await testConnection(provider, finalModel);

      if (result.ok) {
        setStatus('done');
        setStatusMsg(`连接成功 (${result.latencyMs}ms)`);
        createConversation(provider, finalModel);
        setTimeout(() => onDone(), 800);
      } else {
        setStatus('done');
        setStatusMsg(`已保存。测试: ${result.error?.slice(0, 100) || '连接失败，但密钥已保存，可直接使用'}`);
        createConversation(provider, finalModel);
        setTimeout(() => onDone(), 1500);
      }
    } catch (err) {
      setStatus('error');
      setStatusMsg(`出错: ${String(err).slice(0, 100)}`);
    }
  };

  const isBusy = status === 'saving' || status === 'testing' || status === 'probing';

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in">
      <div className="panel-shell overflow-hidden rounded-[30px] p-6 sm:p-7">
        <div className="grid gap-6 md:grid-cols-[0.88fr_1.12fr]">
          <div>
            <div className="section-kicker">Manual setup</div>
              <h3 className="font-display mt-5 text-4xl text-[var(--text-primary)]">手动配置模型接入</h3>
              <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                如果你更希望显式设置服务商、中转地址或模型名称，可以在这里完成。保存后会立即测试连接并创建会话。
              </p>

            <div className="mt-6 space-y-3">
              <div className="panel-card-muted p-4 text-sm leading-7 text-[var(--text-secondary)]">
                1. 录入 API Key 或中转密钥
                <br />
                2. 可选填写 Base URL
                <br />
                3. 自动探测模型并创建对话
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip chip-cool">保存</span>
                <span className="chip chip-muted">探测</span>
                <span className="chip">启动</span>
              </div>
            </div>
          </div>

          <div className="panel-card p-5 sm:p-6">
            <div>
              <label className="meta-label mb-2 block">服务商</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setProvider(p.value)}
                    className={`rounded-2xl border px-3 py-3 text-xs font-semibold transition ${
                      provider === p.value
                        ? p.tone === 'cool'
                          ? 'border-[rgba(10,132,255,0.24)] bg-[rgba(10,132,255,0.12)] text-[#d7efff]'
                          : 'border-white/14 bg-white/[0.08] text-[var(--text-primary)]'
                        : 'border-white/8 bg-white/[0.03] text-[var(--text-secondary)] hover:bg-white/[0.05]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="meta-label mb-2 block">API 密钥</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-xxx..."
                className="input h-12 font-mono"
                autoFocus
              />
            </div>

            <div className="mt-5">
              <label className="meta-label mb-2 block">中转地址（可选）</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl_(e.target.value)}
                placeholder="https://your-relay.com"
                className="input h-12 font-mono"
              />
            </div>

            <div className="mt-5">
              <label className="meta-label mb-2 block">模型名称（可选）</label>
              {probedModels.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input h-12 font-mono"
                >
                  {probedModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="留空自动选择，如 claude-3-5-sonnet"
                  className="input h-12 font-mono"
                />
              )}
            </div>

            {statusMsg && (
              <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                status === 'error'
                  ? 'border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] text-[#ffbeca]'
                  : status === 'done'
                    ? 'border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.08)] text-emerald-200'
                    : 'border-[rgba(10,132,255,0.2)] bg-[rgba(10,132,255,0.08)] text-[#d7efff]'
              }`}>
                {isBusy && <span className="mr-2 inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent align-[-2px] animate-spin" />}
                {statusMsg}
              </div>
            )}

            <button
              onClick={handleSaveAndTest}
              disabled={!apiKey.trim() || isBusy}
              className="btn btn-primary mt-5 h-12 w-full text-sm disabled:opacity-40"
            >
              {isBusy ? '配置中...' : '保存并开始对话'}
            </button>

            <p className="mt-4 text-center text-xs leading-6 text-[var(--text-tertiary)]">
              也可以直接在下方输入区粘贴完整配置文本，让系统自动识别。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import { probeModelsRequest } from '@/lib/llm-client';
import { pickStrongestModel, fuzzyMatchModel } from '@/lib/types';
import type { AIProvider } from '@/lib/types';

const PROVIDERS: { value: AIProvider; label: string; color: string }[] = [
  { value: 'openai', label: 'OpenAI / 中转', color: 'text-emerald-400' },
  { value: 'claude', label: 'Claude', color: 'text-orange-400' },
  { value: 'gemini', label: 'Gemini', color: 'text-blue-400' },
];

export function InlineConfigForm({ onDone }: { onDone: () => void }) {
  const saveKey = useApiKeyStore((s) => s.saveKey);
  const setBaseUrl = useApiKeyStore((s) => s.setBaseUrl);
  const testConnection = useApiKeyStore((s) => s.testConnection);
  const createConversation = useChatStore((s) => s.createConversation);

  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl_] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'testing' | 'probing' | 'done' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [probedModels, setProbedModels] = useState<string[]>([]);

  // Auto-detect provider from key pattern
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
      // Relay APIs use one key for all providers — save to all
      const allProviders: AIProvider[] = ['claude', 'openai', 'gemini'];
      if (baseUrl.trim()) {
        for (const p of allProviders) {
          await saveKey(p, apiKey.trim());
        }
      } else {
        await saveKey(provider, apiKey.trim());
      }
      if (baseUrl.trim()) {
        // Clean URL
        let cleanUrl = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
        if (cleanUrl.startsWith('https://https://')) cleanUrl = cleanUrl.replace('https://https://', 'https://');
        for (const p of allProviders) {
          await setBaseUrl(p, cleanUrl);
        }

        // Probe models
        setStatus('probing');
        setStatusMsg('正在探测可用模型...');
        try {
          const data = await probeModelsRequest(cleanUrl, apiKey.trim());
          if (data.models?.length) {
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
        } catch { /* probe failed, continue */ }
      }

      // Test connection
      setStatus('testing');
      setStatusMsg('正在测试连接...');
      const finalModel = model.trim() || (provider === 'claude' ? 'claude-3-5-sonnet' : provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o');
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
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">配置 API 密钥</h3>
              <p className="text-[10px] text-[var(--text-tertiary)]">填写后即可开始对话，支持中转/代理地址</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-5 pb-5 space-y-3">
          {/* Provider */}
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] mb-1 block">服务商</label>
            <div className="flex gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProvider(p.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition border ${
                    provider === p.value
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] mb-1 block">API 密钥</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxx..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50 font-mono"
              autoFocus
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] mb-1 block">
              中转地址 <span className="text-[var(--text-tertiary)]">(可选，留空用官方地址)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl_(e.target.value)}
              placeholder="https://your-relay.com"
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50 font-mono"
            />
          </div>

          {/* Model (optional) */}
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] mb-1 block">
              模型名称 <span className="text-[var(--text-tertiary)]">(可选，自动探测最强模型)</span>
            </label>
            {probedModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/50 font-mono"
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
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50 font-mono"
              />
            )}
          </div>

          {/* Status message */}
          {statusMsg && (
            <div className={`text-[11px] px-3 py-2 rounded-lg ${
              status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
              status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
            }`}>
              {isBusy && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />}
              {statusMsg}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSaveAndTest}
            disabled={!apiKey.trim() || isBusy}
            className="w-full btn btn-primary py-2.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? '配置中...' : '保存并开始对话'}
          </button>

          {/* Paste hint */}
          <p className="text-[10px] text-[var(--text-tertiary)] text-center leading-relaxed">
            也可以直接在下方输入框粘贴包含密钥的配置文本，自动识别
          </p>
        </div>
      </div>
    </div>
  );
}

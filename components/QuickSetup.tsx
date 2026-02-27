"use client";

// QuickSetup — paste relay URL + API Key, auto-probe models, auto-select strongest
// Replaces the painful manual configuration flow

import React, { useState, useCallback } from 'react';
import { useApiKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';
import { probeModelsRequest } from '@/lib/llm-client';
import { pickStrongestModel, detectProvider } from '@/lib/types';
import type { AIProvider } from '@/lib/types';

type SetupStage = 'input' | 'probing' | 'done' | 'error';

interface ProbeResult {
  models: string[];
  bestModel: string;
  bestProvider: AIProvider;
  score: number;
  totalFound: number;
}

export default function QuickSetup({ onComplete }: { onComplete?: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [stage, setStage] = useState<SetupStage>('input');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [allModels, setAllModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('openai');

  const saveKey = useApiKeyStore((s) => s.saveKey);
  const setStoreBaseUrl = useApiKeyStore((s) => s.setBaseUrl);
  const createConversation = useChatStore((s) => s.createConversation);

  const handleProbe = useCallback(async () => {
    const url = baseUrl.trim();
    const key = apiKey.trim();
    if (!url || !key) return;

    setStage('probing');
    setProgress('正在连接中转服务...');
    setErrorMsg('');

    try {
      setProgress('正在获取可用模型列表...');
      const data = await probeModelsRequest(url, key);

      if (data.models && data.models.length > 0) {
        setProgress(`发现 ${data.models.length} 个模型，正在分析最强模型...`);
        setAllModels(data.models);

        const best = pickStrongestModel(data.models);
        if (best) {
          setResult({
            models: data.models,
            bestModel: best.model,
            bestProvider: best.provider,
            score: best.score,
            totalFound: data.models.length,
          });
          setSelectedModel(best.model);
          setSelectedProvider(best.provider);
          setStage('done');
        } else {
          // No ranking match, let user pick
          setSelectedModel(data.models[0]);
          setSelectedProvider(detectProvider(data.models[0]));
          setResult({
            models: data.models,
            bestModel: data.models[0],
            bestProvider: detectProvider(data.models[0]),
            score: 0,
            totalFound: data.models.length,
          });
          setStage('done');
        }
      } else {
        setErrorMsg(data.error || '未能获取模型列表。该中转可能不支持模型列表接口。');
        setStage('error');
      }
    } catch (err) {
      setErrorMsg(`连接失败: ${String(err)}`);
      setStage('error');
    }
  }, [baseUrl, apiKey]);

  const handleConfirm = useCallback(async () => {
    const url = baseUrl.trim();
    const key = apiKey.trim();
    const provider = selectedProvider;

    setProgress('正在保存配置...');
    setErrorMsg('');

    try {
      // Save API key for the detected provider
      await saveKey(provider, key);
      await setStoreBaseUrl(provider, url);

      // Create a new conversation with the selected model
      createConversation(provider, selectedModel);

      onComplete?.();
    } catch (err) {
      setErrorMsg(`保存配置失败: ${String(err).slice(0, 120)}`);
      setStage('error');
    }
  }, [baseUrl, apiKey, selectedModel, selectedProvider, saveKey, setStoreBaseUrl, createConversation, onComplete]);

  const handleManualConfirm = useCallback(async () => {
    const url = baseUrl.trim();
    const key = apiKey.trim();
    if (!url || !key || !selectedModel.trim()) return;

    const provider = detectProvider(selectedModel);
    setSelectedProvider(provider);

    try {
      await saveKey(provider, key);
      await setStoreBaseUrl(provider, url);
      createConversation(provider, selectedModel.trim());

      onComplete?.();
    } catch (err) {
      setErrorMsg(`保存配置失败: ${String(err).slice(0, 120)}`);
      setStage('error');
    }
  }, [baseUrl, apiKey, selectedModel, saveKey, setStoreBaseUrl, createConversation, onComplete]);

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Input stage */}
      {stage === 'input' && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-[var(--border-primary)] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">快速配置</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">粘贴中转地址和 API Key，自动探测最强模型</p>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">中转地址</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://ai.9w7.cn"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50 transition"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              onKeyDown={(e) => { if (e.key === 'Enter' && baseUrl.trim() && apiKey.trim()) handleProbe(); }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50 transition"
            />
          </div>

          <button
            onClick={handleProbe}
            disabled={!baseUrl.trim() || !apiKey.trim()}
            className="btn btn-primary w-full py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            自动探测可用模型
          </button>
        </div>
      )}

      {/* Probing stage */}
      {stage === 'probing' && (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">{progress}</p>
        </div>
      )}

      {/* Done stage — show results */}
      {stage === 'done' && result && (
        <div className="space-y-4">
          <div className="text-center mb-2">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">探测完成</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              发现 {result.totalFound} 个可用模型
            </p>
          </div>

          {/* Best model recommendation */}
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">推荐</span>
              <span className="text-xs text-[var(--text-secondary)]">最强可用模型</span>
            </div>
            <div className="text-sm font-mono text-[var(--text-primary)] font-semibold">{result.bestModel}</div>
            <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
              Provider: {result.bestProvider} · 强度评分: {result.score > 0 ? result.score : '未知'}
            </div>
          </div>

          {/* Model selector — can override */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">选择模型（可更改）</label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setSelectedProvider(detectProvider(e.target.value));
              }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
            >
              {allModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleConfirm}
            className="btn btn-primary w-full py-2.5 text-sm"
          >
            确认并开始对话
          </button>

          <button
            onClick={() => { setStage('input'); setResult(null); }}
            className="btn btn-ghost w-full py-2 text-xs"
          >
            重新配置
          </button>
        </div>
      )}

      {/* Error stage */}
      {stage === 'error' && (
        <div className="space-y-4">
          <div className="text-center mb-2">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">配置失败</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">{errorMsg}</p>
          </div>

          {/* Fallback: manual model input */}
          <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-primary)]">
            <p className="text-xs text-[var(--text-secondary)] mb-2">手动输入模型名称：</p>
            <input
              type="text"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="例如: claude-3-5-sonnet, gpt-4o"
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualConfirm(); }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-indigo-500/50"
            />
          </div>

          <button
            onClick={handleManualConfirm}
            disabled={!selectedModel.trim()}
            className="btn btn-primary w-full py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            手动确认并开始对话
          </button>

          <div className="flex gap-2">
            <button onClick={() => setStage('input')} className="btn btn-ghost flex-1 py-2 text-xs">
              重新配置
            </button>
            <button onClick={handleProbe} className="btn btn-ghost flex-1 py-2 text-xs">
              重试探测
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

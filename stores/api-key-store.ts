// API Key store: manages encrypted API keys and base URLs per provider

import { create } from 'zustand';
import type { AIProvider, EncryptedPayload } from '@/lib/types';
import { DEFAULT_BASE_URLS, DEFAULT_PROVIDER_MODEL, groupModelsByProvider } from '@/lib/types';
import { getOllamaModelNames } from '@/lib/ollama';
import { probeModelsRequest, streamChatRequest } from '@/lib/llm-client';
import { encrypt, decrypt } from '@/lib/crypto';
import { storageGet, storageSet } from '@/lib/storage';

const STORAGE_KEY = 'api-keys-v2';
const URLS_KEY = 'api-base-urls';
const DISCOVERED_MODELS_KEY = 'api-discovered-models-v1';
const SECURE_SECRET_UNAVAILABLE_CODE = 'E_SECURE_SECRET_UNAVAILABLE';

let cachedMasterPassword: string | null = null;
let masterPasswordPromise: Promise<string> | null = null;

function createSecureSecretUnavailableError() {
  const err = new Error('Electron secure secret unavailable');
  (err as Error & { code: string }).code = SECURE_SECRET_UNAVAILABLE_CODE;
  return err;
}

function isSecureSecretUnavailableError(err: unknown): err is Error & { code: string } {
  return Boolean(
    err
    && typeof err === 'object'
    && 'code' in err
    && (err as { code?: unknown }).code === SECURE_SECRET_UNAVAILABLE_CODE
  );
}

// Browser-only fallback when Electron secure secret is unavailable.
function getBrowserFallbackPassword(): string {
  if (typeof window === 'undefined') return 'chainmind-ssr-fallback';
  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  // Simple hash to avoid storing plaintext fingerprint
  let hash = 0;
  for (let i = 0; i < fp.length; i++) {
    hash = ((hash << 5) - hash + fp.charCodeAt(i)) | 0;
  }
  return `chainmind-${Math.abs(hash).toString(36)}-local`;
}

async function getMasterPassword(): Promise<string> {
  if (cachedMasterPassword) return cachedMasterPassword;

  if (!masterPasswordPromise) {
    masterPasswordPromise = (async () => {
      if (typeof window !== 'undefined' && window.electronAPI?.getKeyEncryptionSecret) {
        try {
          const secret = await window.electronAPI.getKeyEncryptionSecret();
          if (typeof secret === 'string' && secret.length >= 32) {
            return `chainmind-electron-${secret}`;
          }
        } catch {
          // Ignore and fall back.
        }
        // H-5: In Electron mode, if secure secret is unavailable, throw instead of
        // silently degrading to the weak browser-derived password.
        console.error('[ApiKeyStore] Electron secure secret unavailable — API key operations blocked');
        throw createSecureSecretUnavailableError();
      }
      return getBrowserFallbackPassword();
    })();
  }

  const resolved = await masterPasswordPromise;
  cachedMasterPassword = resolved;
  return resolved;
}

interface ApiKeyState {
  keys: Record<AIProvider, EncryptedPayload | null>;
  baseUrls: Record<AIProvider, string>;
  discoveredModels: Record<AIProvider, string[]>;
  loaded: boolean;
  loadKeys: () => Promise<void>;
  saveKey: (provider: AIProvider, apiKey: string) => Promise<void>;
  getKey: (provider: AIProvider) => Promise<string | null>;
  removeKey: (provider: AIProvider) => Promise<void>;
  setBaseUrl: (provider: AIProvider, url: string) => Promise<void>;
  setDiscoveredModels: (provider: AIProvider, models: string[]) => Promise<void>;
  hydrateDiscoveredModels: (models: string[]) => Promise<void>;
  probeModels: (provider: AIProvider, opts?: { baseUrl?: string; apiKey?: string }) => Promise<{ ok: boolean; models: string[]; endpoint?: string; error?: string }>;
  testConnection: (provider: AIProvider, testModel?: string) => Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  keys: { claude: null, openai: null, gemini: null, deepseek: null, ollama: null, 'openai-compatible': null },
  baseUrls: {
    claude: DEFAULT_BASE_URLS.claude,
    openai: DEFAULT_BASE_URLS.openai,
    gemini: DEFAULT_BASE_URLS.gemini,
    deepseek: DEFAULT_BASE_URLS.deepseek,
    ollama: DEFAULT_BASE_URLS.ollama,
    'openai-compatible': DEFAULT_BASE_URLS['openai-compatible'],
  },
  discoveredModels: { claude: [], openai: [], gemini: [], deepseek: [], ollama: [], 'openai-compatible': [] },
  loaded: false,

  loadKeys: async () => {
    try {
      const stored = await storageGet<Record<AIProvider, EncryptedPayload | null>>(STORAGE_KEY);
      const urls = await storageGet<Record<AIProvider, string>>(URLS_KEY);
      const discovered = await storageGet<Record<AIProvider, string[]>>(DISCOVERED_MODELS_KEY);
      set({
        keys: stored || { claude: null, openai: null, gemini: null, deepseek: null, ollama: null, 'openai-compatible': null },
        baseUrls: urls || {
          claude: DEFAULT_BASE_URLS.claude,
          openai: DEFAULT_BASE_URLS.openai,
          gemini: DEFAULT_BASE_URLS.gemini,
          deepseek: DEFAULT_BASE_URLS.deepseek,
          ollama: DEFAULT_BASE_URLS.ollama,
          'openai-compatible': DEFAULT_BASE_URLS['openai-compatible'],
        },
        discoveredModels: discovered || { claude: [], openai: [], gemini: [], deepseek: [], ollama: [], 'openai-compatible': [] },
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  saveKey: async (provider, apiKey) => {
    let masterPassword = '';
    try {
      masterPassword = await getMasterPassword();
    } catch (err) {
      if (isSecureSecretUnavailableError(err)) {
        throw new Error('无法获取 Electron 安全密钥，请重启应用后重试');
      }
      throw err;
    }
    const encrypted = await encrypt(apiKey, masterPassword);
    const keys = { ...get().keys, [provider]: encrypted };
    set({ keys });
    await storageSet(STORAGE_KEY, keys);
  },

  getKey: async (provider) => {
    const payload = get().keys[provider];
    if (!payload) return null;
    try {
      const masterPassword = await getMasterPassword();
      return await decrypt(payload, masterPassword);
    } catch (err) {
      if (isSecureSecretUnavailableError(err)) {
        return null;
      }
      // Backward compatibility: try legacy browser-derived password,
      // then transparently migrate to the stronger Electron-backed secret.
      try {
        const legacyPassword = getBrowserFallbackPassword();
        const plain = await decrypt(payload, legacyPassword);
        get().saveKey(provider, plain).catch(() => {});
        return plain;
      } catch {
        return null;
      }
    }
  },

  removeKey: async (provider) => {
    const keys = { ...get().keys, [provider]: null };
    set({ keys });
    await storageSet(STORAGE_KEY, keys);
  },

  setBaseUrl: async (provider, url) => {
    const baseUrls = { ...get().baseUrls, [provider]: url };
    set({ baseUrls });
    await storageSet(URLS_KEY, baseUrls);
  },

  setDiscoveredModels: async (provider, models) => {
    const next = {
      ...get().discoveredModels,
      [provider]: Array.from(new Set(models.filter(Boolean))),
    };
    set({ discoveredModels: next });
    await storageSet(DISCOVERED_MODELS_KEY, next);
  },

  hydrateDiscoveredModels: async (models) => {
    const grouped = groupModelsByProvider(models);
    const next: Record<AIProvider, string[]> = {
      claude: Array.from(new Set([...(get().discoveredModels.claude || []), ...grouped.claude])),
      openai: Array.from(new Set([...(get().discoveredModels.openai || []), ...grouped.openai])),
      gemini: Array.from(new Set([...(get().discoveredModels.gemini || []), ...grouped.gemini])),
      deepseek: Array.from(new Set([...(get().discoveredModels.deepseek || []), ...grouped.deepseek])),
      ollama: Array.from(new Set([...(get().discoveredModels.ollama || []), ...grouped.ollama])),
      'openai-compatible': Array.from(new Set([...(get().discoveredModels['openai-compatible'] || []), ...grouped['openai-compatible']])),
    };
    set({ discoveredModels: next });
    await storageSet(DISCOVERED_MODELS_KEY, next);
  },

  probeModels: async (provider, opts) => {
    // Ollama doesn't need an API key — probe directly
    if (provider === 'ollama') {
      const baseUrl = opts?.baseUrl || get().baseUrls.ollama;
      try {
        const models = await getOllamaModelNames(baseUrl);
        if (models.length > 0) {
          await get().setDiscoveredModels('ollama', models);
          return { ok: true, models, endpoint: baseUrl };
        }
        return { ok: false, models: [], error: 'Ollama 未运行或无已安装模型。运行: ollama serve' };
      } catch (e: any) {
        return { ok: false, models: [], error: e?.message || 'Ollama probe failed' };
      }
    }

    const apiKey = opts?.apiKey || await get().getKey(provider);
    const baseUrl = opts?.baseUrl || get().baseUrls[provider];
    if (!apiKey) {
      return { ok: false, models: [], error: '未配置API密钥' };
    }

    const result = await probeModelsRequest(baseUrl, apiKey);
    if (result.models?.length) {
      const providerModels = result.models.filter((model) => groupModelsByProvider([model])[provider].length > 0);
      await get().setDiscoveredModels(provider, providerModels.length > 0 ? providerModels : result.models);
      await get().hydrateDiscoveredModels(result.models);
      return { ok: true, models: result.models, endpoint: result.endpoint, error: result.error };
    }

    return { ok: false, models: [], endpoint: result.endpoint, error: result.error || '未发现可用模型' };
  },

  testConnection: async (provider, testModel?: string) => {
    let apiKey: string | null = null;
    try {
      apiKey = await get().getKey(provider);
    } catch (err) {
      return { ok: false, latencyMs: 0, error: String(err) };
    }
    if (!apiKey) return { ok: false, latencyMs: 0, error: '未配置API密钥' };

    const baseUrl = get().baseUrls[provider];
    // Use provided model or sensible defaults
    const model = testModel
      || (provider === 'claude' ? 'claude-haiku-4-5' : DEFAULT_PROVIDER_MODEL[provider]);
    const start = performance.now();
    try {
      let streamError = '';
      await streamChatRequest(
        {
          provider,
          model,
          apiKey,
          baseUrl,
          systemPrompt: 'Reply OK',
          userPrompt: 'ping',
          temperature: 0,
          maxTokens: 5,
          effort: 'low',
          enableMetaPrompt: false,
        },
        {
          onChunk: (chunk) => {
            if (chunk.type === 'error') {
              streamError = chunk.content;
            }
          },
        }
      );

      const latencyMs = Math.round(performance.now() - start);
      if (streamError) {
        return { ok: false, latencyMs, error: streamError.slice(0, 200) };
      }
      return { ok: true, latencyMs };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      return { ok: false, latencyMs, error: String(err) };
    }
  },
}));

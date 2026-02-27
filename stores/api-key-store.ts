// API Key store: manages encrypted API keys and base URLs per provider

import { create } from 'zustand';
import type { AIProvider, EncryptedPayload } from '@/lib/types';
import { streamChatRequest } from '@/lib/llm-client';
import { encrypt, decrypt } from '@/lib/crypto';
import { storageGet, storageSet } from '@/lib/storage';

const STORAGE_KEY = 'api-keys-v2';
const URLS_KEY = 'api-base-urls';
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
  loaded: boolean;
  loadKeys: () => Promise<void>;
  saveKey: (provider: AIProvider, apiKey: string) => Promise<void>;
  getKey: (provider: AIProvider) => Promise<string | null>;
  removeKey: (provider: AIProvider) => Promise<void>;
  setBaseUrl: (provider: AIProvider, url: string) => Promise<void>;
  testConnection: (provider: AIProvider, testModel?: string) => Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  keys: { claude: null, openai: null, gemini: null },
  baseUrls: {
    claude: 'https://api.anthropic.com',
    openai: 'https://api.openai.com',
    gemini: 'https://generativelanguage.googleapis.com',
  },
  loaded: false,

  loadKeys: async () => {
    try {
      const stored = await storageGet<Record<AIProvider, EncryptedPayload | null>>(STORAGE_KEY);
      const urls = await storageGet<Record<AIProvider, string>>(URLS_KEY);
      set({
        keys: stored || { claude: null, openai: null, gemini: null },
        baseUrls: urls || {
          claude: 'https://api.anthropic.com',
          openai: 'https://api.openai.com',
          gemini: 'https://generativelanguage.googleapis.com',
        },
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
      || (provider === 'claude' ? 'claude-3-haiku' : provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash');
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

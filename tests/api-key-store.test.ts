import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedPayload } from '../lib/types';

const storageGetMock = vi.fn();
const storageSetMock = vi.fn();
const encryptMock = vi.fn();
const decryptMock = vi.fn();

vi.mock('../lib/storage', () => ({
  storageGet: storageGetMock,
  storageSet: storageSetMock,
}));

vi.mock('../lib/crypto', () => ({
  encrypt: encryptMock,
  decrypt: decryptMock,
}));

vi.mock('../lib/llm-client', () => ({
  streamChatRequest: vi.fn(),
}));

const sampleEncrypted: EncryptedPayload = {
  ciphertext: 'cipher',
  iv: 'iv',
  salt: 'salt',
};

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    value,
    configurable: true,
    writable: true,
  });
}

function setElectronSecretProvider(fn: () => Promise<string>) {
  setWindow({
    electronAPI: {
      getKeyEncryptionSecret: fn,
    },
  });
}

describe('api-key-store secure secret behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    storageGetMock.mockResolvedValue(undefined);
    storageSetMock.mockResolvedValue(undefined);
    encryptMock.mockResolvedValue(sampleEncrypted);
    decryptMock.mockResolvedValue('plain-key');
  });

  afterEach(() => {
    setWindow(undefined);
  });

  it('uses non-Electron fallback password outside browser/electron', async () => {
    setWindow(undefined);

    const { useApiKeyStore } = await import('../stores/api-key-store');
    await useApiKeyStore.getState().saveKey('openai', 'sk-test');

    expect(encryptMock).toHaveBeenCalledWith('sk-test', 'chainmind-ssr-fallback');
    expect(storageSetMock).toHaveBeenCalledWith(
      'api-keys-v2',
      expect.objectContaining({ openai: sampleEncrypted })
    );
  });

  it('rejects saveKey when Electron secure secret is unavailable', async () => {
    setElectronSecretProvider(async () => '');

    const { useApiKeyStore } = await import('../stores/api-key-store');

    await expect(useApiKeyStore.getState().saveKey('openai', 'sk-test'))
      .rejects
      .toThrow('无法获取 Electron 安全密钥');

    expect(encryptMock).not.toHaveBeenCalled();
    expect(storageSetMock).not.toHaveBeenCalled();
  });

  it('returns null from getKey when Electron secure secret is unavailable', async () => {
    setElectronSecretProvider(async () => '');

    const { useApiKeyStore } = await import('../stores/api-key-store');
    useApiKeyStore.setState({
      keys: { claude: null, openai: sampleEncrypted, gemini: null },
      baseUrls: {
        claude: 'https://api.anthropic.com',
        openai: 'https://api.openai.com',
        gemini: 'https://generativelanguage.googleapis.com',
      },
      loaded: true,
    });

    const key = await useApiKeyStore.getState().getKey('openai');

    expect(key).toBeNull();
    expect(decryptMock).not.toHaveBeenCalled();
  });
});

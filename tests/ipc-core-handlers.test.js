import { describe, expect, it, vi } from 'vitest';
import { registerCoreIpcHandlers } from '../electron/ipc-core-handlers';

function createHarness(overrides = {}) {
  const handlers = {};
  const ipcMain = {
    handle: vi.fn((channel, fn) => {
      handlers[channel] = fn;
    }),
  };

  const app = {
    getVersion: vi.fn(() => '1.2.3'),
    getPath: vi.fn((name) => (name === 'userData' ? '/tmp/chainmind-data' : '/tmp/unknown')),
  };

  const secureSecret = {
    getSecret: vi.fn(() => 'test-secret'),
  };

  const windowManager = {
    minimizeWindow: vi.fn(),
    toggleMaximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    openFile: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    openDirectory: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    saveFile: vi.fn(async () => ({ canceled: true })),
  };

  registerCoreIpcHandlers({
    app,
    ipcMain,
    secureSecret,
    windowManager,
    getExecToken: () => 'exec-token',
    ...overrides,
  });

  return {
    handlers,
    ipcMain,
    app,
    secureSecret,
    windowManager,
  };
}

describe('ipc-core-handlers', () => {
  it('registers system info handler with wrapped response payload', () => {
    const { handlers } = createHarness();

    const result = handlers['system:info']();

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          appVersion: '1.2.3',
          dataPath: '/tmp/chainmind-data',
          platform: expect.any(String),
          arch: expect.any(String),
        }),
      })
    );
  });

  it('returns secure secret and falls back to empty string on error', () => {
    const { handlers } = createHarness();
    expect(handlers['security:getKeyEncryptionSecret']()).toBe('test-secret');

    const throwingSecret = { getSecret: vi.fn(() => { throw new Error('boom'); }) };
    const { handlers: errorHandlers } = createHarness({ secureSecret: throwingSecret });
    expect(errorHandlers['security:getKeyEncryptionSecret']()).toBe('');
  });

  it('proxies window actions to window manager', async () => {
    const { handlers, windowManager } = createHarness();

    handlers['window:minimize']();
    handlers['window:maximize']();
    handlers['window:close']();

    await handlers['dialog:openFile']({}, { properties: ['openFile'] });
    await handlers['dialog:openDirectory']({}, { properties: ['openDirectory'] });
    await handlers['dialog:saveFile']({}, { title: 'Save' });

    expect(windowManager.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(windowManager.toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(windowManager.closeWindow).toHaveBeenCalledTimes(1);
    expect(windowManager.openFile).toHaveBeenCalledWith({ properties: ['openFile'] });
    expect(windowManager.openDirectory).toHaveBeenCalledWith({ properties: ['openDirectory'] });
    expect(windowManager.saveFile).toHaveBeenCalledWith({ title: 'Save' });
  });
});

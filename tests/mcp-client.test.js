import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';

let mcpClient;
let origResolve;

beforeAll(() => {
  const Module = require('module');
  origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'electron') {
      return require.resolve('./mocks/electron.cjs');
    }
    return origResolve.call(this, request, parent, isMain, options);
  };

  mcpClient = require('../electron/mcp-client');
});

afterAll(() => {
  const Module = require('module');
  Module._resolveFilename = origResolve;
});

beforeEach(async () => {
  if (mcpClient._reconnectTimer) {
    clearTimeout(mcpClient._reconnectTimer);
    mcpClient._reconnectTimer = null;
  }

  await mcpClient.disconnect().catch(() => {});
  mcpClient.pending.clear();
  mcpClient.tools = [];
  mcpClient.connected = false;
  mcpClient.process = null;
  mcpClient.requestId = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mcp-client robustness', () => {
  it('rejects all pending requests on disconnect', async () => {
    const reject = vi.fn();
    const timeoutId = setTimeout(() => {}, 60000);

    mcpClient.pending.set(1, {
      resolve: vi.fn(),
      reject,
      timeoutId,
    });

    await mcpClient.disconnect();

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject.mock.calls[0][0].message).toContain('MCP disconnected');
    expect(mcpClient.pending.size).toBe(0);
  });

  it('resolves pending request and clears timeout on valid JSON-RPC response', () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const timeoutId = setTimeout(() => {}, 60000);

    mcpClient.pending.set(7, {
      resolve,
      reject,
      timeoutId,
    });

    mcpClient._handleMessage(JSON.stringify({ id: 7, result: { ok: true } }));

    expect(resolve).toHaveBeenCalledWith({ ok: true });
    expect(reject).not.toHaveBeenCalled();
    expect(mcpClient.pending.size).toBe(0);
  });

  it('skips oversized MCP messages without mutating pending requests', () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const timeoutId = setTimeout(() => {}, 60000);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mcpClient.pending.set(9, {
      resolve,
      reject,
      timeoutId,
    });

    mcpClient._handleMessage('x'.repeat(1024 * 1024 + 1));

    expect(mcpClient.pending.has(9)).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[MCP] message too large, skipped');

    clearTimeout(timeoutId);
    mcpClient.pending.delete(9);
  });
});

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

let pluginManager;
let origResolve;

function createMockWorker() {
  const worker = new EventEmitter();
  worker.postMessage = vi.fn((msg) => {
    worker._lastMessage = msg;
  });
  worker.terminate = vi.fn(async () => 0);
  return worker;
}

beforeAll(() => {
  const Module = require('module');
  origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'electron') {
      return require.resolve('./mocks/electron.cjs');
    }
    return origResolve.call(this, request, parent, isMain, options);
  };

  pluginManager = require('../electron/plugin-manager');
});

afterAll(() => {
  const Module = require('module');
  Module._resolveFilename = origResolve;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('plugin-manager worker safety', () => {
  it('terminates worker when plugin call times out', async () => {
    vi.useFakeTimers();

    const worker = createMockWorker();
    const promise = pluginManager._sendToWorker(worker, { type: 'call' }, { terminateOnTimeout: true });
    const rejected = expect(promise).rejects.toThrow('Plugin operation timed out');

    await vi.advanceTimersByTimeAsync(10001);
    await rejected;

    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('does not terminate worker on timeout when terminateOnTimeout is disabled', async () => {
    vi.useFakeTimers();

    const worker = createMockWorker();
    const promise = pluginManager._sendToWorker(worker, { type: 'call' }, { terminateOnTimeout: false });
    const rejected = expect(promise).rejects.toThrow('Plugin operation timed out');

    await vi.advanceTimersByTimeAsync(10001);
    await rejected;

    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('resolves worker response by correlation id', async () => {
    const worker = createMockWorker();

    const promise = pluginManager._sendToWorker(worker, { type: 'register' });
    const sent = worker._lastMessage;
    worker.emit('message', { id: sent.id, ok: true, result: { ready: true } });

    await expect(promise).resolves.toEqual({ ready: true });
  });
});

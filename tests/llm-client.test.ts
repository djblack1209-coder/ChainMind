import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeModelsRequest, streamChatRequest } from '../lib/llm-client';
import type { ChatRequestBody, StreamChunk } from '../lib/types';

const ORIGINAL_FETCH = global.fetch;
const globalWithWindow = globalThis as typeof globalThis & { window?: any };

const BASE_PAYLOAD: ChatRequestBody = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com',
  systemPrompt: 'You are a test assistant.',
  userPrompt: 'ping',
  temperature: 0.2,
  maxTokens: 64,
  effort: 'low',
  enableMetaPrompt: false,
};

function buildSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe('llm-client', () => {
  beforeEach(() => {
    delete globalWithWindow.window;
    global.fetch = vi.fn();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    delete globalWithWindow.window;
    global.fetch = ORIGINAL_FETCH;
  });

  it('streams via HTTP fallback', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue(
      buildSseResponse([
        'data: {"type":"text","content":"hello"}\n\n',
        'data: {"type":"text","content":" world"}\n\n',
        'data: {"type":"done","content":""}\n\n',
      ])
    );

    const received: StreamChunk[] = [];
    await streamChatRequest(BASE_PAYLOAD, {
      onChunk: (chunk) => {
        received.push(chunk);
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(received).toEqual([
      { type: 'text', content: 'hello' },
      { type: 'text', content: ' world' },
      { type: 'done', content: '' },
    ]);
  });

  it('uses Electron IPC chat stream when available', async () => {
    const fetchMock = vi.mocked(global.fetch);
    let listener: (payload: unknown) => void = () => {};
    const unsubscribe = vi.fn();

    const llmChatStart = vi.fn().mockResolvedValue({ ok: true, requestId: 'req-1' });
    const llmChatAbort = vi.fn().mockResolvedValue({ ok: true });
    const onLLMChatChunk = vi.fn((cb: (payload: unknown) => void) => {
      listener = cb;
      return unsubscribe;
    });

    globalWithWindow.window = {
      electronAPI: {
        llmChatStart,
        llmChatAbort,
        onLLMChatChunk,
        llmProbeModels: vi.fn(),
      },
    };

    const received: StreamChunk[] = [];
    const pending = streamChatRequest(BASE_PAYLOAD, {
      onChunk: (chunk) => {
        received.push(chunk);
      },
    });

    await Promise.resolve();
    listener({ requestId: 'req-1', chunk: { type: 'text', content: 'hi' } });
    listener({ requestId: 'req-1', chunk: { type: 'done', content: '' } });
    await pending;

    expect(llmChatStart).toHaveBeenCalledTimes(1);
    expect(llmChatAbort).not.toHaveBeenCalled();
    expect(onLLMChatChunk).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(received).toEqual([
      { type: 'text', content: 'hi' },
      { type: 'done', content: '' },
    ]);
  });

  it('aborts Electron IPC stream with AbortSignal', async () => {
    let listener: ((payload: unknown) => void) | null = null;

    const llmChatStart = vi.fn().mockResolvedValue({ ok: true, requestId: 'req-abort' });
    const llmChatAbort = vi.fn().mockResolvedValue({ ok: true });
    const onLLMChatChunk = vi.fn((cb: (payload: unknown) => void) => {
      listener = cb;
      return vi.fn();
    });

    globalWithWindow.window = {
      electronAPI: {
        llmChatStart,
        llmChatAbort,
        onLLMChatChunk,
        llmProbeModels: vi.fn(),
      },
    };

    const controller = new AbortController();
    const pending = streamChatRequest(BASE_PAYLOAD, {
      signal: controller.signal,
      onChunk: () => {
        // No-op for this test.
      },
    });

    await Promise.resolve();
    expect(listener).not.toBeNull();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(llmChatAbort).toHaveBeenCalledWith('req-abort');
  });

  it('probes models via Electron IPC when available', async () => {
    const fetchMock = vi.mocked(global.fetch);
    const llmProbeModels = vi.fn().mockResolvedValue({
      ok: true,
      models: ['claude-sonnet-4-5', 'gpt-4o'],
      endpoint: 'https://relay.example/v1/models',
    });

    globalWithWindow.window = {
      electronAPI: {
        llmChatStart: vi.fn(),
        llmChatAbort: vi.fn(),
        onLLMChatChunk: vi.fn(),
        llmProbeModels,
      },
    };

    const result = await probeModelsRequest('https://relay.example', 'sk-test');

    expect(llmProbeModels).toHaveBeenCalledWith({ baseUrl: 'https://relay.example', apiKey: 'sk-test' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.models).toEqual(['claude-sonnet-4-5', 'gpt-4o']);
    expect(result.endpoint).toBe('https://relay.example/v1/models');
  });

  it('probes models via HTTP fallback', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: ['gpt-4o', 'gpt-4o-mini'],
          endpoint: 'https://relay.example/v1/models',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const result = await probeModelsRequest('https://relay.example', 'sk-test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(result.endpoint).toBe('https://relay.example/v1/models');
    expect(result.error).toBeUndefined();
  });
});

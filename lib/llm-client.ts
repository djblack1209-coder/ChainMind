import type { ChatRequestBody, StreamChunk } from '@/lib/types';

interface StreamChatOptions {
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}

interface ElectronChatStartResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

interface ElectronProbeResult {
  ok: boolean;
  models?: string[];
  endpoint?: string;
  error?: string;
}

interface ElectronChunkPayload {
  requestId: string;
  chunk: StreamChunk;
}

export interface ProbeModelsResult {
  models: string[];
  endpoint?: string;
  error?: string;
}

function makeAbortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getElectronAPI() {
  if (typeof window === 'undefined') return undefined;
  return window.electronAPI;
}

function canUseElectronChat(): boolean {
  const api = getElectronAPI();
  return !!(
    api
    && typeof api.llmChatStart === 'function'
    && typeof api.llmChatAbort === 'function'
    && typeof api.onLLMChatChunk === 'function'
  );
}

function canUseElectronProbe(): boolean {
  const api = getElectronAPI();
  return !!(api && typeof api.llmProbeModels === 'function');
}

async function streamViaHttp(payload: ChatRequestBody, options: StreamChatOptions): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 错误 (${res.status}): ${text.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('无响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const raw = trimmed.slice(6);
        if (!raw || raw === '[DONE]') continue;

        try {
          const parsed = JSON.parse(raw) as StreamChunk;
          if (parsed && typeof parsed.type === 'string' && typeof parsed.content === 'string') {
            options.onChunk(parsed);
            if (parsed.type === 'done') return;
          }
        } catch {
          // Skip malformed SSE lines.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamViaElectron(payload: ChatRequestBody, options: StreamChatOptions): Promise<void> {
  const api = getElectronAPI();
  if (!api) {
    throw new Error('Electron API unavailable');
  }

  if (options.signal?.aborted) {
    throw makeAbortError();
  }

  const startResult = await api.llmChatStart(payload) as ElectronChatStartResult;
  if (!startResult?.ok || !startResult.requestId) {
    throw new Error(startResult?.error || 'LLM stream start failed');
  }

  const requestId = startResult.requestId;
  if (options.signal?.aborted) {
    api.llmChatAbort(requestId).catch(() => {});
    throw makeAbortError();
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      try {
        unsubscribe?.();
      } catch {
        // Ignore cleanup errors.
      }
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };

    const onAbort = () => {
      api.llmChatAbort(requestId).catch(() => {});
      finish(makeAbortError());
    };

    const unsubscribe = api.onLLMChatChunk((payloadFromMain: ElectronChunkPayload) => {
      if (!payloadFromMain || payloadFromMain.requestId !== requestId) return;
      const chunk = payloadFromMain.chunk;
      if (!chunk || typeof chunk.type !== 'string' || typeof chunk.content !== 'string') return;

      try {
        options.onChunk(chunk);
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      if (chunk.type === 'done') {
        finish();
      }
    });

    if (options.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export async function streamChatRequest(payload: ChatRequestBody, options: StreamChatOptions): Promise<void> {
  if (canUseElectronChat()) {
    return streamViaElectron(payload, options);
  }
  return streamViaHttp(payload, options);
}

export async function probeModelsRequest(baseUrl: string, apiKey: string): Promise<ProbeModelsResult> {
  if (canUseElectronProbe()) {
    const result = await getElectronAPI()!.llmProbeModels({ baseUrl, apiKey }) as ElectronProbeResult;
    if (!result?.ok) {
      return {
        models: [],
        error: result?.error || '模型探测失败',
      };
    }
    return {
      models: Array.isArray(result.models) ? result.models : [],
      endpoint: result.endpoint,
      error: typeof result.error === 'string' ? result.error : undefined,
    };
  }

  try {
    const res = await fetch('/api/probe-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey }),
    });

    const data = await res.json().catch(() => ({}));
    const models = isObject(data) && Array.isArray(data.models) ? data.models.filter((m) => typeof m === 'string') : [];
    const endpoint = isObject(data) && typeof data.endpoint === 'string' ? data.endpoint : undefined;
    const error = isObject(data) && typeof data.error === 'string' ? data.error : undefined;

    if (!res.ok) {
      return { models, endpoint, error: error || `请求失败 (${res.status})` };
    }

    return { models, endpoint, error };
  } catch (err) {
    return {
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// LLM proxy in Electron main process.
// Keeps provider calls off the internal HTTP routes when running desktop mode.

const { ipcMain } = require('electron');
const crypto = require('crypto');
const {
  MAX_API_KEY_LEN,
  buildRequest,
  fetchWithTimeout,
  forwardStreamChunks,
  maybeOptimizePrompt,
  normalizeBaseUrl,
  resolveStreamFormat,
  sanitizeModels,
  validateChatPayload,
} = require('../lib/llm-core');

const ACTIVE_CHAT_REQUESTS = new Map();
let registered = false;

const PROBE_TIMEOUT_MS = 10000;

function safeSend(webContents, payload) {
  try {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send('llm:chat:chunk', payload);
  } catch {
    // Ignore if renderer is gone.
  }
}

async function streamChat(webContents, requestId, payload, abortSignal) {
  const sendChunk = (type, content) => {
    safeSend(webContents, {
      requestId,
      chunk: { type, content },
    });
  };

  try {
    const finalUserPrompt = await maybeOptimizePrompt(payload, { timeoutMs: PROBE_TIMEOUT_MS });
    const adapterReq = buildRequest(payload.provider, {
      ...payload,
      userPrompt: finalUserPrompt,
    });

    const streamFormat = resolveStreamFormat(payload.provider, payload.baseUrl);

    const upstream = await fetch(adapterReq.url, {
      method: 'POST',
      headers: adapterReq.headers,
      body: adapterReq.body,
      signal: abortSignal,
    });

    if (!upstream.ok) {
      const errText = (await upstream.text()).slice(0, 4000);
      sendChunk('error', errText || `Upstream error: ${upstream.status}`);
      sendChunk('done', '');
      return;
    }

    if (!upstream.body) {
      sendChunk('error', 'No response body');
      sendChunk('done', '');
      return;
    }
    const upstreamBody = upstream.body;

    await forwardStreamChunks(upstreamBody, streamFormat, (chunk) => {
      sendChunk(chunk.type, chunk.content);
    });

    sendChunk('done', '');
  } catch (err) {
    if (!abortSignal.aborted) {
      sendChunk('error', String(err));
      sendChunk('done', '');
    } else {
      sendChunk('done', '');
    }
  } finally {
    ACTIVE_CHAT_REQUESTS.delete(requestId);
  }
}

async function probeModels(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { ok: false, error: 'Invalid request body' };
  }

  const baseUrl = normalizeBaseUrl(rawPayload.baseUrl, '');
  const apiKey = typeof rawPayload.apiKey === 'string' ? rawPayload.apiKey.trim() : '';
  if (!baseUrl || !apiKey || apiKey.length > MAX_API_KEY_LEN) {
    return { ok: false, error: 'Missing baseUrl or apiKey' };
  }

  const base = baseUrl.replace(/\/+$/, '');
  const endpoints = [`${base}/v1/models`, `${base}/models`];

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }, PROBE_TIMEOUT_MS);

      if (!res.ok) continue;
      const data = await res.json();

      if (data?.data && Array.isArray(data.data)) {
        return { ok: true, models: sanitizeModels(data.data), endpoint: url };
      }
      if (data?.models && Array.isArray(data.models)) {
        return { ok: true, models: sanitizeModels(data.models), endpoint: url };
      }
      if (Array.isArray(data)) {
        return { ok: true, models: sanitizeModels(data), endpoint: url };
      }
    } catch {
      continue;
    }
  }

  return {
    ok: true,
    models: [],
    error: '无法获取模型列表，该中转可能不支持 /v1/models 接口。请手动输入模型名称。',
  };
}

function init() {
  if (registered) return;
  registered = true;

  ipcMain.handle('llm:chatStart', (event, rawPayload) => {
    try {
      const validated = validateChatPayload(rawPayload);
      if (!validated.ok) {
        return { ok: false, error: validated.message };
      }
      const payload = validated.payload;
      const requestId = crypto.randomUUID();
      const controller = new AbortController();
      ACTIVE_CHAT_REQUESTS.set(requestId, controller);

      streamChat(event.sender, requestId, payload, controller.signal)
        .catch((err) => {
          safeSend(event.sender, {
            requestId,
            chunk: { type: 'error', content: String(err) },
          });
          safeSend(event.sender, {
            requestId,
            chunk: { type: 'done', content: '' },
          });
          ACTIVE_CHAT_REQUESTS.delete(requestId);
        });

      return { ok: true, requestId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('llm:chatAbort', (_, requestId) => {
    const id = typeof requestId === 'string' ? requestId : '';
    const controller = ACTIVE_CHAT_REQUESTS.get(id);
    if (!controller) return { ok: false };
    controller.abort();
    ACTIVE_CHAT_REQUESTS.delete(id);
    return { ok: true };
  });

  ipcMain.handle('llm:probeModels', (_, payload) => probeModels(payload));
}

function shutdown() {
  for (const controller of ACTIVE_CHAT_REQUESTS.values()) {
    controller.abort();
  }
  ACTIVE_CHAT_REQUESTS.clear();
}

module.exports = {
  init,
  shutdown,
};

// Shared LLM gateway utilities used by Next API routes and Electron main process.

const MAX_MODEL_LEN = 200;
const MAX_API_KEY_LEN = 1024;
const MAX_BASE_URL_LEN = 2048;
const MAX_SYSTEM_PROMPT_LEN = 32 * 1024;
const MAX_USER_PROMPT_LEN = 128 * 1024;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;
const MIN_MAX_TOKENS = 1;
const MAX_MAX_TOKENS = 131072;
const MAX_MODELS = 500;
const MAX_MODEL_NAME_LEN = 200;

const DEFAULT_TIMEOUT_MS = 10000;
const META_PROMPT_SYSTEM = '你是一个提示词优化专家。请优化以下用户提示词，使其更清晰、更具体、更容易让AI理解。只输出优化后的提示词，不要解释。';
const DEFAULT_META_MODEL = 'claude-haiku-20241022';

const OFFICIAL_HOSTS = {
  claude: ['api.anthropic.com'],
  openai: ['api.openai.com'],
  gemini: ['generativelanguage.googleapis.com'],
};

const DEFAULT_BASE_URLS = {
  claude: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
};

function normalizeBaseUrl(baseUrl, fallback) {
  const raw = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : fallback;
  if (!raw || raw.length > MAX_BASE_URL_LEN) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isRelay(provider, baseUrl) {
  if (!baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname;
    return !OFFICIAL_HOSTS[provider]?.includes(host);
  } catch {
    return true;
  }
}

function buildOpenAIRequest(config) {
  const base = normalizeBaseUrl(config.baseUrl, DEFAULT_BASE_URLS.openai);
  if (!base) throw new Error('Invalid baseUrl');

  return {
    url: `${base}/v1/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: config.userPrompt },
      ],
    }),
  };
}

function buildClaudeRequest(config) {
  const base = normalizeBaseUrl(config.baseUrl, DEFAULT_BASE_URLS.claude);
  if (!base) throw new Error('Invalid baseUrl');

  const body = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: config.systemPrompt,
    messages: [{ role: 'user', content: config.userPrompt }],
    stream: true,
  };

  if (config.effort === 'high' || config.effort === 'max') {
    body.thinking = {
      type: 'enabled',
      budget_tokens: config.effort === 'max' ? 10000 : 5000,
    };
    body.temperature = 1;
  }

  return {
    url: `${base}/v1/messages`,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  };
}

function buildGeminiRequest(config) {
  const base = normalizeBaseUrl(config.baseUrl, DEFAULT_BASE_URLS.gemini);
  if (!base) throw new Error('Invalid baseUrl');

  return {
    url: `${base}/v1beta/models/${config.model}:streamGenerateContent?alt=sse`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: config.userPrompt }] }],
      systemInstruction: { parts: [{ text: config.systemPrompt }] },
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    }),
  };
}

function buildRequest(provider, config) {
  if (isRelay(provider, config.baseUrl)) {
    return buildOpenAIRequest(config);
  }
  if (provider === 'claude') return buildClaudeRequest(config);
  if (provider === 'gemini') return buildGeminiRequest(config);
  return buildOpenAIRequest(config);
}

function validateChatPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, status: 400, message: 'Invalid request body' };
  }

  const provider = payload.provider;
  if (provider !== 'claude' && provider !== 'openai' && provider !== 'gemini') {
    return { ok: false, status: 400, message: 'Invalid provider' };
  }

  const model = typeof payload.model === 'string' ? payload.model.trim() : '';
  if (!model || model.length > MAX_MODEL_LEN) {
    return { ok: false, status: 400, message: 'Invalid model' };
  }

  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  if (!apiKey || apiKey.length > MAX_API_KEY_LEN) {
    return { ok: false, status: 401, message: 'Missing API key' };
  }

  let baseUrl;
  if (typeof payload.baseUrl === 'string') {
    const checked = normalizeBaseUrl(payload.baseUrl, '');
    if (checked === null) {
      return { ok: false, status: 400, message: 'Invalid baseUrl' };
    }
    baseUrl = checked || undefined;
  }

  const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt : '';
  if (!systemPrompt || systemPrompt.length > MAX_SYSTEM_PROMPT_LEN) {
    return { ok: false, status: 400, message: 'Invalid systemPrompt' };
  }

  const userPrompt = typeof payload.userPrompt === 'string' ? payload.userPrompt : '';
  if (!userPrompt || userPrompt.length > MAX_USER_PROMPT_LEN) {
    return { ok: false, status: 400, message: 'Invalid userPrompt' };
  }

  const temperature = typeof payload.temperature === 'number' ? payload.temperature : NaN;
  if (!Number.isFinite(temperature) || temperature < MIN_TEMPERATURE || temperature > MAX_TEMPERATURE) {
    return { ok: false, status: 400, message: 'Invalid temperature' };
  }

  const maxTokens = typeof payload.maxTokens === 'number' ? Math.trunc(payload.maxTokens) : NaN;
  if (!Number.isFinite(maxTokens) || maxTokens < MIN_MAX_TOKENS || maxTokens > MAX_MAX_TOKENS) {
    return { ok: false, status: 400, message: 'Invalid maxTokens' };
  }

  const effort = payload.effort;
  if (effort !== 'low' && effort !== 'medium' && effort !== 'high' && effort !== 'max') {
    return { ok: false, status: 400, message: 'Invalid effort' };
  }

  const enableMetaPrompt = payload.enableMetaPrompt;
  if (typeof enableMetaPrompt !== 'boolean') {
    return { ok: false, status: 400, message: 'Invalid enableMetaPrompt' };
  }

  return {
    ok: true,
    payload: {
      provider,
      model,
      apiKey,
      baseUrl,
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
      effort,
      enableMetaPrompt,
    },
  };
}

async function fetchWithTimeout(url, options, timeoutMs = 0) {
  if (!timeoutMs) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options?.signal || controller.signal;

  try {
    return await fetch(url, {
      ...options,
      signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function maybeOptimizePrompt(payload, options = {}) {
  if (!payload.enableMetaPrompt) return payload.userPrompt;

  try {
    const metaModel = isRelay(payload.provider, payload.baseUrl)
      ? payload.model
      : DEFAULT_META_MODEL;

    const metaReq = buildRequest(payload.provider, {
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      model: metaModel,
      systemPrompt: META_PROMPT_SYSTEM,
      userPrompt: `请优化这个提示词:\n${payload.userPrompt}`,
      temperature: 0.3,
      maxTokens: 1024,
      effort: 'low',
    });

    const metaBody = JSON.parse(metaReq.body);
    metaBody.stream = false;
    const metaRes = await fetchWithTimeout(
      metaReq.url,
      {
        method: 'POST',
        headers: metaReq.headers,
        body: JSON.stringify(metaBody),
      },
      options.timeoutMs || DEFAULT_TIMEOUT_MS
    );

    if (!metaRes.ok) return payload.userPrompt;
    const data = await metaRes.json();
    return data.content?.[0]?.text || data.choices?.[0]?.message?.content || payload.userPrompt;
  } catch {
    return payload.userPrompt;
  }
}

function resolveStreamFormat(provider, baseUrl) {
  return isRelay(provider, baseUrl) ? 'openai' : provider;
}

function mapStreamChunk(streamFormat, parsed) {
  if (streamFormat === 'claude') {
    if (parsed.type === 'content_block_delta') {
      if (parsed.delta?.type === 'thinking_delta') {
        return { type: 'thinking', content: parsed.delta.thinking || '' };
      }
      if (parsed.delta?.type === 'text_delta') {
        return { type: 'text', content: parsed.delta.text || '' };
      }
    }
    return null;
  }

  if (streamFormat === 'openai') {
    const content = parsed.choices?.[0]?.delta?.content;
    return content ? { type: 'text', content } : null;
  }

  if (streamFormat === 'gemini') {
    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? { type: 'text', content: text } : null;
  }

  return null;
}

async function forwardStreamChunks(upstreamBody, streamFormat, onChunk) {
  const decoder = new TextDecoder();
  const reader = upstreamBody.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      const jsonStr = trimmed.slice(6);
      try {
        const parsed = JSON.parse(jsonStr);
        const chunk = mapStreamChunk(streamFormat, parsed);
        if (chunk) onChunk(chunk);
      } catch {
        // Skip malformed chunks.
      }
    }
  }

  const trailing = buffer.trim();
  if (!trailing || trailing === 'data: [DONE]' || !trailing.startsWith('data: ')) return;
  try {
    const parsed = JSON.parse(trailing.slice(6));
    const chunk = mapStreamChunk(streamFormat, parsed);
    if (chunk) onChunk(chunk);
  } catch {
    // Skip malformed trailing chunk.
  }
}

function sanitizeModels(models, maxModels = MAX_MODELS, maxModelNameLen = MAX_MODEL_NAME_LEN) {
  return models
    .map((m) => {
      if (typeof m === 'string') return m;
      if (m && typeof m === 'object') {
        if (typeof m.id === 'string') return m.id;
        if (typeof m.name === 'string') return m.name;
      }
      return '';
    })
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.length <= maxModelNameLen)
    .slice(0, maxModels);
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MAX_API_KEY_LEN,
  MAX_MODELS,
  MAX_MODEL_NAME_LEN,
  buildClaudeRequest,
  buildGeminiRequest,
  buildOpenAIRequest,
  buildRequest,
  fetchWithTimeout,
  forwardStreamChunks,
  isRelay,
  mapStreamChunk,
  maybeOptimizePrompt,
  normalizeBaseUrl,
  resolveStreamFormat,
  sanitizeModels,
  validateChatPayload,
};

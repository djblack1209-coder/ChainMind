// Probe relay API for available models — calls /v1/models (OpenAI-compatible endpoint)
// Most relay/proxy providers expose this endpoint regardless of underlying provider

import { NextRequest } from 'next/server';
import { isTrustedElectronRequest } from '@/lib/internal-route-auth';
import {
  MAX_API_KEY_LEN,
  fetchWithTimeout,
  normalizeBaseUrl,
  sanitizeModels,
} from '@/lib/llm-core';

// Electron compatibility: use Node.js runtime instead of Edge
export const dynamic = 'force-dynamic';

const MAX_PROBE_BODY_BYTES = 16 * 1024;
const PROBE_TIMEOUT_MS = 10000;

async function parseAndValidateBody(req: NextRequest): Promise<{ ok: true; baseUrl: string; apiKey: string } | { ok: false; status: number; error: string }> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_PROBE_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Payload too large' };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON' };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, status: 400, error: 'Invalid request body' };
  }

  const obj = data as { baseUrl?: unknown; apiKey?: unknown };
  const baseUrlRaw = typeof obj.baseUrl === 'string' ? obj.baseUrl : '';
  const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey.trim() : '';
  const baseUrl = normalizeBaseUrl(baseUrlRaw, '');

  if (!baseUrl || !apiKey || apiKey.length > MAX_API_KEY_LEN) {
    return { ok: false, status: 400, error: 'Missing baseUrl or apiKey' };
  }

  return { ok: true, baseUrl, apiKey };
}

export async function POST(req: NextRequest) {
  if (process.env.ELECTRON === '1' && !isTrustedElectronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseAndValidateBody(req);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }

  const { baseUrl, apiKey } = parsed;
  const base = baseUrl.replace(/\/+$/, '');

  // Try /v1/models first (standard OpenAI-compatible endpoint)
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

      // OpenAI format: { data: [{ id: "model-name", ... }] }
      if (data.data && Array.isArray(data.data)) {
        const models = sanitizeModels(data.data);
        return Response.json({ models, endpoint: url });
      }

      // Some relays return { models: [...] }
      if (data.models && Array.isArray(data.models)) {
        const models = sanitizeModels(data.models);
        return Response.json({ models, endpoint: url });
      }

      // Array directly
      if (Array.isArray(data)) {
        const models = sanitizeModels(data);
        return Response.json({ models, endpoint: url });
      }
    } catch {
      continue;
    }
  }

  return Response.json(
    { error: '无法获取模型列表，该中转可能不支持 /v1/models 接口。请手动输入模型名称。', models: [] },
    { status: 200 }
  );
}

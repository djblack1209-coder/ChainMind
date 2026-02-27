// Streaming API route handler — unified gateway for Claude/OpenAI/Gemini
// Supports custom base URLs for proxy/relay API services

import { NextRequest } from 'next/server';
import type { ChatRequestBody } from '@/lib/types';
import {
  buildRequest,
  forwardStreamChunks,
  maybeOptimizePrompt,
  resolveStreamFormat,
  validateChatPayload,
} from '@/lib/llm-core';
import { isTrustedElectronRequest } from '@/lib/internal-route-auth';

// Electron compatibility: use Node.js runtime instead of Edge
export const dynamic = 'force-dynamic';

const MAX_CHAT_BODY_BYTES = 256 * 1024;

async function parseAndValidateBody(req: NextRequest): Promise<{ ok: true; body: ChatRequestBody } | { ok: false; status: number; message: string }> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_CHAT_BODY_BYTES) {
    return { ok: false, status: 413, message: 'Payload too large' };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON' };
  }

  const validated = validateChatPayload(data);
  if (!validated.ok) {
    return { ok: false, status: validated.status, message: validated.message };
  }

  return {
    ok: true,
    body: validated.payload,
  };
}

export async function POST(req: NextRequest) {
  if (process.env.ELECTRON === '1' && !isTrustedElectronRequest(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = await parseAndValidateBody(req);
  if (!parsed.ok) {
    return new Response(parsed.message, { status: parsed.status });
  }
  const body = parsed.body;

  const { provider, model, apiKey, baseUrl, systemPrompt, userPrompt, temperature, maxTokens, effort, enableMetaPrompt } = body;

  const finalUserPrompt = await maybeOptimizePrompt({
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
  });

  const adapterReq = buildRequest(provider, {
    apiKey,
    baseUrl,
    model,
    systemPrompt,
    userPrompt: finalUserPrompt,
    temperature,
    maxTokens,
    effort,
  });

  const streamFormat = resolveStreamFormat(provider, baseUrl);

  try {
    const upstream = await fetch(adapterReq.url, {
      method: 'POST',
      headers: adapterReq.headers,
      body: adapterReq.body,
    });

    if (!upstream.ok) {
      const errText = (await upstream.text()).slice(0, 4000);
      return new Response(errText, { status: upstream.status });
    }

    if (!upstream.body) {
      return new Response('No response body', { status: 502 });
    }
    const upstreamBody = upstream.body;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function sendChunk(type: string, content: string) {
          const data = JSON.stringify({ type, content });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        try {
          await forwardStreamChunks(upstreamBody, streamFormat, (chunk) => {
            sendChunk(chunk.type, chunk.content);
          });
          sendChunk('done', '');
        } catch (err) {
          sendChunk('error', String(err));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(String(err), { status: 502 });
  }
}

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as chatPost } from '../app/api/chat/route';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function trustedHeaders(): HeadersInit {
  return {
    host: '127.0.0.1:3456',
    origin: 'http://127.0.0.1:3456',
    'x-exec-token': process.env.CHAINMIND_EXEC_TOKEN || '',
  };
}

function makeReq(body: string, headers: HeadersInit = trustedHeaders()): any {
  return {
    headers: new Headers(headers),
    text: async () => body,
  };
}

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

function parseRouteChunks(text: string): Array<{ type: string; content: string }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; content: string });
}

function setElectronEnv() {
  process.env.ELECTRON = '1';
  process.env.HOSTNAME = '127.0.0.1';
  process.env.PORT = '3456';
  process.env.CHAINMIND_EXEC_TOKEN = 'test-exec-token';
}

describe('chat route streaming transforms', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    setElectronEnv();
    global.fetch = vi.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it('transforms OpenAI SSE to route chunk format', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      buildSseResponse([
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    const req = makeReq(JSON.stringify({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
      systemPrompt: 'You are helpful.',
      userPrompt: 'ping',
      temperature: 0.2,
      maxTokens: 64,
      effort: 'low',
      enableMetaPrompt: false,
    }));

    const res = await chatPost(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    const chunks = parseRouteChunks(text);
    expect(chunks).toEqual([
      { type: 'text', content: 'hello' },
      { type: 'text', content: ' world' },
      { type: 'done', content: '' },
    ]);
  });

  it('transforms Claude SSE (including trailing chunk)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      buildSseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"think"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}',
      ])
    );

    const req = makeReq(JSON.stringify({
      provider: 'claude',
      model: 'claude-sonnet-4-5',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      systemPrompt: 'You are helpful.',
      userPrompt: 'ping',
      temperature: 0.2,
      maxTokens: 64,
      effort: 'low',
      enableMetaPrompt: false,
    }));

    const res = await chatPost(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    const chunks = parseRouteChunks(text);
    expect(chunks).toEqual([
      { type: 'thinking', content: 'think' },
      { type: 'text', content: 'answer' },
      { type: 'done', content: '' },
    ]);
  });
});

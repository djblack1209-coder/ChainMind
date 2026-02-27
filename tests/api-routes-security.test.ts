import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { POST as execPost } from '../app/api/exec/route';
import { POST as chatPost } from '../app/api/chat/route';
import { POST as probePost } from '../app/api/probe-models/route';

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

function setElectronEnv() {
  process.env.ELECTRON = '1';
  process.env.HOSTNAME = '127.0.0.1';
  process.env.PORT = '3456';
  process.env.CHAINMIND_EXEC_TOKEN = 'test-exec-token';
}

describe('api route security guards', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    setElectronEnv();
    global.fetch = vi.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it('exec route blocks shell pipe usage', async () => {
    const req = makeReq(JSON.stringify({ command: 'ls | wc -l', cwd: '/tmp' }));
    const res = await execPost(req);
    expect(res.status).toBe(403);
  });

  it('exec route blocks npx without --no-install', async () => {
    const req = makeReq(JSON.stringify({ command: 'npx cowsay hi', cwd: '/tmp' }));
    const res = await execPost(req);
    expect(res.status).toBe(403);
  });

  it('exec route rejects oversized request body', async () => {
    const req = makeReq('x'.repeat(20 * 1024));
    const res = await execPost(req);
    expect(res.status).toBe(413);
  });

  it('chat route rejects oversized body before any upstream fetch', async () => {
    const payload = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'x'.repeat(300 * 1024),
      temperature: 0.7,
      maxTokens: 1024,
      effort: 'medium',
      enableMetaPrompt: false,
    };
    const req = makeReq(JSON.stringify(payload));
    const res = await chatPost(req);
    expect(res.status).toBe(413);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('chat route rejects invalid baseUrl protocol', async () => {
    const payload = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      baseUrl: 'ftp://evil.example',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'ping',
      temperature: 0.7,
      maxTokens: 64,
      effort: 'medium',
      enableMetaPrompt: false,
    };
    const req = makeReq(JSON.stringify(payload));
    const res = await chatPost(req);
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('probe-models route rejects invalid baseUrl protocol', async () => {
    const req = makeReq(JSON.stringify({ baseUrl: 'ftp://invalid', apiKey: 'sk-test' }));
    const res = await probePost(req);
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('probe-models route rejects oversized request body', async () => {
    const req = makeReq('x'.repeat(20 * 1024));
    const res = await probePost(req);
    expect(res.status).toBe(413);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

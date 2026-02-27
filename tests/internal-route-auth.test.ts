import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isAuthorizedExecRequest, isTrustedElectronRequest, getOrCreateExecToken } from '../lib/internal-route-auth';

const ORIGINAL_ENV = { ...process.env };

function makeReq(headers: HeadersInit): any {
  return {
    headers: new Headers(headers),
  };
}

function setElectronEnv() {
  process.env.ELECTRON = '1';
  process.env.HOSTNAME = '127.0.0.1';
  process.env.PORT = '3456';
}

describe('internal route auth', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('trusts loopback request with matching origin in Electron mode', () => {
    setElectronEnv();
    const req = makeReq({
      host: '127.0.0.1:3456',
      origin: 'http://127.0.0.1:3456',
    });
    expect(isTrustedElectronRequest(req)).toBe(true);
  });

  it('rejects request with mismatched origin in Electron mode', () => {
    setElectronEnv();
    const req = makeReq({
      host: '127.0.0.1:3456',
      origin: 'http://127.0.0.1:9999',
    });
    expect(isTrustedElectronRequest(req)).toBe(false);
  });

  it('prefers token auth when CHAINMIND_EXEC_TOKEN is set', () => {
    setElectronEnv();
    process.env.CHAINMIND_EXEC_TOKEN = 'test-token';

    const goodReq = makeReq({
      host: '127.0.0.1:3456',
      origin: 'http://127.0.0.1:3456',
      'x-exec-token': 'test-token',
    });
    const badReq = makeReq({
      host: '127.0.0.1:3456',
      origin: 'http://127.0.0.1:3456',
      'x-exec-token': 'wrong-token',
    });

    expect(isAuthorizedExecRequest(goodReq)).toBe(true);
    expect(isAuthorizedExecRequest(badReq)).toBe(false);
  });

  // C-3: When no token is configured, auto-generates one — Origin alone is no longer sufficient
  it('auto-generates exec token when none is configured', () => {
    setElectronEnv();
    delete process.env.CHAINMIND_EXEC_TOKEN;

    const token = getOrCreateExecToken();
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThanOrEqual(32);

    // Request with auto-generated token should pass
    const goodReq = makeReq({
      host: '127.0.0.1:3456',
      origin: 'http://127.0.0.1:3456',
      'x-exec-token': token,
    });
    expect(isAuthorizedExecRequest(goodReq)).toBe(true);

    // Request without token should fail even with valid Origin
    const noTokenReq = makeReq({
      host: '127.0.0.1:3456',
      origin: 'http://127.0.0.1:3456',
    });
    expect(isAuthorizedExecRequest(noTokenReq)).toBe(false);
  });
});

// File operations API — read, write, list, search files
// SECURITY: Auth check, strict path resolution, no path traversal

import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { join, resolve, dirname, normalize } from 'path';
import { existsSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { isAuthorizedExecRequest } from '@/lib/internal-route-auth';

const MAX_FILES_BODY_BYTES = 12 * 1024 * 1024;
const MAX_WRITE_BYTES = 10 * 1024 * 1024;
const DEFAULT_LIST_PATH = resolve(homedir(), 'Desktop/AI Chain Discussion');

type FileAction = 'read' | 'write' | 'list' | 'stat';

const ALLOWED_ACTIONS: ReadonlySet<FileAction> = new Set(['read', 'write', 'list', 'stat']);
const ALLOWED_ENCODINGS = new Set([
  'utf8',
  'utf-8',
  'ascii',
  'base64',
  'hex',
  'latin1',
  'binary',
  'ucs2',
  'ucs-2',
  'utf16le',
  'utf-16le',
]);

interface ParsedBody {
  action: FileAction;
  filePath?: string;
  content?: string;
  encoding: BufferEncoding;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed || fallback;
  }
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || fallback;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const trimmed = message.trim();
      return trimmed || fallback;
    }
  }
  return fallback;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(normalize(p));
  }
}

function getAllowedBases(): string[] {
  const home = homedir();
  return [
    resolve(home, 'Desktop'),
    resolve(home, 'Documents'),
    resolve(home, 'Projects'),
    resolve('/tmp'),
  ]
    .filter((p) => existsSync(p))
    .map((p) => safeRealpath(p));
}

function isPathAllowed(p: string): boolean {
  if (!p || p.includes('\0')) return false;
  const resolved = safeRealpath(p);
  return getAllowedBases().some((base) => resolved.startsWith(base + '/') || resolved === base);
}

// C-4: Expanded sensitive file blocklist — covers config files, shell profiles, source code injection vectors
const BLOCKED_FILES = [
  /\.env$/i,
  /\.env\.local$/i,
  /\.env\.[^/]+$/i,
  /\.ssh(\/|$)/i,
  /\.gnupg(\/|$)/i,
  /\.aws\/credentials/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.jwt-secret$/i,
  /\.key-encryption-secret$/i,
  /auth\.json$/i,
  // Shell profiles — prevent injection via .bashrc/.zshrc etc.
  /\.(bash_profile|bashrc|zshrc|zprofile|zshenv|profile|login)$/i,
  // Package manager configs that may contain tokens
  /\.npmrc$/i,
  /\.yarnrc$/i,
  /\.pypirc$/i,
  // Git credentials
  /\.gitconfig$/i,
  /\.git-credentials$/i,
  /\.git\/config$/i,
  // macOS keychain
  /\.keychain/i,
];

// C-4: Write operations are restricted to a narrower set of directories
// to prevent overwriting project source code or system files
function getWriteAllowedBases(): string[] {
  const home = homedir();
  return [
    resolve(home, 'Desktop/AI Chain Discussion/workspace'),
    resolve(home, 'Documents'),
    resolve('/tmp'),
  ]
    .filter((p) => existsSync(p) || p.includes('workspace')) // workspace may not exist yet
    .map((p) => {
      try { return realpathSync(p); } catch { return resolve(normalize(p)); }
    });
}

function isWritePathAllowed(p: string): boolean {
  if (!p || p.includes('\0')) return false;
  const resolved = safeRealpath(p);
  return getWriteAllowedBases().some((base) => resolved.startsWith(base + '/') || resolved === base);
}

function isFileSensitive(p: string): boolean {
  const resolved = resolve(normalize(p));
  return BLOCKED_FILES.some((pattern) => pattern.test(resolved));
}

function normalizeEncoding(rawEncoding: unknown): BufferEncoding | null {
  if (rawEncoding === undefined || rawEncoding === null) return 'utf8';
  if (typeof rawEncoding !== 'string') return null;
  const normalized = rawEncoding.trim().toLowerCase();
  if (!normalized) return 'utf8';
  if (!ALLOWED_ENCODINGS.has(normalized)) return null;
  return normalized === 'utf-8' ? 'utf8' : normalized as BufferEncoding;
}

async function parseBody(req: NextRequest): Promise<{ ok: true; data: ParsedBody } | { ok: false; status: number; error: string }> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_FILES_BODY_BYTES) {
    return { ok: false, status: 413, error: '请求体过大' };
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: '无效 JSON' };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: '无效请求体' };
  }

  const input = body as Record<string, unknown>;
  if (typeof input.action !== 'string' || !ALLOWED_ACTIONS.has(input.action as FileAction)) {
    return { ok: false, status: 400, error: '未知操作' };
  }

  if (input.path !== undefined && typeof input.path !== 'string') {
    return { ok: false, status: 400, error: 'path 必须是字符串' };
  }

  const encoding = normalizeEncoding(input.encoding);
  if (!encoding) {
    return { ok: false, status: 400, error: '不支持的 encoding' };
  }

  if (input.action === 'write' && typeof input.content !== 'string') {
    return { ok: false, status: 400, error: 'write 操作需要字符串 content' };
  }

  return {
    ok: true,
    data: {
      action: input.action as FileAction,
      filePath: input.path as string | undefined,
      content: input.content as string | undefined,
      encoding,
    },
  };
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedExecRequest(req)) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 });
  }

  try {
    const parsed = await parseBody(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { action, filePath, content, encoding } = parsed.data;

    if (filePath && !isPathAllowed(filePath)) {
      return NextResponse.json({ error: '不允许访问此路径' }, { status: 403 });
    }

    if (filePath && isFileSensitive(filePath) && action !== 'stat') {
      return NextResponse.json({ error: '不允许访问敏感文件' }, { status: 403 });
    }

    switch (action) {
      case 'read': {
        if (!filePath) return NextResponse.json({ error: '缺少 path' }, { status: 400 });
        try {
          const data = await readFile(filePath, encoding as BufferEncoding);
          const stats = await stat(filePath);
          return NextResponse.json({
            ok: true,
            content: typeof data === 'string' ? data.slice(0, 200000) : '',
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        } catch (e) {
          return NextResponse.json({ ok: false, error: getErrorMessage(e, '读取文件失败') }, { status: 404 });
        }
      }

      case 'write': {
        if (!filePath || content === undefined) {
          return NextResponse.json({ error: '缺少 path 或 content' }, { status: 400 });
        }
        // C-4: Write operations use a narrower allowed directory set
        if (!isWritePathAllowed(filePath)) {
          return NextResponse.json({ error: '写入操作仅允许在 workspace/Documents/tmp 目录下' }, { status: 403 });
        }
        if (isFileSensitive(filePath)) {
          return NextResponse.json({ error: '不允许写入敏感文件' }, { status: 403 });
        }
        const bytesToWrite = Buffer.byteLength(content, encoding);
        if (bytesToWrite > MAX_WRITE_BYTES) {
          return NextResponse.json({ error: '内容过大（最大10MB）' }, { status: 400 });
        }
        try {
          const dir = dirname(filePath);
          if (!existsSync(dir)) await mkdir(dir, { recursive: true });
          await writeFile(filePath, content, encoding);
          return NextResponse.json({ ok: true, bytesWritten: bytesToWrite });
        } catch (e) {
          return NextResponse.json({ ok: false, error: getErrorMessage(e, '写入文件失败') }, { status: 500 });
        }
      }

      case 'list': {
        const dirPath = filePath || DEFAULT_LIST_PATH;
        if (!isPathAllowed(dirPath)) {
          return NextResponse.json({ error: '不允许访问此路径' }, { status: 403 });
        }
        try {
          const entries = await readdir(dirPath, { withFileTypes: true });
          const items = entries
            .filter((e) => !e.name.startsWith('.') || e.name === '.env.local.example')
            .slice(0, 500)
            .map((e) => ({
              name: e.name,
              type: e.isDirectory() ? 'dir' : 'file',
              path: join(dirPath, e.name),
            }));
          return NextResponse.json({ ok: true, items });
        } catch (e) {
          return NextResponse.json({ ok: false, error: getErrorMessage(e, '读取目录失败') }, { status: 404 });
        }
      }

      case 'stat': {
        if (!filePath) return NextResponse.json({ error: '缺少 path' }, { status: 400 });
        try {
          const s = await stat(filePath);
          return NextResponse.json({
            ok: true,
            exists: true,
            isFile: s.isFile(),
            isDir: s.isDirectory(),
            size: s.size,
            modified: s.mtime.toISOString(),
          });
        } catch {
          return NextResponse.json({ ok: true, exists: false });
        }
      }

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

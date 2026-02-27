// File operations API — read, write, list, search files
// SECURITY: Auth check, strict path resolution, no path traversal

import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { join, resolve, dirname, normalize } from 'path';
import { existsSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { isAuthorizedExecRequest } from '@/lib/internal-route-auth';

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

export async function POST(req: NextRequest) {
  if (!isAuthorizedExecRequest(req)) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 });
  }

  try {
    const { action, path: filePath, content, encoding = 'utf-8' } = await req.json();

    if (!action) {
      return NextResponse.json({ error: '缺少 action 参数' }, { status: 400 });
    }

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
        } catch (e: any) {
          return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
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
        if (typeof content === 'string' && content.length > 10 * 1024 * 1024) {
          return NextResponse.json({ error: '内容过大（最大10MB）' }, { status: 400 });
        }
        try {
          const dir = dirname(filePath);
          if (!existsSync(dir)) await mkdir(dir, { recursive: true });
          await writeFile(filePath, content, encoding as BufferEncoding);
          return NextResponse.json({ ok: true, bytesWritten: Buffer.byteLength(content) });
        } catch (e: any) {
          return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
        }
      }

      case 'list': {
        const dirPath = filePath || resolve(homedir(), 'Desktop/AI Chain Discussion');
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
        } catch (e: any) {
          return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
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

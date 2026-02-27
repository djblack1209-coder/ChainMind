// Terminal execution API — runs shell commands
// SECURITY: Auth token required, strict path validation, robust command filtering

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, normalize } from 'path';
import { existsSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { isAuthorizedExecRequest } from '@/lib/internal-route-auth';

// C-2: Use execFile instead of exec to avoid shell interpretation attacks
const execFileAsync = promisify(execFile);

const DEFAULT_WORK_DIR = resolve(homedir(), 'Desktop/AI Chain Discussion');
const DEFAULT_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const MAX_COMMAND_LENGTH = 2000;
const MAX_BODY_BYTES = 16 * 1024;

const ALLOWED_COMMANDS = new Set([
  'ls', 'pwd', 'git', 'npm', 'pnpm', 'yarn', 'tsc', 'vite', 'next',
  'go', 'gofmt', 'cargo', 'rustc',
  'java', 'javac', 'mvn', 'gradle', 'dotnet',
  'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find',
  'cp', 'mv', 'mkdir', 'touch',
  'which', 'whoami', 'uname', 'ps',
]);

// Commands that can execute arbitrary scripts — only allowed with project-local files
const RUNTIME_COMMANDS = new Set(['node', 'bun', 'python', 'python3', 'deno', 'npx', 'pip', 'pip3']);

const SHELL_CONTROL_PATTERN = /[;&`]/;
const SHELL_SUBSHELL_PATTERN = /(\$\()|(<\()|(\$\{)/;  // C-1: block ${} variable expansion
const SHELL_REDIRECT_PATTERN = /(^|[^\\])[<>]/;
const SHELL_NEWLINE_PATTERN = /[\r\n]/;
const SHELL_VARIABLE_PATTERN = /\$[A-Za-z_{(]/;  // C-1: block all shell variable references

const BLOCKED_GIT_SUBCOMMANDS = new Set([
  'config', 'credential', 'clean', 'filter-branch', 'archive',
]);

const BLOCKED_PKG_SUBCOMMANDS = new Set([
  'config', 'login', 'logout', 'token', 'publish', 'owner', 'team', 'access', 'adduser',
]);

const SENSITIVE_PATH_PATTERNS = [
  /\/\.env$/i,
  /\/\.env\.local$/i,
  /\/\.ssh(\/|$)/i,
  /\/\.gnupg(\/|$)/i,
  /\/\.aws\/credentials$/i,
  /\/id_rsa$/i,
  /\/id_ed25519$/i,
  /\/\.jwt-secret$/i,
  /\/auth\.json$/i,
];

// C-1: grep/rg/find all take path arguments that need validation
const PATH_ARG_COMMANDS = new Set(['cat', 'head', 'tail', 'cp', 'mv', 'mkdir', 'touch', 'ls', 'find', 'grep', 'rg']);

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(normalize(p));
  }
}

// Allowed base directories — resolved to absolute, no symlink tricks
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

function isPathAllowed(cwd: string): boolean {
  const resolved = safeRealpath(cwd);
  // Prevent null bytes
  if (resolved.includes('\0')) return false;
  return getAllowedBases().some((base) => resolved.startsWith(base + '/') || resolved === base);
}

function isSensitivePath(p: string): boolean {
  const resolved = safeRealpath(p);
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(resolved));
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (const ch of command.trim()) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === '\'') {
      quote = ch as '"' | '\'';
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    if (ch === '|') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push('|');
      continue;
    }

    current += ch;
  }

  if (quote) return [];
  if (escaped) current += '\\';
  if (current) tokens.push(current);
  return tokens;
}

function normalizeExecutable(token: string): string {
  const normalized = token.split('/').pop() || token;
  return normalized.trim();
}

function normalizePathArg(arg: string, cwd: string): string {
  if (arg === '~') return homedir();
  if (arg.startsWith('~/')) return resolve(homedir(), arg.slice(2));
  return resolve(cwd, arg);
}

function collectPathArgs(primary: string, args: string[]): string[] {
  if (!PATH_ARG_COMMANDS.has(primary)) return [];
  const nonFlags = args.filter((arg) => arg && !arg.startsWith('-'));
  if (primary === 'find') {
    return nonFlags.length > 0 ? [nonFlags[0]] : ['.'];
  }
  // C-1: grep/rg — last non-flag arg(s) are paths/directories
  if (primary === 'grep' || primary === 'rg') {
    // grep PATTERN [FILE...] — skip first non-flag (the pattern), rest are paths
    return nonFlags.slice(1);
  }
  return nonFlags;
}

function hasBlockedInlineRuntime(primary: string, args: string[]): boolean {
  if ((primary === 'node' || primary === 'bun') && args.some((a) => a === '-e' || a === '--eval' || a === '-p' || a === '--print')) {
    return true;
  }
  if ((primary === 'python' || primary === 'python3') && args.some((a) => a === '-c' || a === '-m')) {
    return true;
  }
  if (primary === 'deno') {
    if (args[0] === 'eval') return true;
    if (args.some((a) => /^https?:\/\//i.test(a))) return true;
  }
  return false;
}

// C-1: Validate that runtime commands only execute scripts within allowed directories
function isRuntimeScriptSafe(primary: string, args: string[], cwd: string): boolean {
  if (!RUNTIME_COMMANDS.has(primary)) return true; // not a runtime command

  // Block inline execution
  if (hasBlockedInlineRuntime(primary, args)) return false;

  // H-7: npx — block entirely (too dangerous, can download and execute arbitrary packages)
  if (primary === 'npx') return false;

  // pip/pip3 — only allow install/list/show/freeze, block arbitrary execution
  if (primary === 'pip' || primary === 'pip3') {
    const sub = args.find((a) => a && !a.startsWith('-')) || '';
    const SAFE_PIP_CMDS = new Set(['install', 'list', 'show', 'freeze', 'check', 'uninstall']);
    return SAFE_PIP_CMDS.has(sub);
  }

  // node/bun/python/python3/deno — script file must be within allowed directories
  const scriptArgs = args.filter((a) => a && !a.startsWith('-'));
  if (scriptArgs.length === 0) return false; // bare `node` with no script = REPL, block it

  for (const arg of scriptArgs) {
    // Skip known subcommands (e.g., `deno run`, `node --inspect`)
    if (/^[a-z]+$/.test(arg) && !arg.includes('/') && !arg.includes('.')) continue;
    const resolved = normalizePathArg(arg, cwd);
    if (!isPathAllowed(resolved)) return false;
    if (isSensitivePath(resolved)) return false;
  }
  return true;
}

function isSubcommandAllowed(primary: string, args: string[]): boolean {
  const firstArg = args.find((arg) => arg && !arg.startsWith('-')) || '';

  if (primary === 'git' && firstArg && BLOCKED_GIT_SUBCOMMANDS.has(firstArg)) {
    return false;
  }

  if ((primary === 'npm' || primary === 'pnpm' || primary === 'yarn' || primary === 'bun') && firstArg && BLOCKED_PKG_SUBCOMMANDS.has(firstArg)) {
    return false;
  }

  // H-7: npx is now handled by isRuntimeScriptSafe (blocked entirely)
  // npm install — block installing arbitrary packages with URLs or git repos
  if ((primary === 'npm' || primary === 'pnpm' || primary === 'yarn') && firstArg === 'install') {
    const pkgArgs = args.filter((a) => a && !a.startsWith('-') && a !== 'install');
    for (const pkg of pkgArgs) {
      if (/^https?:\/\//i.test(pkg) || /^git[+@]/i.test(pkg) || pkg.includes('/') && !pkg.startsWith('@')) {
        return false; // block URL/git installs
      }
    }
  }

  return true;
}

function arePathArgsSafe(primary: string, args: string[], cwd: string): boolean {
  const pathArgs = collectPathArgs(primary, args);
  for (const arg of pathArgs) {
    const candidate = normalizePathArg(arg, cwd);
    if (!isPathAllowed(candidate)) return false;
    if (isSensitivePath(candidate)) return false;
  }
  return true;
}

function normalizeTimeout(rawTimeout: unknown): number {
  const num = typeof rawTimeout === 'number' ? rawTimeout : Number(rawTimeout);
  if (!Number.isFinite(num)) return DEFAULT_TIMEOUT_MS;
  const bounded = Math.trunc(num);
  return Math.min(Math.max(bounded, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function normalizeExecFailure(error: unknown): { stdout: string; stderr: string; exitCode: number } {
  const fallbackMessage = error instanceof Error ? error.message : String(error || '命令执行失败');

  if (!error || typeof error !== 'object') {
    return {
      stdout: '',
      stderr: fallbackMessage,
      exitCode: 1,
    };
  }

  const maybeError = error as {
    stdout?: unknown;
    stderr?: unknown;
    message?: unknown;
    code?: unknown;
  };

  const stdout = typeof maybeError.stdout === 'string' ? maybeError.stdout : '';
  const stderr = typeof maybeError.stderr === 'string'
    ? maybeError.stderr
    : (typeof maybeError.message === 'string' ? maybeError.message : fallbackMessage);

  const rawCode = typeof maybeError.code === 'number' ? maybeError.code : Number(maybeError.code);
  const exitCode = Number.isFinite(rawCode) ? Math.trunc(rawCode) : 1;

  return {
    stdout,
    stderr,
    exitCode,
  };
}

async function parseBody(req: NextRequest): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: '请求体过大' };
  }

  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, status: 400, error: '无效请求体' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 400, error: '无效 JSON' };
  }
}

// Dangerous commands — comprehensive blocklist
const BLOCKED_PATTERNS = [
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(?!tmp)/i, // rm -rf / (allow /tmp)
  /mkfs/i,
  /dd\s+if=/i,
  /:()\s*\{.*\}.*:/,                              // fork bomb variants
  />\s*\/dev\/sd/i,
  /shutdown/i,
  /reboot/i,
  /chmod\s+777\s+\//i,
  /chown\s+-R.*\//i,
  /curl\s+.*\|\s*(ba)?sh/i,                       // curl pipe to shell
  /wget\s+.*\|\s*(ba)?sh/i,
  /eval\s*\(/i,
  /\bsudo\b/i,
  /\bsu\s+-/i,
  /launchctl/i,
  /osascript/i,                                    // macOS AppleScript injection
  /open\s+-a\s+Terminal/i,
  /networksetup/i,
  /security\s+delete/i,
  /defaults\s+write/i,
];

function isCommandSafe(cmd: string): boolean {
  if (SHELL_CONTROL_PATTERN.test(cmd)) return false;
  if (SHELL_SUBSHELL_PATTERN.test(cmd)) return false;
  if (SHELL_REDIRECT_PATTERN.test(cmd)) return false;
  if (SHELL_NEWLINE_PATTERN.test(cmd)) return false;
  if (SHELL_VARIABLE_PATTERN.test(cmd)) return false;  // C-1: block shell variable expansion
  if (BLOCKED_PATTERNS.some((p) => p.test(cmd))) return false;

  const tokens = tokenizeCommand(cmd);
  if (tokens.length === 0) return false;
  if (tokens.includes('|')) return false;

  const primary = normalizeExecutable(tokens[0]);
  if (!primary) return false;
  // Accept both standard commands and runtime commands
  if (!ALLOWED_COMMANDS.has(primary) && !RUNTIME_COMMANDS.has(primary)) return false;

  const args = tokens.slice(1);
  if (!isSubcommandAllowed(primary, args)) return false;
  if (hasBlockedInlineRuntime(primary, args)) return false;

  return true;
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

    const { command, cwd, timeout } = parsed.data;

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: '缺少命令参数' }, { status: 400 });
    }

    if (command.length > MAX_COMMAND_LENGTH) {
      return NextResponse.json({ error: '命令过长' }, { status: 400 });
    }

    const workDir = typeof cwd === 'string' && cwd.trim() ? cwd : DEFAULT_WORK_DIR;

    if (!isPathAllowed(workDir)) {
      return NextResponse.json({ error: `不允许在此目录执行` }, { status: 403 });
    }

    if (!existsSync(workDir)) {
      return NextResponse.json({ error: '工作目录不存在' }, { status: 400 });
    }

    if (!isCommandSafe(command)) {
      return NextResponse.json({ error: '该命令被安全策略阻止或不在允许列表中' }, { status: 403 });
    }

    const tokens = tokenizeCommand(command);
    const primary = normalizeExecutable(tokens[0] || '');
    const args = tokens.slice(1);
    if (!arePathArgsSafe(primary, args, workDir)) {
      return NextResponse.json({ error: '命令参数包含不允许的路径或敏感文件' }, { status: 403 });
    }

    // C-1: Validate runtime commands (node/python/deno etc.) only run project-local scripts
    if (!isRuntimeScriptSafe(primary, args, workDir)) {
      return NextResponse.json({ error: '运行时命令仅允许执行项目目录内的脚本' }, { status: 403 });
    }

    const effectiveTimeout = normalizeTimeout(timeout);

    try {
      // C-2: Use execFile with explicit args array to avoid shell interpretation attacks.
      // Resolve the executable via PATH lookup by using shell:false (default for execFile).
      // We pass the tokenized args directly so zsh never interprets the command string.
      const executablePath = tokens[0] || primary;
      const { stdout, stderr } = await execFileAsync(executablePath, args, {
        cwd: workDir,
        timeout: effectiveTimeout,
        maxBuffer: 1024 * 1024 * 5,
        env: {
          ...process.env,
          PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
          TERM: 'xterm-256color',
        },
        shell: false,
      });

      return NextResponse.json({
        ok: true,
        stdout: stdout.slice(0, 50000),
        stderr: stderr.slice(0, 10000),
        exitCode: 0,
      });
    } catch (execErr: unknown) {
      const failure = normalizeExecFailure(execErr);
      return NextResponse.json({
        ok: false,
        stdout: failure.stdout.slice(0, 50000),
        stderr: failure.stderr.slice(0, 10000),
        exitCode: failure.exitCode,
      });
    }
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

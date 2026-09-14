import { existsSync, cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = resolve(root, '.next/standalone');
const entry = resolve(standalone, 'server.js');
const { values } = parseArgs({ options: { port: { type: 'string', short: 'p' } } });
const port = Number(values.port || process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Port must be an integer between 1 and 65535.');
  process.exit(1);
}
if (!existsSync(entry)) {
  console.error('Production build missing. Run npm run build first.');
  process.exit(1);
}

// Standalone output does not copy these assets automatically.
cpSync(resolve(root, 'public'), resolve(standalone, 'public'), { recursive: true });
cpSync(resolve(root, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
const server = spawn(process.execPath, [entry], {
  cwd: standalone,
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port) },
  stdio: 'inherit',
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));

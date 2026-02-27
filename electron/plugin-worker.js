// Plugin sandbox worker — runs plugin code in an isolated Worker thread
// Only whitelisted modules are available; dangerous APIs are blocked.

'use strict';

const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// Blocked modules — plugins must NOT access these
const BLOCKED_MODULES = new Set([
  'child_process', 'cluster', 'dgram', 'dns', 'http2',
  'inspector', 'net', 'tls', 'vm', 'worker_threads',
  'electron', 'better-sqlite3',
]);

// Read-only fs wrapper — plugins can read files in their own directory only
function createSandboxedFs(pluginDir) {
  const resolveSafe = (p) => {
    const resolved = path.resolve(pluginDir, p);
    if (!resolved.startsWith(pluginDir)) {
      throw new Error(`Access denied: path escapes plugin directory`);
    }
    return resolved;
  };
  return {
    readFileSync: (p, opts) => fs.readFileSync(resolveSafe(p), opts),
    existsSync: (p) => fs.existsSync(resolveSafe(p)),
    readdirSync: (p, opts) => fs.readdirSync(resolveSafe(p), opts),
    statSync: (p) => fs.statSync(resolveSafe(p)),
  };
}

function createSandboxedRequire(pluginDir) {
  return function sandboxedRequire(id) {
    // Block dangerous built-in modules
    if (BLOCKED_MODULES.has(id)) {
      throw new Error(`Module "${id}" is not available in plugin sandbox`);
    }
    // Allow relative requires within plugin dir
    if (id.startsWith('.') || id.startsWith('/')) {
      const resolved = path.resolve(pluginDir, id);
      if (!resolved.startsWith(pluginDir)) {
        throw new Error(`Cannot require outside plugin directory`);
      }
      return require(resolved);
    }
    // Allow safe built-ins — H-4: removed http, https, os to prevent data exfiltration
    // Plugins needing network access should request it via parentPort.postMessage
    const SAFE_BUILTINS = new Set([
      'path', 'url', 'util', 'events', 'stream', 'string_decoder',
      'querystring', 'crypto', 'buffer', 'assert',
    ]);
    if (SAFE_BUILTINS.has(id)) {
      return require(id);
    }
    // Allow node_modules within plugin dir
    const nmPath = path.join(pluginDir, 'node_modules', id);
    if (fs.existsSync(nmPath)) {
      return require(nmPath);
    }
    throw new Error(`Module "${id}" is not available in plugin sandbox`);
  };
}

// --- Main execution ---
const { pluginDir, entryFile } = workerData;
let pluginModule = null;

try {
  const sandboxedRequire = createSandboxedRequire(pluginDir);
  const sandboxedFs = createSandboxedFs(pluginDir);

  // Load plugin entry with sandboxed require context
  const entryPath = path.join(pluginDir, entryFile);
  const code = fs.readFileSync(entryPath, 'utf-8');

  // Create a sandboxed module context
  const moduleObj = { exports: {} };
  const context = vm.createContext({
    require: sandboxedRequire,
    module: moduleObj,
    exports: moduleObj.exports,
    __filename: entryPath,
    __dirname: pluginDir,
    fs: sandboxedFs,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  const script = new vm.Script(code, { filename: entryPath });
  script.runInContext(context, { timeout: 5000 });
  pluginModule = moduleObj.exports;

  parentPort.postMessage({ type: 'loaded', ok: true });
} catch (err) {
  parentPort.postMessage({ type: 'loaded', ok: false, error: err.message });
}

// Handle messages from main thread
parentPort.on('message', async (msg) => {
  try {
    switch (msg.type) {
      case 'register':
        if (typeof pluginModule?.register === 'function') {
          await pluginModule.register({ pluginDir });
        }
        parentPort.postMessage({ type: 'register', ok: true, id: msg.id });
        break;

      case 'unregister':
        if (typeof pluginModule?.unregister === 'function') {
          await pluginModule.unregister();
        }
        parentPort.postMessage({ type: 'unregister', ok: true, id: msg.id });
        break;

      case 'call':
        if (typeof pluginModule?.[msg.method] === 'function') {
          const result = await pluginModule[msg.method](...(msg.args || []));
          parentPort.postMessage({ type: 'call', ok: true, id: msg.id, result });
        } else {
          parentPort.postMessage({ type: 'call', ok: false, id: msg.id, error: `Method "${msg.method}" not found` });
        }
        break;

      default:
        parentPort.postMessage({ type: 'error', error: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    parentPort.postMessage({ type: msg.type, ok: false, id: msg.id, error: err.message });
  }
});

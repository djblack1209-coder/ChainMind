// ChainMind Plugin System — Worker thread sandbox isolation
// Plugins run in isolated Worker threads with restricted module access

'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');
const { Worker } = require('worker_threads');
const fsp = fs.promises;

const WORKER_SCRIPT = path.join(__dirname, 'plugin-worker.js');
const PLUGIN_TIMEOUT = 10000; // 10s timeout for plugin operations

class PluginManager {
  constructor() {
    this.plugins = new Map(); // id -> { manifest, worker, status, _msgId }
    this.pluginDir = '';
  }

  async init(userDataPath) {
    this.pluginDir = path.join(userDataPath, 'plugins');
    await fsp.mkdir(this.pluginDir, { recursive: true });
    this._registerIPC();
    await this._loadBuiltinPlugins();
  }

  // Send a message to a plugin worker and wait for response
  _sendToWorker(worker, msg, options = {}) {
    const { terminateOnTimeout = true } = options;

    return new Promise((resolve, reject) => {
      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      msg.id = id;

      let settled = false;

      const cleanup = () => {
        worker.off('message', handler);
        worker.off('error', onError);
      };

      const finishResolve = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(result);
      };

      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error || 'Plugin operation failed')));
      };

      const timer = setTimeout(() => {
        if (terminateOnTimeout) {
          worker.terminate().catch(() => {});
        }
        finishReject(new Error('Plugin operation timed out'));
      }, PLUGIN_TIMEOUT);

      const handler = (response) => {
        if (!response || typeof response !== 'object') return;
        if (response.id === id || (response.type === msg.type && !response.id)) {
          if (response.ok) finishResolve(response.result);
          else finishReject(new Error(response.error || 'Plugin operation failed'));
        }
      };

      const onError = (err) => {
        finishReject(err);
      };

      worker.on('message', handler);
      worker.on('error', onError);

      try {
        worker.postMessage(msg);
      } catch (err) {
        finishReject(err);
      }
    });
  }

  async load(pluginId) {
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin "${pluginId}" is already loaded`);
    }

    const pluginPath = path.join(this.pluginDir, pluginId);
    const manifestPath = path.join(pluginPath, 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const entryFile = manifest.main || 'index.js';
    const entryPath = path.join(pluginPath, entryFile);

    if (!fs.existsSync(entryPath)) {
      throw new Error(`Plugin entry not found: ${entryPath}`);
    }

    // Spawn worker thread with plugin code
    const worker = new Worker(WORKER_SCRIPT, {
      workerData: { pluginDir: pluginPath, entryFile },
    });

    // Wait for initial load confirmation
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('Plugin load timed out'));
      }, PLUGIN_TIMEOUT);

      worker.once('message', (msg) => {
        clearTimeout(timer);
        if (msg.type === 'loaded' && msg.ok) resolve(true);
        else reject(new Error(msg.error || 'Plugin failed to load'));
      });

      worker.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Call register()
    await this._sendToWorker(worker, { type: 'register' });

    const instance = { id: pluginId, manifest, worker, status: 'loaded' };

    // Handle unexpected worker exit
    worker.on('exit', (code) => {
      if (this.plugins.has(pluginId)) {
        console.error(`[Plugin] Worker for "${pluginId}" exited with code ${code}`);
        this.plugins.get(pluginId).status = 'crashed';
      }
    });

    this.plugins.set(pluginId, instance);
    console.log(`[Plugin] Loaded (sandboxed): ${manifest.name} v${manifest.version}`);
    return manifest;
  }

  async unload(pluginId) {
    const instance = this.plugins.get(pluginId);
    if (!instance) return false;

    try {
      if (instance.worker && instance.status === 'loaded') {
        await this._sendToWorker(instance.worker, { type: 'unregister' });
      }
    } catch {
      // Worker may already be dead
    }

    try {
      if (instance.worker) await instance.worker.terminate();
    } catch { /* ignore */ }

    this.plugins.delete(pluginId);
    console.log(`[Plugin] Unloaded: ${pluginId}`);
    return true;
  }

  // Call a method on a loaded plugin
  async call(pluginId, method, ...args) {
    const instance = this.plugins.get(pluginId);
    if (!instance) throw new Error(`Plugin "${pluginId}" not loaded`);
    if (instance.status !== 'loaded') throw new Error(`Plugin "${pluginId}" is ${instance.status}`);
    return this._sendToWorker(instance.worker, { type: 'call', method, args });
  }

  list() {
    const result = [];
    for (const [id, inst] of this.plugins) {
      result.push({
        id,
        name: inst.manifest.name,
        version: inst.manifest.version,
        description: inst.manifest.description || '',
        status: inst.status,
      });
    }
    return result;
  }

  async _loadBuiltinPlugins() {
    if (!fs.existsSync(this.pluginDir)) return;

    let dirs = [];
    try {
      dirs = await fsp.readdir(this.pluginDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const manifest = path.join(this.pluginDir, d.name, 'plugin.json');
      if (fs.existsSync(manifest)) {
        try {
          const m = JSON.parse(await fsp.readFile(manifest, 'utf-8'));
          if (m.autoLoad !== false) {
            this.load(d.name).catch((e) =>
              console.error(`[Plugin] Failed to auto-load ${d.name}:`, e.message)
            );
          }
        } catch { /* skip */ }
      }
    }
  }

  _registerIPC() {
    ipcMain.handle('plugin:load', async (_, pluginId) => {
      try {
        return { ok: true, data: await this.load(pluginId) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    ipcMain.handle('plugin:unload', async (_, pluginId) => {
      return { ok: await this.unload(pluginId) };
    });

    ipcMain.handle('plugin:list', () => {
      return { ok: true, data: this.list() };
    });

    ipcMain.handle('plugin:call', async (_, pluginId, method, ...args) => {
      try {
        const result = await this.call(pluginId, method, ...args);
        return { ok: true, data: result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  }

  // Terminate all plugin workers on app quit
  async shutdown() {
    for (const [id] of this.plugins) {
      await this.unload(id).catch(() => {});
    }
  }
}

module.exports = new PluginManager();

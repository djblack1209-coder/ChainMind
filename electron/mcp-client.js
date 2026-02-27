// ChainMind MCP Client — connects to GVA's MCP Server or any MCP-compatible server
// Provides tool discovery and invocation via IPC

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const readline = require('readline');

const MAX_MCP_MESSAGE_BYTES = 1024 * 1024;

class MCPClient {
  constructor() {
    this.process = null;
    this.requestId = 0;
    this.pending = new Map(); // id -> { resolve, reject, timeoutId }
    this.tools = [];
    this.connected = false;
    this._lastConfig = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._maxReconnectAttempts = 5;
    this._intentionalDisconnect = false;
  }

  init() {
    this._registerIPC();
  }

  async connect(config) {
    // config: { command, args, env } or { url }
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid MCP config');
    }

    if (this.connected) await this.disconnect();
    this._intentionalDisconnect = false;
    this._lastConfig = config;
    this._reconnectAttempts = 0;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }

    await this._doConnect(config);
    return { tools: this.tools };
  }

  async _doConnect(config) {
    if (config.command) {
      // stdio transport
      this.process = spawn(config.command, config.args || [], {
        env: { ...process.env, ...(config.env || {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      this.rl = readline.createInterface({ input: this.process.stdout });
      this.rl.on('line', (line) => this._handleMessage(line));
      this.process.stderr.on('data', (d) => {
        console.error('[MCP stderr]', d.toString());
      });
      this.process.stdin.on('error', (err) => {
        console.error('[MCP] stdin error (EPIPE):', err.message);
        this.connected = false;
      });
      this.process.on('exit', (code) => {
        console.log('[MCP] process exited with code', code);
        this.connected = false;
        this.tools = [];
        for (const [_id, pendingRequest] of this.pending) {
          clearTimeout(pendingRequest.timeoutId);
          pendingRequest.reject(new Error('MCP process exited'));
        }
        this.pending.clear();
        this._scheduleReconnect();
      });
    } else {
      throw new Error('Only stdio transport supported currently');
    }

    this.connected = true;

    // Initialize
    await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ChainMind', version: '1.0.0' },
    });

    // Send initialized notification
    this._notify('notifications/initialized', {});

    // Discover tools
    const result = await this._send('tools/list', {});
    this.tools = result.tools || [];

    console.log(`[MCP] Connected, ${this.tools.length} tools available`);
  }

  _scheduleReconnect() {
    if (this._intentionalDisconnect || !this._lastConfig) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error(`[MCP] Max reconnect attempts (${this._maxReconnectAttempts}) reached, giving up`);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    console.log(`[MCP] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this._doConnect(this._lastConfig);
        this._reconnectAttempts = 0;
        console.log('[MCP] Reconnected successfully');
      } catch (err) {
        console.error('[MCP] Reconnect failed:', err.message);
        this._scheduleReconnect();
      }
    }, delay);
  }

  async disconnect() {
    this._intentionalDisconnect = true;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.connected = false;
    this.tools = [];
    for (const [_id, pendingRequest] of this.pending) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(new Error('MCP disconnected'));
    }
    this.pending.clear();
  }

  async callTool(name, args) {
    if (!this.connected) throw new Error('MCP not connected');
    const result = await this._send('tools/call', { name, arguments: args });
    return result;
  }

  _send(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        return reject(new Error('MCP process not available'));
      }
      const id = ++this.requestId;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });

      const timeoutId = setTimeout(() => {
        const pendingRequest = this.pending.get(id);
        if (!pendingRequest) return;
        this.pending.delete(id);
        pendingRequest.reject(new Error(`MCP request timeout: ${method}`));
      }, 30000);

      this.pending.set(id, { resolve, reject, timeoutId });

      try {
        this.process.stdin.write(msg + '\n');
      } catch (err) {
        clearTimeout(timeoutId);
        this.pending.delete(id);
        return reject(new Error(`MCP write failed: ${err.message}`));
      }
    });
  }

  _notify(method, params) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    try {
      if (this.process?.stdin?.writable) {
        this.process.stdin.write(msg + '\n');
      }
    } catch (err) {
      console.error('[MCP] notify write failed:', err.message);
    }
  }

  _handleMessage(line) {
    if (typeof line !== 'string' || !line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > MAX_MCP_MESSAGE_BYTES) {
      console.error('[MCP] message too large, skipped');
      return;
    }

    try {
      const msg = JSON.parse(line);
      if (!msg || typeof msg !== 'object') return;

      const responseId = msg.id;
      if ((typeof responseId === 'number' || typeof responseId === 'string') && this.pending.has(responseId)) {
        const pendingRequest = this.pending.get(responseId);
        if (!pendingRequest) return;

        this.pending.delete(responseId);
        clearTimeout(pendingRequest.timeoutId);

        if (msg.error) {
          const errorMessage = (msg.error && typeof msg.error.message === 'string')
            ? msg.error.message
            : 'MCP request failed';
          pendingRequest.reject(new Error(errorMessage));
          return;
        }

        pendingRequest.resolve(msg.result);
      }
    } catch (err) {
      if (err instanceof SyntaxError) return;
      console.error('[MCP] message handling error:', err.message);
    }
  }

  _registerIPC() {
    ipcMain.handle('mcp:connect', async (_, config) => {
      try {
        const result = await this.connect(config);
        return { ok: true, data: result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    ipcMain.handle('mcp:disconnect', async () => {
      await this.disconnect();
      return { ok: true };
    });

    ipcMain.handle('mcp:callTool', async (_, name, args) => {
      try {
        const result = await this.callTool(name, args);
        return { ok: true, data: result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    ipcMain.handle('mcp:listTools', () => {
      return { ok: true, data: this.tools };
    });
  }
}

module.exports = new MCPClient();

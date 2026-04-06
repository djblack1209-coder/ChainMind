// ChainMind MCP Client — connects to GVA's MCP Server or any MCP-compatible server
// Provides tool discovery and invocation via IPC

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const readline = require('readline');

const MAX_MCP_MESSAGE_BYTES = 1024 * 1024;
const MAX_COMMAND_LENGTH = 1024;
const MAX_ARGS_COUNT = 64;
const MAX_ARG_LENGTH = 4096;
const MAX_ENV_VARS = 64;
const MAX_ENV_VALUE_LENGTH = 4096;

function toErrorMessage(errorLike, fallback) {
  if (errorLike instanceof Error && errorLike.message) return errorLike.message;
  if (typeof errorLike === 'string' && errorLike.trim()) return errorLike;
  return fallback;
}

function normalizeMcpConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Invalid MCP config');
  }

  if (!config.command || typeof config.command !== 'string') {
    throw new Error('Only stdio transport supported currently');
  }

  const command = config.command.trim();
  if (!command) {
    throw new Error('MCP command is required');
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error('MCP command is too long');
  }
  if (/[\0\r\n]/.test(command)) {
    throw new Error('MCP command contains invalid characters');
  }

  const rawArgs = config.args === undefined ? [] : config.args;
  if (!Array.isArray(rawArgs)) {
    throw new Error('MCP args must be an array of strings');
  }
  if (rawArgs.length > MAX_ARGS_COUNT) {
    throw new Error('MCP args exceed allowed count');
  }
  const args = rawArgs.map((arg, index) => {
    if (typeof arg !== 'string') {
      throw new Error(`MCP arg at index ${index} must be a string`);
    }
    if (arg.length > MAX_ARG_LENGTH) {
      throw new Error(`MCP arg at index ${index} is too long`);
    }
    if (/[\0\r\n]/.test(arg)) {
      throw new Error(`MCP arg at index ${index} contains invalid characters`);
    }
    return arg;
  });

  const rawEnv = config.env === undefined ? {} : config.env;
  if (!rawEnv || typeof rawEnv !== 'object' || Array.isArray(rawEnv)) {
    throw new Error('MCP env must be a key-value object');
  }

  const envEntries = Object.entries(rawEnv);
  if (envEntries.length > MAX_ENV_VARS) {
    throw new Error('MCP env exceeds allowed variable count');
  }

  const env = {};
  for (const [key, value] of envEntries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid MCP env key: ${key}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`MCP env value for ${key} must be a string`);
    }
    if (value.length > MAX_ENV_VALUE_LENGTH) {
      throw new Error(`MCP env value for ${key} is too long`);
    }
    if (/[\0\r\n]/.test(value)) {
      throw new Error(`MCP env value for ${key} contains invalid characters`);
    }
    env[key] = value;
  }

  return {
    command,
    args,
    env,
  };
}

class MCPClient {
  constructor() {
    this.process = null;
    this.rl = null;
    this.requestId = 0;
    this.pending = new Map(); // id -> { resolve, reject, timeoutId }
    this.tools = [];
    this.connected = false;
    this._lastConfig = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._maxReconnectAttempts = 5;
    this._intentionalDisconnect = false;
    this._lineHandler = null;
    this._stderrHandler = null;
    this._stdinErrorHandler = null;
    this._exitHandler = null;
  }

  init() {
    this._registerIPC();
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _rejectPendingRequests(message) {
    for (const [_id, pendingRequest] of this.pending) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(new Error(message));
    }
    this.pending.clear();
  }

  _detachProcessListeners(proc) {
    if (this.rl) {
      if (this._lineHandler) {
        this.rl.off('line', this._lineHandler);
      }
      this.rl.close();
      this.rl = null;
    }

    if (proc) {
      if (this._stderrHandler) {
        proc.stderr?.off('data', this._stderrHandler);
      }
      if (this._stdinErrorHandler) {
        proc.stdin?.off('error', this._stdinErrorHandler);
      }
      if (this._exitHandler) {
        proc.off('exit', this._exitHandler);
      }
    }

    this._lineHandler = null;
    this._stderrHandler = null;
    this._stdinErrorHandler = null;
    this._exitHandler = null;
  }

  async connect(config) {
    const normalizedConfig = normalizeMcpConfig(config);

    if (this.connected) await this.disconnect();
    this._intentionalDisconnect = false;
    this._lastConfig = normalizedConfig;
    this._reconnectAttempts = 0;
    this._clearReconnectTimer();

    await this._doConnect(normalizedConfig);
    return { tools: this.tools };
  }

  async _doConnect(config) {
    // stdio transport
    const proc = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.process = proc;
    this.rl = readline.createInterface({ input: proc.stdout });

    this._lineHandler = (line) => this._handleMessage(line);
    this._stderrHandler = (d) => {
      console.error('[MCP stderr]', d.toString());
    };
    this._stdinErrorHandler = (err) => {
      if (this.process !== proc) return;
      console.error('[MCP] stdin error (EPIPE):', err.message);
      this.connected = false;
    };
    this._exitHandler = (code) => {
      if (this.process !== proc) return;
      console.log('[MCP] process exited with code', code);
      this._detachProcessListeners(proc);
      this.process = null;
      this.connected = false;
      this.tools = [];
      this._rejectPendingRequests('MCP process exited');
      this._scheduleReconnect();
    };

    this.rl.on('line', this._lineHandler);
    proc.stderr.on('data', this._stderrHandler);
    proc.stdin.on('error', this._stdinErrorHandler);
    proc.on('exit', this._exitHandler);

    this.connected = true;

    try {
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
    } catch (err) {
      const failedProc = this.process;
      this.process = null;
      this.connected = false;
      this.tools = [];
      if (failedProc) {
        this._detachProcessListeners(failedProc);
        try {
          failedProc.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
      this._rejectPendingRequests('MCP connection failed');
      throw err;
    }
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
        console.error('[MCP] Reconnect failed:', toErrorMessage(err, 'Unknown reconnect error'));
        this._scheduleReconnect();
      }
    }, delay);
  }

  async disconnect() {
    this._intentionalDisconnect = true;
    this._clearReconnectTimer();
    const proc = this.process;
    this.process = null;
    if (proc) {
      this._detachProcessListeners(proc);
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    this.connected = false;
    this.tools = [];
    this._rejectPendingRequests('MCP disconnected');
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
        return { ok: false, error: toErrorMessage(e, 'MCP connect failed') };
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
        return { ok: false, error: toErrorMessage(e, 'MCP tool call failed') };
      }
    });

    ipcMain.handle('mcp:listTools', () => {
      return { ok: true, data: this.tools };
    });
  }
}

module.exports = new MCPClient();

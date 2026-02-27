// ChainMind Configuration Manager — ported from GVA's Viper config pattern
// Centralized config with file persistence, env override, and runtime reload

const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');

const DEFAULT_CONFIG = {
  // System
  system: {
    port: 3456,
    language: 'zh-CN',
    theme: 'dark',
  },
  // AI Providers (keys stored encrypted in IndexedDB, base URLs here)
  providers: {
    claude: { baseUrl: 'https://api.anthropic.com', enabled: true },
    openai: { baseUrl: 'https://api.openai.com', enabled: true },
    gemini: { baseUrl: 'https://generativelanguage.googleapis.com', enabled: true },
  },
  // MCP Server connections
  mcp: {
    servers: [
      {
        name: 'GVA Helper',
        command: '',
        args: [],
        env: {},
        autoConnect: false,
      },
    ],
  },
  // Cloud storage (ported from GVA's OSS config)
  storage: {
    type: 'local', // local | aliyun | aws | minio | qiniu | tencent
    local: { storagePath: '' },
    aliyun: { endpoint: '', accessKeyId: '', accessKeySecret: '', bucketName: '', bucketUrl: '' },
    aws: { region: '', accessKeyId: '', secretAccessKey: '', bucket: '', endpoint: '' },
    minio: { endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', useSSL: false },
    qiniu: { accessKey: '', secretKey: '', bucket: '', domain: '' },
    tencent: { region: '', secretId: '', secretKey: '', bucket: '' },
  },
  // Plugin settings
  plugins: {
    autoLoad: true,
    directory: '', // set on init
  },
  // Chain discussion defaults
  chain: {
    defaultRounds: 3,
    defaultMode: 'sequential',
    maxConcurrency: 3,
  },
  // Logging
  log: {
    level: 'info',
    retentionDays: 30,
  },
};

class ConfigManager {
  constructor() {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.configPath = '';
    this.watchers = new Map();
    this._saveTimer = null;
  }

  init(userDataPath) {
    this.configPath = path.join(userDataPath, 'config.json');
    this.config.storage.local.storagePath = path.join(userDataPath, 'storage');
    this.config.plugins.directory = path.join(userDataPath, 'plugins');

    this._load();
    this._registerIPC();
  }

  _load() {
    if (fs.existsSync(this.configPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        this.config = this._deepMerge(this.config, saved);
      } catch (e) {
        console.error('[Config] Failed to load, using defaults:', e.message);
      }
    }
    // Apply env overrides
    this._applyEnvOverrides();
    this._save();
  }

  _save() {
    // Debounced async write — coalesce rapid set() calls
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
        .catch((e) => console.error('[Config] Failed to save:', e.message));
    }, 200);
  }

  _applyEnvOverrides() {
    if (process.env.CHAINMIND_PORT) this.config.system.port = parseInt(process.env.CHAINMIND_PORT);
    if (process.env.CHAINMIND_LANG) this.config.system.language = process.env.CHAINMIND_LANG;
    if (process.env.CLAUDE_BASE_URL) this.config.providers.claude.baseUrl = process.env.CLAUDE_BASE_URL;
    if (process.env.OPENAI_BASE_URL) this.config.providers.openai.baseUrl = process.env.OPENAI_BASE_URL;
  }

  get(keyPath) {
    const keys = keyPath.split('.');
    let val = this.config;
    for (const k of keys) {
      if (val == null) return undefined;
      val = val[k];
    }
    return val;
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] == null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._save();
    this._notifyWatchers(keyPath, value);
  }

  getAll() {
    return JSON.parse(JSON.stringify(this.config));
  }

  reset() {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this._save();
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  _notifyWatchers(keyPath, value) {
    for (const [prefix, cb] of this.watchers) {
      if (keyPath.startsWith(prefix)) cb(keyPath, value);
    }
  }

  _registerIPC() {
    ipcMain.handle('config:get', (_, keyPath) => {
      return { ok: true, data: keyPath ? this.get(keyPath) : this.getAll() };
    });

    ipcMain.handle('config:set', (_, keyPath, value) => {
      this.set(keyPath, value);
      return { ok: true };
    });

    ipcMain.handle('config:reset', () => {
      this.reset();
      return { ok: true };
    });

    ipcMain.handle('config:getAll', () => {
      return { ok: true, data: this.getAll() };
    });
  }
}

module.exports = new ConfigManager();

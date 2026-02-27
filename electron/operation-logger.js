// ChainMind Operation Logger — records user actions and system events
// Inspired by GVA's operation record middleware

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const readline = require('readline');

class OperationLogger {
  constructor() {
    this.logDir = '';
    this.currentLogFile = '';
    this.retentionDays = 30;
  }

  init(userDataPath) {
    this.logDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this._rotateLogFile();
    this._registerIPC();
    // Run retention cleanup on startup (non-blocking)
    this._cleanOldLogs().catch((e) => console.error('[Log] cleanup error:', e.message));
  }

  setRetentionDays(days) {
    this.retentionDays = days;
  }

  _rotateLogFile() {
    const date = new Date().toISOString().slice(0, 10);
    this.currentLogFile = path.join(this.logDir, `operations-${date}.jsonl`);
  }

  async log(entry) {
    this._rotateLogFile();
    const record = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await fsp.appendFile(this.currentLogFile, JSON.stringify(record) + '\n', 'utf-8');
  }

  async query({ date, type, limit = 100 }) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.logDir, `operations-${targetDate}.jsonl`);
    try {
      await fsp.access(filePath);
    } catch {
      return [];
    }

    // Stream-read to avoid loading entire file into memory
    const records = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, 'utf-8'),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (!type || rec.type === type) records.push(rec);
      } catch { /* skip malformed lines */ }
    }
    return records.slice(-limit);
  }

  async _cleanOldLogs() {
    const cutoff = Date.now() - this.retentionDays * 86400000;
    const files = await fsp.readdir(this.logDir);
    for (const f of files) {
      const match = f.match(/^operations-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (match && new Date(match[1]).getTime() < cutoff) {
        await fsp.unlink(path.join(this.logDir, f)).catch(() => {});
      }
    }
  }

  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024),
      uptime: Math.round(os.uptime()),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
    };
  }

  _registerIPC() {
    ipcMain.handle('log:write', async (_, entry) => {
      await this.log(entry);
      return { ok: true };
    });

    ipcMain.handle('log:query', async (_, params) => {
      return { ok: true, data: await this.query(params || {}) };
    });

    // system:info handler is registered in main.js (more complete version)
    // Do NOT register it here to avoid duplicate handler crash
  }
}

module.exports = new OperationLogger();

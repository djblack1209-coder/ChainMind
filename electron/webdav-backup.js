// ChainMind WebDAV Backup Module
// Ported from Cherry Studio's WebDAV backup pattern
// Pure HTTP implementation — no external WebDAV library needed

const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');
const { getDb } = require('./database');

let config = null;

/**
 * @typedef {Object} WebDAVConfig
 * @property {string} url - WebDAV server URL (e.g. https://dav.example.com/remote.php/dav/files/user/)
 * @property {string} username
 * @property {string} password
 * @property {string} [backupDir] - Remote directory for backups (default: /chainmind-backups/)
 */

function request(method, remotePath, { body, headers: extraHeaders } = {}) {
  return new Promise((resolve, reject) => {
    if (!config) return reject(new Error('WebDAV not configured'));

    const base = config.url.endsWith('/') ? config.url : config.url + '/';
    const fullUrl = new URL(remotePath, base);
    const mod = fullUrl.protocol === 'https:' ? https : http;
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    const headers = {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'ChainMind/1.0',
      ...extraHeaders,
    };
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = mod.request(fullUrl, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data });
        } else {
          reject(new Error(`WebDAV ${method} ${remotePath}: ${res.statusCode} ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('WebDAV request timeout'));
    });

    if (body) req.write(body);
    req.end();
  });
}

async function ensureDir(dirPath) {
  try {
    await request('MKCOL', dirPath);
  } catch (err) {
    // 405 = already exists, that's fine
    if (!err.message.includes('405')) throw err;
  }
}

function collectBackupData() {
  const db = getDb();
  const tables = [
    'sys_users', 'sys_authorities', 'sys_menus', 'sys_authority_menus',
    'sys_apis', 'sys_casbin_rules', 'sys_dictionaries', 'sys_dictionary_details',
    'sys_params', 'sys_configs', 'sys_announcements', 'sys_versions',
    'sys_plugins', 'sys_export_templates', 'sys_api_tokens',
  ];

  const data = {};
  for (const table of tables) {
    try {
      data[table] = db.prepare(`SELECT * FROM ${table}`).all();
    } catch {
      // Table may not exist
    }
  }

  data._meta = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    tables: Object.keys(data).filter((k) => k !== '_meta'),
  };

  return data;
}

function restoreBackupData(data) {
  const db = getDb();
  const meta = data._meta;
  if (!meta || !meta.tables) throw new Error('Invalid backup format');

  db.exec('BEGIN TRANSACTION');
  try {
    for (const table of meta.tables) {
      const rows = data[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

      // Clear existing data
      db.prepare(`DELETE FROM ${table}`).run();

      // Insert rows
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        stmt.run(...cols.map((c) => row[c]));
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function initWebDAVBackup(userDataPath) {
  // Load config from file
  const configPath = path.join(userDataPath, 'webdav-config.json');
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    config = null;
  }

  // --- IPC Handlers ---

  ipcMain.handle('webdav:configure', async (_event, newConfig) => {
    config = newConfig;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  });

  ipcMain.handle('webdav:get-config', () => {
    if (!config) return null;
    return { url: config.url, username: config.username, backupDir: config.backupDir || '/chainmind-backups/' };
  });

  ipcMain.handle('webdav:test', async () => {
    try {
      await request('PROPFIND', '', { headers: { Depth: '0' } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('webdav:backup', async () => {
    try {
      const dir = config.backupDir || '/chainmind-backups/';
      await ensureDir(dir);

      const data = collectBackupData();
      const json = JSON.stringify(data);
      const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const remotePath = `${dir}${filename}`;

      await request('PUT', remotePath, {
        body: json,
        headers: { 'Content-Type': 'application/json' },
      });

      return { success: true, filename, size: json.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('webdav:list-backups', async () => {
    try {
      const dir = config.backupDir || '/chainmind-backups/';
      const res = await request('PROPFIND', dir, { headers: { Depth: '1' } });

      // Parse simple XML response for filenames
      const files = [];
      const hrefRegex = /<d:href>([^<]+)<\/d:href>/gi;
      let match;
      while ((match = hrefRegex.exec(res.data)) !== null) {
        const href = decodeURIComponent(match[1]);
        if (href.endsWith('.json')) {
          const name = href.split('/').filter(Boolean).pop();
          files.push(name);
        }
      }

      // Also try without namespace prefix
      const hrefRegex2 = /<href>([^<]+)<\/href>/gi;
      while ((match = hrefRegex2.exec(res.data)) !== null) {
        const href = decodeURIComponent(match[1]);
        if (href.endsWith('.json')) {
          const name = href.split('/').filter(Boolean).pop();
          if (!files.includes(name)) files.push(name);
        }
      }

      return { success: true, files: files.sort().reverse() };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  ipcMain.handle('webdav:restore', async (_event, filename) => {
    try {
      const dir = config.backupDir || '/chainmind-backups/';
      const res = await request('GET', `${dir}${filename}`);
      const data = JSON.parse(res.data);
      restoreBackupData(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('webdav:delete-backup', async (_event, filename) => {
    try {
      const dir = config.backupDir || '/chainmind-backups/';
      await request('DELETE', `${dir}${filename}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { initWebDAVBackup };

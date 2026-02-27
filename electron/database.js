'use strict';

const path = require('path');
const { app } = require('electron');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('better-sqlite3 not available:', e.message);
  Database = null;
}

let db = null;

function getDbPath() {
  if (process.env.CHAINMIND_TEST_DB) return process.env.CHAINMIND_TEST_DB;
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'chainmind.db');
}

function getDb() {
  if (db) return db;
  if (!Database) throw new Error('better-sqlite3 not installed');
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  initSchema();
  seedDefaults();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nick_name TEXT DEFAULT '',
      header_img TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      enable INTEGER DEFAULT 1,
      authority_id INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_authorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      authority_id INTEGER UNIQUE NOT NULL,
      authority_name TEXT NOT NULL,
      parent_id INTEGER DEFAULT 0,
      default_router TEXT DEFAULT 'dashboard',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_user_authority (
      sys_user_id INTEGER NOT NULL,
      sys_authority_authority_id INTEGER NOT NULL,
      PRIMARY KEY (sys_user_id, sys_authority_authority_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_base_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER DEFAULT 0,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      component TEXT DEFAULT '',
      sort INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      title TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      keep_alive INTEGER DEFAULT 0,
      close_tab INTEGER DEFAULT 0,
      default_menu INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_authority_menus (
      sys_authority_authority_id INTEGER NOT NULL,
      sys_base_menu_id INTEGER NOT NULL,
      PRIMARY KEY (sys_authority_authority_id, sys_base_menu_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_apis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      description TEXT DEFAULT '',
      api_group TEXT DEFAULT '',
      method TEXT DEFAULT 'POST',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS casbin_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ptype TEXT DEFAULT '',
      v0 TEXT DEFAULT '',
      v1 TEXT DEFAULT '',
      v2 TEXT DEFAULT '',
      v3 TEXT DEFAULT '',
      v4 TEXT DEFAULT '',
      v5 TEXT DEFAULT ''
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      expires_at TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_dictionaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT UNIQUE NOT NULL,
      status INTEGER DEFAULT 1,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_dictionary_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sys_dictionary_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT '',
      name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_operation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT DEFAULT '',
      method TEXT DEFAULT '',
      path TEXT DEFAULT '',
      status INTEGER DEFAULT 0,
      latency TEXT DEFAULT '',
      agent TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      body TEXT DEFAULT '',
      resp TEXT DEFAULT '',
      user_id INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 0,
      username TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      location TEXT DEFAULT '',
      os TEXT DEFAULT '',
      browser TEXT DEFAULT '',
      status INTEGER DEFAULT 1,
      message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'error',
      module TEXT DEFAULT '',
      message TEXT DEFAULT '',
      stack TEXT DEFAULT '',
      user_id INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_export_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template_id TEXT UNIQUE NOT NULL,
      template_info TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      type TEXT DEFAULT 'notice',
      level TEXT DEFAULT 'info',
      status INTEGER DEFAULT 1,
      user_id INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      changelog TEXT DEFAULT '',
      download_url TEXT DEFAULT '',
      force_update INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_plugins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      version TEXT DEFAULT '1.0.0',
      author TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      config TEXT DEFAULT '{}',
      path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sys_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT '',
      group_name TEXT DEFAULT 'system',
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // H-6: Versioned migration system — each migration runs exactly once
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const MIGRATIONS = [
    { version: 1, description: 'Add changelog/download_url/force_update to sys_versions', sql: 'ALTER TABLE sys_versions ADD COLUMN changelog TEXT DEFAULT ""' },
    { version: 2, description: 'Add download_url to sys_versions', sql: 'ALTER TABLE sys_versions ADD COLUMN download_url TEXT DEFAULT ""' },
    { version: 3, description: 'Add force_update to sys_versions', sql: 'ALTER TABLE sys_versions ADD COLUMN force_update INTEGER DEFAULT 0' },
    { version: 4, description: 'Add author to sys_plugins', sql: 'ALTER TABLE sys_plugins ADD COLUMN author TEXT DEFAULT ""' },
    { version: 5, description: 'Add deleted_at to sys_params for soft delete', sql: 'ALTER TABLE sys_params ADD COLUMN deleted_at TEXT' },
    { version: 6, description: 'Add deleted_at to sys_configs for soft delete', sql: 'ALTER TABLE sys_configs ADD COLUMN deleted_at TEXT' },
  ];

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    try {
      db.exec(m.sql);
    } catch (e) {
      // Column may already exist from pre-versioned era — that's OK
      if (!String(e.message).includes('duplicate column')) {
        console.error(`[DB] Migration v${m.version} failed:`, e.message);
        continue;
      }
    }
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)').run(m.version, m.description);
  }
}

function seedDefaults() {
  const bcrypt = require('bcryptjs');

  const tx = db.transaction(() => {
    // Seed default authorities
    const authExists = db.prepare('SELECT 1 FROM sys_authorities WHERE authority_id = 1').get();
    if (!authExists) {
      db.prepare('INSERT INTO sys_authorities (authority_id, authority_name, parent_id, default_router) VALUES (?, ?, ?, ?)')
        .run(1, '超级管理员', 0, 'dashboard');
      db.prepare('INSERT INTO sys_authorities (authority_id, authority_name, parent_id, default_router) VALUES (?, ?, ?, ?)')
        .run(2, '普通用户', 0, 'dashboard');
    }

    // Seed default admin user
    const userExists = db.prepare('SELECT id FROM sys_users WHERE username = ?').get('admin');
    if (!userExists) {
      const hash = bcrypt.hashSync('admin123', 10);
      const uuid = 'admin-' + Date.now().toString(36);
      const info = db.prepare('INSERT INTO sys_users (uuid, username, password, nick_name, authority_id, enable) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid, 'admin', hash, '超级管理员', 1, 1);
      db.prepare('INSERT INTO sys_user_authority (sys_user_id, sys_authority_authority_id) VALUES (?, ?)')
        .run(info.lastInsertRowid, 1);
    }

    // Seed default menus
    const menuExists = db.prepare('SELECT 1 FROM sys_base_menus WHERE name = ?').get('dashboard');
    if (!menuExists) {
      const menus = [
        [0, 'dashboard', 'dashboard', 'dashboard/index', 1, '仪表盘', 'odometer'],
        [0, 'workspace', 'workspace', 'workspace/index', 2, 'AI 工作台', 'chat-dot-round'],
        [0, 'admin', 'admin', 'admin/index', 10, '系统管理', 'setting'],
        [3, 'admin/user', 'user', 'admin/user/index', 1, '用户管理', 'user'],
        [3, 'admin/role', 'role', 'admin/role/index', 2, '角色管理', 'avatar'],
        [3, 'admin/menu', 'menu', 'admin/menu/index', 3, '菜单管理', 'menu'],
        [3, 'admin/api', 'api', 'admin/api/index', 4, 'API 管理', 'platform'],
        [3, 'admin/dict', 'dict', 'admin/dict/index', 5, '字典管理', 'notebook'],
        [3, 'admin/params', 'params', 'admin/params/index', 6, '参数管理', 'document'],
        [3, 'admin/config', 'config', 'admin/config/index', 7, '系统配置', 'tools'],
        [0, 'logs', 'logs', 'logs/index', 11, '日志管理', 'document-copy'],
        [11, 'logs/operation', 'operationLog', 'logs/operation/index', 1, '操作日志', 'tickets'],
        [11, 'logs/login', 'loginLog', 'logs/login/index', 2, '登录日志', 'key'],
        [11, 'logs/error', 'errorLog', 'logs/error/index', 3, '错误日志', 'warning'],
        [0, 'tools', 'tools', 'tools/index', 12, '系统工具', 'briefcase'],
        [15, 'tools/code-gen', 'codeGen', 'tools/code-gen/index', 1, '代码生成器', 'magic-stick'],
        [15, 'tools/plugin', 'pluginMarket', 'tools/plugin/index', 2, '插件市场', 'goods'],
        [15, 'tools/export', 'exportTemplate', 'tools/export/index', 3, '导出模板', 'download'],
        [15, 'tools/form', 'formCreator', 'tools/form/index', 4, '表单创建器', 'edit'],
        [15, 'tools/version', 'version', 'tools/version/index', 5, '版本管理', 'flag'],
        [15, 'tools/announcement', 'announcement', 'tools/announcement/index', 6, '公告管理', 'bell'],
        [15, 'tools/email', 'email', 'tools/email/index', 7, '邮件管理', 'message'],
        [0, 'profile', 'profile', 'profile/index', 99, '个人中心', 'user-filled'],
      ];
      const stmt = db.prepare('INSERT INTO sys_base_menus (parent_id, path, name, component, sort, title, icon) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const menuStmt = db.prepare('INSERT INTO sys_authority_menus (sys_authority_authority_id, sys_base_menu_id) VALUES (?, ?)');
      for (const m of menus) {
        const info = stmt.run(...m);
        menuStmt.run(1, info.lastInsertRowid);
      }
    }
  });

  tx();
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, close, getDbPath };

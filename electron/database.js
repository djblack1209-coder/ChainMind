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
  // ── Kept tables ──────────────────────────────────────────────────────
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

  // ── AI feature tables ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',
      fact TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      source_conversation_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL,
      embedding BLOB,
      model TEXT DEFAULT 'text-embedding-3-small',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      chunk_index INTEGER DEFAULT 0,
      chunk_text TEXT NOT NULL,
      token_count INTEGER DEFAULT 0,
      indexed_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_index_id INTEGER NOT NULL,
      embedding BLOB,
      model TEXT DEFAULT 'text-embedding-3-small',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (file_index_id) REFERENCES file_index(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      provider TEXT DEFAULT 'claude',
      model TEXT DEFAULT 'claude-sonnet-4-6',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      tools TEXT DEFAULT '[]',
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'bot',
      is_builtin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      stages TEXT NOT NULL DEFAULT '[]',
      agent_assignments TEXT DEFAULT '{}',
      execution_mode TEXT DEFAULT 'sequential',
      is_builtin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      system_prompt TEXT DEFAULT '',
      user_prompt_template TEXT DEFAULT '',
      variables TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      use_count INTEGER DEFAULT 0,
      is_builtin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      parent_message_id TEXT,
      branch_point_index INTEGER DEFAULT 0,
      title TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Versioned migration system ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const MIGRATIONS = [
    // Legacy migrations (kept for existing installs)
    { version: 1, description: 'Add changelog/download_url/force_update to sys_versions', sql: 'ALTER TABLE sys_versions ADD COLUMN changelog TEXT DEFAULT ""' },
    { version: 2, description: 'Add download_url to sys_versions', sql: 'ALTER TABLE sys_versions ADD COLUMN download_url TEXT DEFAULT ""' },
    { version: 3, description: 'Add force_update to sys_versions', sql: 'ALTER TABLE sys_versions ADD COLUMN force_update INTEGER DEFAULT 0' },
    { version: 4, description: 'Add author to sys_plugins', sql: 'ALTER TABLE sys_plugins ADD COLUMN author TEXT DEFAULT ""' },
    { version: 5, description: 'Add deleted_at to sys_params for soft delete', sql: 'ALTER TABLE sys_params ADD COLUMN deleted_at TEXT' },
    { version: 6, description: 'Add deleted_at to sys_configs for soft delete', sql: 'ALTER TABLE sys_configs ADD COLUMN deleted_at TEXT' },
    // AI feature migrations
    {
      version: 7,
      description: 'Create memories table',
      sql: `CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default',
        fact TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        importance REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TEXT,
        source_conversation_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      )`
    },
    {
      version: 8,
      description: 'Create memory_embeddings table',
      sql: `CREATE TABLE IF NOT EXISTS memory_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL,
        embedding BLOB,
        model TEXT DEFAULT 'text-embedding-3-small',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      )`
    },
    {
      version: 9,
      description: 'Create file_index table',
      sql: `CREATE TABLE IF NOT EXISTS file_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        chunk_index INTEGER DEFAULT 0,
        chunk_text TEXT NOT NULL,
        token_count INTEGER DEFAULT 0,
        indexed_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`
    },
    {
      version: 10,
      description: 'Create file_embeddings table',
      sql: `CREATE TABLE IF NOT EXISTS file_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_index_id INTEGER NOT NULL,
        embedding BLOB,
        model TEXT DEFAULT 'text-embedding-3-small',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (file_index_id) REFERENCES file_index(id) ON DELETE CASCADE
      )`
    },
    {
      version: 11,
      description: 'Create agent_configs table',
      sql: `CREATE TABLE IF NOT EXISTS agent_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT DEFAULT '',
        system_prompt TEXT DEFAULT '',
        provider TEXT DEFAULT 'claude',
        model TEXT DEFAULT 'claude-sonnet-4-6',
        temperature REAL DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 2048,
        tools TEXT DEFAULT '[]',
        color TEXT DEFAULT '#6366f1',
        icon TEXT DEFAULT 'bot',
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      )`
    },
    {
      version: 12,
      description: 'Create workflow_templates table',
      sql: `CREATE TABLE IF NOT EXISTS workflow_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        stages TEXT NOT NULL DEFAULT '[]',
        agent_assignments TEXT DEFAULT '{}',
        execution_mode TEXT DEFAULT 'sequential',
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      )`
    },
    {
      version: 13,
      description: 'Create prompt_templates table',
      sql: `CREATE TABLE IF NOT EXISTS prompt_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT DEFAULT 'general',
        system_prompt TEXT DEFAULT '',
        user_prompt_template TEXT DEFAULT '',
        variables TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        use_count INTEGER DEFAULT 0,
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      )`
    },
    {
      version: 14,
      description: 'Create conversation_branches table',
      sql: `CREATE TABLE IF NOT EXISTS conversation_branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        parent_message_id TEXT,
        branch_point_index INTEGER DEFAULT 0,
        title TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )`
    },
  ];

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    try {
      db.exec(m.sql);
    } catch (e) {
      // Column/table may already exist from pre-versioned era — that's OK
      if (!String(e.message).includes('duplicate column') && !String(e.message).includes('already exists')) {
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
    // Seed default admin user
    const userExists = db.prepare('SELECT id FROM sys_users WHERE username = ?').get('admin');
    if (!userExists) {
      const hash = bcrypt.hashSync('admin123', 10);
      const uuid = 'admin-' + Date.now().toString(36);
      db.prepare('INSERT INTO sys_users (uuid, username, password, nick_name, authority_id, enable) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid, 'admin', hash, '管理员', 0, 1);
    }

    // Seed builtin agent configs (8 workflow roles from chain-workflow)
    const agentExists = db.prepare('SELECT 1 FROM agent_configs WHERE is_builtin = 1').get();
    if (!agentExists) {
      const agents = [
        ['需求分析师', 'requirement_analyst', '分析和拆解用户需求，输出结构化需求文档', '你是一位资深需求分析师。分析用户需求，识别核心功能点、约束条件和验收标准，输出结构化需求文档。', 'claude', 'claude-sonnet-4-6', 0.3, 4096, '#3b82f6', 'clipboard-list'],
        ['系统架构师', 'system_architect', '设计系统架构和技术方案', '你是一位系统架构师。根据需求文档设计技术架构，选择合适的技术栈，定义模块划分和接口规范。', 'claude', 'claude-sonnet-4-6', 0.4, 4096, '#8b5cf6', 'sitemap'],
        ['高级开发工程师', 'senior_developer', '编写高质量的生产代码', '你是一位高级开发工程师。根据架构设计和需求编写高质量、可维护的代码，遵循最佳实践和设计模式。', 'claude', 'claude-sonnet-4-6', 0.2, 8192, '#10b981', 'code'],
        ['代码审查员', 'code_reviewer', '审查代码质量，发现潜在问题', '你是一位严格的代码审查员。审查代码的正确性、可读性、性能和安全性，提出具体的改进建议。', 'claude', 'claude-sonnet-4-6', 0.3, 4096, '#f59e0b', 'search'],
        ['测试工程师', 'test_engineer', '设计测试用例并编写测试代码', '你是一位测试工程师。根据需求和代码设计全面的测试用例，编写单元测试和集成测试，确保代码质量。', 'claude', 'claude-sonnet-4-6', 0.2, 4096, '#ef4444', 'bug'],
        ['技术文档工程师', 'doc_writer', '编写清晰的技术文档', '你是一位技术文档工程师。编写清晰、准确的API文档、使用指南和架构说明文档。', 'claude', 'claude-sonnet-4-6', 0.5, 4096, '#06b6d4', 'document'],
        ['DevOps工程师', 'devops_engineer', '处理部署、CI/CD和基础设施', '你是一位DevOps工程师。设计CI/CD流水线，编写部署脚本和配置，确保系统的可靠运行。', 'claude', 'claude-sonnet-4-6', 0.3, 4096, '#84cc16', 'server'],
        ['项目协调员', 'project_coordinator', '协调各角色工作，管理工作流进度', '你是一位项目协调员。负责协调各个AI角色的工作，跟踪任务进度，确保工作流顺利推进。', 'claude', 'claude-sonnet-4-6', 0.5, 2048, '#ec4899', 'users'],
      ];
      const stmt = db.prepare(
        `INSERT INTO agent_configs (name, role, description, system_prompt, provider, model, temperature, max_tokens, color, icon, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      );
      for (const a of agents) {
        stmt.run(...a);
      }
    }

    // Seed default workflow template
    const wfExists = db.prepare('SELECT 1 FROM workflow_templates WHERE is_builtin = 1').get();
    if (!wfExists) {
      const stages = JSON.stringify([
        { name: '需求分析', role: 'requirement_analyst', order: 1 },
        { name: '架构设计', role: 'system_architect', order: 2 },
        { name: '代码开发', role: 'senior_developer', order: 3 },
        { name: '代码审查', role: 'code_reviewer', order: 4 },
        { name: '测试验证', role: 'test_engineer', order: 5 },
        { name: '文档编写', role: 'doc_writer', order: 6 },
      ]);
      const assignments = JSON.stringify({
        requirement_analyst: 'requirement_analyst',
        system_architect: 'system_architect',
        senior_developer: 'senior_developer',
        code_reviewer: 'code_reviewer',
        test_engineer: 'test_engineer',
        doc_writer: 'doc_writer',
      });
      db.prepare(
        `INSERT INTO workflow_templates (name, description, stages, agent_assignments, execution_mode, is_builtin)
         VALUES (?, ?, ?, ?, ?, 1)`
      ).run('标准开发流程', '从需求分析到文档编写的完整软件开发工作流', stages, assignments, 'sequential');
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

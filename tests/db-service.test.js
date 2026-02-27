// Tests for electron/db-service.js — all 15 services
// Uses real SQLite (in-memory via temp file) with mock Electron

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock Electron's ipcMain before requiring modules
const handlers = new Map();
const mockIpcMain = {
  handle: (channel, fn) => handlers.set(channel, fn),
};

// Patch require for electron
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'electron') {
    return require.resolve('./mocks/electron.cjs');
  }
  return origResolve.call(this, request, parent, isMain, options);
};

// Write mock electron module
const mockDir = path.join(__dirname, 'mocks');
if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });
fs.writeFileSync(
  path.join(mockDir, 'electron.cjs'),
  `module.exports = {
  app: {
    getVersion: () => '1.0.0-test',
    getPath: (name) => name === 'userData' ? require('os').tmpdir() + '/chainmind-test-' + process.pid : '/tmp',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
  },
  BrowserWindow: class { constructor() {} static getAllWindows() { return []; } },
  ipcMain: ${JSON.stringify({})},
  dialog: {},
  shell: {},
  utilityProcess: { fork: () => ({}) },
  Notification: class { show() {} static isSupported() { return false; } },
};
// Patch ipcMain to use shared handlers
const h = new Map();
module.exports.ipcMain = { handle: (c, f) => h.set(c, f) };
module.exports.__handlers = h;
`
);

// Now require the actual modules
const electronMock = require('./mocks/electron.cjs');
const testDataPath = path.join(os.tmpdir(), `chainmind-test-${process.pid}`);

let dbService;
let database;

beforeAll(() => {
  // Ensure test data directory
  if (!fs.existsSync(testDataPath)) fs.mkdirSync(testDataPath, { recursive: true });

  // Set env so database.js uses our test path
  process.env.CHAINMIND_TEST_DB = path.join(testDataPath, 'test.db');

  // Require database — it will create tables
  database = require('../electron/database');
  dbService = require('../electron/db-service');
});

afterAll(() => {
  try { database.close(); } catch {}
  // Cleanup
  try { fs.rmSync(testDataPath, { recursive: true, force: true }); } catch {}
});

describe('database runtime settings', () => {
  it('enables busy_timeout to mitigate SQLITE_BUSY under concurrent writes', () => {
    const db = database.getDb();
    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    expect(busyTimeout).toBe(5000);
  });
});

// ============ userService ============
describe('userService', () => {
  let userId;

  it('create', () => {
    const result = dbService.userService.create({
      username: 'testuser',
      password: 'test123',
      nick_name: 'Test User',
      email: 'test@example.com',
    });
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('uuid');
    userId = result.id;
  });

  it('list', () => {
    const result = dbService.userService.list(1, 10);
    expect(result).toHaveProperty('list');
    expect(result).toHaveProperty('total');
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.list.length).toBeGreaterThanOrEqual(1);
  });

  it('getById', () => {
    const user = dbService.userService.getById(userId);
    expect(user).toBeTruthy();
    expect(user.username).toBe('testuser');
    expect(user.nick_name).toBe('Test User');
    // Should not expose password
    expect(user).not.toHaveProperty('password');
  });

  it('update', () => {
    const ok = dbService.userService.update(userId, { nick_name: 'Updated Name' });
    expect(ok).toBe(true);
    const user = dbService.userService.getById(userId);
    expect(user.nick_name).toBe('Updated Name');
  });

  it('changePassword — wrong old password', () => {
    const result = dbService.userService.changePassword(userId, 'wrong', 'new123');
    expect(result.ok).toBe(false);
  });

  it('changePassword — correct', () => {
    const result = dbService.userService.changePassword(userId, 'test123', 'new123');
    expect(result.ok).toBe(true);
  });

  it('resetPassword', () => {
    const ok = dbService.userService.resetPassword(userId, 'reset456');
    expect(ok).toBe(true);
  });

  it('list with keyword filter', () => {
    const result = dbService.userService.list(1, 10, 'testuser');
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('del (soft delete)', () => {
    const ok = dbService.userService.del(userId);
    expect(ok).toBe(true);
    const user = dbService.userService.getById(userId);
    expect(user).toBeFalsy();
  });
});

// ============ authorityService ============
describe('authorityService', () => {
  it('list', () => {
    const list = dbService.authorityService.list();
    expect(Array.isArray(list)).toBe(true);
    // Seed data should have at least admin + user roles
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('create + getById', () => {
    dbService.authorityService.create({
      authority_id: 999,
      authority_name: 'test-role',
      parent_id: 0,
    });
    const role = dbService.authorityService.getById(999);
    expect(role).toBeTruthy();
    expect(role.authority_name).toBe('test-role');
  });

  it('update', () => {
    const ok = dbService.authorityService.update(999, { authority_name: 'updated-role' });
    expect(ok).toBe(true);
  });

  it('setMenus + getMenuIds', () => {
    dbService.authorityService.setMenus(999, [1, 2, 3]);
    const ids = dbService.authorityService.getMenuIds(999);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it('setCasbinRules + getCasbinRules', () => {
    dbService.authorityService.setCasbinRules(999, [
      { path: '/api/test', method: 'GET' },
    ]);
    const rules = dbService.authorityService.getCasbinRules(999);
    expect(rules.length).toBe(1);
    expect(rules[0].path).toBe('/api/test');
  });

  it('del', () => {
    const ok = dbService.authorityService.del(999);
    expect(ok).toBe(true);
  });
});

// ============ menuService ============
describe('menuService', () => {
  let menuId;

  it('list', () => {
    const list = dbService.menuService.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it('tree', () => {
    const tree = dbService.menuService.tree();
    expect(Array.isArray(tree)).toBe(true);
  });

  it('create + getById', () => {
    const result = dbService.menuService.create({
      path: '/test',
      name: 'test-menu',
      title: 'Test Menu',
      sort: 99,
    });
    menuId = result.id;
    const menu = dbService.menuService.getById(menuId);
    expect(menu.name).toBe('test-menu');
  });

  it('update', () => {
    dbService.menuService.update(menuId, { title: 'Updated Menu' });
    const menu = dbService.menuService.getById(menuId);
    expect(menu.title).toBe('Updated Menu');
  });

  it('del', () => {
    dbService.menuService.del(menuId);
    expect(dbService.menuService.getById(menuId)).toBeFalsy();
  });
});

// ============ apiService ============
describe('apiService', () => {
  let apiId;

  it('create', () => {
    const result = dbService.apiService.create({
      path: '/api/v1/test',
      description: 'Test API',
      api_group: 'test',
      method: 'GET',
    });
    apiId = result.id;
    expect(apiId).toBeGreaterThan(0);
  });

  it('list with filters', () => {
    const result = dbService.apiService.list(1, 10, 'test', 'GET', 'test');
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('all', () => {
    const all = dbService.apiService.all();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('getGroups', () => {
    const groups = dbService.apiService.getGroups();
    expect(groups).toContain('test');
  });

  it('update + del', () => {
    dbService.apiService.update(apiId, { description: 'Updated' });
    expect(dbService.apiService.getById(apiId).description).toBe('Updated');
    dbService.apiService.del(apiId);
    expect(dbService.apiService.getById(apiId)).toBeFalsy();
  });
});

// ============ dictionaryService ============
describe('dictionaryService', () => {
  let dictId, detailId;

  it('create dict + detail', () => {
    const d = dbService.dictionaryService.create({ name: 'Status', type: 'status' });
    dictId = d.id;
    const det = dbService.dictionaryService.createDetail({
      sys_dictionary_id: dictId,
      label: 'Active',
      value: '1',
      sort: 0,
    });
    detailId = det.id;
  });

  it('list + getDetails', () => {
    const result = dbService.dictionaryService.list(1, 10);
    expect(result.total).toBeGreaterThanOrEqual(1);
    const details = dbService.dictionaryService.getDetails(dictId);
    expect(details.length).toBe(1);
    expect(details[0].label).toBe('Active');
  });

  it('updateDetail + delDetail', () => {
    dbService.dictionaryService.updateDetail(detailId, { label: 'Enabled' });
    const details = dbService.dictionaryService.getDetails(dictId);
    expect(details[0].label).toBe('Enabled');
    dbService.dictionaryService.delDetail(detailId);
    expect(dbService.dictionaryService.getDetails(dictId).length).toBe(0);
  });

  it('del dict', () => {
    dbService.dictionaryService.del(dictId);
    expect(dbService.dictionaryService.getById(dictId)).toBeFalsy();
  });
});

// ============ paramsService ============
describe('paramsService', () => {
  let paramId;

  it('create + getByKey', () => {
    const r = dbService.paramsService.create({ key: 'test_key', value: 'test_val', name: 'Test' });
    paramId = r.id;
    const p = dbService.paramsService.getByKey('test_key');
    expect(p.value).toBe('test_val');
  });

  it('list', () => {
    const result = dbService.paramsService.list(1, 10);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('update + del', () => {
    dbService.paramsService.update(paramId, { value: 'updated' });
    expect(dbService.paramsService.getByKey('test_key').value).toBe('updated');
    dbService.paramsService.del(paramId);
    expect(dbService.paramsService.getByKey('test_key')).toBeFalsy();
  });
});

// ============ configService ============
describe('configService', () => {
  it('set + getByKey', () => {
    dbService.configService.set('test.key', 'test_value', 'test', 'A test config');
    const c = dbService.configService.getByKey('test.key');
    expect(c.value).toBe('test_value');
  });

  it('list by group', () => {
    const list = dbService.configService.list('test');
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('getGroups', () => {
    const groups = dbService.configService.getGroups();
    expect(groups).toContain('test');
  });

  it('set (update existing)', () => {
    dbService.configService.set('test.key', 'updated_value', 'test');
    expect(dbService.configService.getByKey('test.key').value).toBe('updated_value');
  });

  it('del', () => {
    const c = dbService.configService.getByKey('test.key');
    dbService.configService.del(c.id);
    expect(dbService.configService.getByKey('test.key')).toBeFalsy();
  });
});

// ============ Log services ============
describe('operationLogService', () => {
  it('create + list + del', () => {
    const r = dbService.operationLogService.create({ method: 'GET', path: '/test', status: 200 });
    const list = dbService.operationLogService.list(1, 10);
    expect(list.total).toBeGreaterThanOrEqual(1);
    dbService.operationLogService.del(r.id);
  });

  it('batchDel', () => {
    const r1 = dbService.operationLogService.create({ method: 'POST', path: '/a' });
    const r2 = dbService.operationLogService.create({ method: 'POST', path: '/b' });
    dbService.operationLogService.batchDel([r1.id, r2.id]);
  });

  it('clear', () => {
    dbService.operationLogService.create({ method: 'DELETE', path: '/c' });
    dbService.operationLogService.clear();
    expect(dbService.operationLogService.list(1, 10).total).toBe(0);
  });
});

describe('loginLogService', () => {
  it('create + list + clear', () => {
    dbService.loginLogService.create({ username: 'admin', status: 1, message: 'ok' });
    const list = dbService.loginLogService.list(1, 10);
    expect(list.total).toBeGreaterThanOrEqual(1);
    dbService.loginLogService.clear();
    expect(dbService.loginLogService.list(1, 10).total).toBe(0);
  });
});

describe('errorLogService', () => {
  it('create + list + clear', () => {
    dbService.errorLogService.create({ level: 'error', module: 'test', message: 'boom' });
    const list = dbService.errorLogService.list(1, 10, 'error', 'test');
    expect(list.total).toBeGreaterThanOrEqual(1);
    dbService.errorLogService.clear();
  });
});

// ============ announcementService ============
describe('announcementService', () => {
  let annId;

  it('create + list', () => {
    const r = dbService.announcementService.create({ title: 'Test Ann', content: 'Hello' });
    annId = r.id;
    const list = dbService.announcementService.list(1, 10);
    expect(list.total).toBeGreaterThanOrEqual(1);
  });

  it('update + getById', () => {
    dbService.announcementService.update(annId, { title: 'Updated Ann' });
    expect(dbService.announcementService.getById(annId).title).toBe('Updated Ann');
  });

  it('del', () => {
    dbService.announcementService.del(annId);
    expect(dbService.announcementService.getById(annId)).toBeFalsy();
  });
});

// ============ versionService ============
describe('versionService', () => {
  let verId;

  it('create + list', () => {
    const r = dbService.versionService.create({ version: '1.0.0', changelog: 'Initial' });
    verId = r.id;
    const list = dbService.versionService.list(1, 10);
    expect(list.total).toBeGreaterThanOrEqual(1);
  });

  it('del', () => {
    dbService.versionService.del(verId);
  });
});

// ============ pluginRegistryService ============
describe('pluginRegistryService', () => {
  it('register + list + getByName', () => {
    dbService.pluginRegistryService.register({
      name: 'test-plugin',
      display_name: 'Test Plugin',
      version: '1.0.0',
    });
    const list = dbService.pluginRegistryService.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const p = dbService.pluginRegistryService.getByName('test-plugin');
    expect(p.display_name).toBe('Test Plugin');
  });

  it('toggle + updateConfig', () => {
    dbService.pluginRegistryService.toggle('test-plugin', false);
    expect(dbService.pluginRegistryService.getByName('test-plugin').enabled).toBe(0);
    dbService.pluginRegistryService.updateConfig('test-plugin', { foo: 'bar' });
    const p = dbService.pluginRegistryService.getByName('test-plugin');
    expect(JSON.parse(p.config).foo).toBe('bar');
  });

  it('del', () => {
    dbService.pluginRegistryService.del('test-plugin');
    expect(dbService.pluginRegistryService.getByName('test-plugin')).toBeFalsy();
  });
});

// ============ exportTemplateService ============
describe('exportTemplateService', () => {
  let tplId;

  it('create + list', () => {
    const r = dbService.exportTemplateService.create({
      name: 'Test Template',
      template_info: { fields: ['name', 'email'] },
    });
    tplId = r.id;
    const list = dbService.exportTemplateService.list(1, 10);
    expect(list.total).toBeGreaterThanOrEqual(1);
  });

  it('getById parses template_info', () => {
    const t = dbService.exportTemplateService.getById(tplId);
    expect(t.template_info).toEqual({ fields: ['name', 'email'] });
  });

  it('update + del', () => {
    dbService.exportTemplateService.update(tplId, { name: 'Updated' });
    expect(dbService.exportTemplateService.getById(tplId).name).toBe('Updated');
    dbService.exportTemplateService.del(tplId);
    expect(dbService.exportTemplateService.getById(tplId)).toBeFalsy();
  });
});

// ============ apiTokenService ============
describe('apiTokenService', () => {
  let tokenId, tokenStr;

  it('create', () => {
    const r = dbService.apiTokenService.create({ name: 'test-token', user_id: 1 });
    tokenId = r.id;
    tokenStr = r.token;
    expect(tokenStr).toMatch(/^cmk_/);
  });

  it('list + verify', () => {
    const list = dbService.apiTokenService.list(1);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const verified = dbService.apiTokenService.verify(tokenStr);
    expect(verified).toBeTruthy();
    expect(verified.name).toBe('test-token');
  });

  it('verify invalid token', () => {
    expect(dbService.apiTokenService.verify('invalid')).toBeNull();
  });

  it('del', () => {
    dbService.apiTokenService.del(tokenId);
    expect(dbService.apiTokenService.verify(tokenStr)).toBeNull();
  });
});

'use strict';

const { getDb } = require('./database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// H-1: Field whitelist helper — only extract expected fields from IPC data
function pick(data, allowedKeys) {
  const result = {};
  for (const k of allowedKeys) {
    if (data[k] !== undefined) result[k] = data[k];
  }
  return result;
}

// ============ userService ============
const userService = {
  list(page, pageSize, keyword) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) {
      where += ' AND (username LIKE ? OR nick_name LIKE ?)';
      params.push('%' + keyword + '%', '%' + keyword + '%');
    }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_users ' + where).get(...params).c;
    const list = db.prepare('SELECT id,uuid,username,nick_name,header_img,phone,email,enable,authority_id,created_at,updated_at FROM sys_users ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  getById(id) {
    return getDb().prepare('SELECT id,uuid,username,nick_name,header_img,phone,email,enable,authority_id,created_at,updated_at FROM sys_users WHERE id=? AND deleted_at IS NULL').get(id);
  },
  create(data) {
    const db = getDb();
    const safe = pick(data, ['username', 'password', 'nick_name', 'phone', 'email', 'enable', 'authority_id']);
    const hash = bcrypt.hashSync(safe.password || '123456', 10);
    const uuid = crypto.randomUUID();
    const info = db.prepare('INSERT INTO sys_users (uuid,username,password,nick_name,phone,email,enable,authority_id) VALUES (?,?,?,?,?,?,?,?)').run(
      uuid, safe.username, hash, safe.nick_name || '', safe.phone || '', safe.email || '', safe.enable !== undefined ? safe.enable : 1, safe.authority_id || 2
    );
    if (safe.authority_id) {
      db.prepare('INSERT OR IGNORE INTO sys_user_authority (sys_user_id,sys_authority_authority_id) VALUES (?,?)').run(info.lastInsertRowid, safe.authority_id);
    }
    return { id: info.lastInsertRowid, uuid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['nick_name','phone','email','enable','authority_id','header_img'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_users SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    if (data.authority_id) {
      db.prepare('DELETE FROM sys_user_authority WHERE sys_user_id = ?').run(id);
      db.prepare('INSERT INTO sys_user_authority (sys_user_id,sys_authority_authority_id) VALUES (?,?)').run(id, data.authority_id);
    }
    return true;
  },
  del(id) {
    getDb().prepare("UPDATE sys_users SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
  changePassword(id, oldPwd, newPwd) {
    const db = getDb();
    const user = db.prepare('SELECT password FROM sys_users WHERE id=?').get(id);
    if (!user) return { ok: false, msg: '用户不存在' };
    if (!bcrypt.compareSync(oldPwd, user.password)) return { ok: false, msg: '原密码错误' };
    db.prepare("UPDATE sys_users SET password=?,updated_at=datetime('now') WHERE id=?").run(bcrypt.hashSync(newPwd, 10), id);
    return { ok: true, msg: '修改成功' };
  },
  resetPassword(id, newPwd) {
    getDb().prepare("UPDATE sys_users SET password=?,updated_at=datetime('now') WHERE id=?").run(bcrypt.hashSync(newPwd || '123456', 10), id);
    return true;
  },
};


// ============ authorityService ============
const authorityService = {
  list() {
    return getDb().prepare('SELECT * FROM sys_authorities WHERE deleted_at IS NULL ORDER BY authority_id ASC').all();
  },
  getById(authorityId) {
    return getDb().prepare('SELECT * FROM sys_authorities WHERE authority_id=? AND deleted_at IS NULL').get(authorityId);
  },
  create(data) {
    const db = getDb();
    const safe = pick(data, ['authority_id', 'authority_name', 'parent_id', 'default_router']);
    const info = db.prepare('INSERT INTO sys_authorities (authority_id,authority_name,parent_id,default_router) VALUES (?,?,?,?)').run(
      safe.authority_id, safe.authority_name, safe.parent_id || 0, safe.default_router || 'dashboard'
    );
    return { id: info.lastInsertRowid };
  },
  update(authorityId, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['authority_name','parent_id','default_router'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(authorityId);
    db.prepare('UPDATE sys_authorities SET ' + fields.join(', ') + ' WHERE authority_id = ?').run(...params);
    return true;
  },
  del(authorityId) {
    const db = getDb();
    db.prepare("UPDATE sys_authorities SET deleted_at=datetime('now') WHERE authority_id=?").run(authorityId);
    db.prepare('DELETE FROM sys_authority_menus WHERE sys_authority_authority_id=?').run(authorityId);
    db.prepare('DELETE FROM casbin_rule WHERE v0=?').run(String(authorityId));
    return true;
  },
  getMenuIds(authorityId) {
    return getDb().prepare('SELECT sys_base_menu_id FROM sys_authority_menus WHERE sys_authority_authority_id=?').all(authorityId).map(r => r.sys_base_menu_id);
  },
  setMenus(authorityId, menuIds) {
    const db = getDb();
    db.prepare('DELETE FROM sys_authority_menus WHERE sys_authority_authority_id=?').run(authorityId);
    const stmt = db.prepare('INSERT INTO sys_authority_menus (sys_authority_authority_id,sys_base_menu_id) VALUES (?,?)');
    const tx = db.transaction((ids) => { for (const mid of ids) stmt.run(authorityId, mid); });
    tx(menuIds || []);
    return true;
  },
  getCasbinRules(authorityId) {
    return getDb().prepare("SELECT v1 as path, v2 as method FROM casbin_rule WHERE ptype='p' AND v0=?").all(String(authorityId));
  },
  setCasbinRules(authorityId, rules) {
    const db = getDb();
    db.prepare("DELETE FROM casbin_rule WHERE ptype='p' AND v0=?").run(String(authorityId));
    const stmt = db.prepare("INSERT INTO casbin_rule (ptype,v0,v1,v2) VALUES ('p',?,?,?)");
    const tx = db.transaction((rs) => { for (const r of rs) stmt.run(String(authorityId), r.path, r.method); });
    tx(rules || []);
    return true;
  },
};

// ============ menuService ============
const menuService = {
  list() {
    return getDb().prepare('SELECT * FROM sys_base_menus WHERE deleted_at IS NULL ORDER BY sort ASC, id ASC').all();
  },
  tree() {
    const all = this.list();
    const map = {};
    all.forEach(m => { m.children = []; map[m.id] = m; });
    const roots = [];
    all.forEach(m => {
      if (m.parent_id && map[m.parent_id]) map[m.parent_id].children.push(m);
      else roots.push(m);
    });
    return roots;
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM sys_base_menus WHERE id=? AND deleted_at IS NULL').get(id);
  },
  create(data) {
    const db = getDb();
    const safe = pick(data, ['parent_id', 'path', 'name', 'component', 'sort', 'hidden', 'title', 'icon', 'keep_alive', 'close_tab', 'default_menu']);
    const info = db.prepare('INSERT INTO sys_base_menus (parent_id,path,name,component,sort,hidden,title,icon,keep_alive,close_tab,default_menu) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      safe.parent_id || 0, safe.path, safe.name, safe.component || '', safe.sort || 0,
      safe.hidden || 0, safe.title || '', safe.icon || '', safe.keep_alive || 0, safe.close_tab || 0, safe.default_menu || 0
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['parent_id','path','name','component','sort','hidden','title','icon','keep_alive','close_tab','default_menu'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_base_menus SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  del(id) {
    const db = getDb();
    db.prepare("UPDATE sys_base_menus SET deleted_at=datetime('now') WHERE id=?").run(id);
    db.prepare('DELETE FROM sys_authority_menus WHERE sys_base_menu_id=?').run(id);
    return true;
  },
  getByAuthority(authorityId) {
    const db = getDb();
    const ids = db.prepare('SELECT sys_base_menu_id FROM sys_authority_menus WHERE sys_authority_authority_id=?').all(authorityId).map(r => r.sys_base_menu_id);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const menus = db.prepare('SELECT * FROM sys_base_menus WHERE id IN (' + placeholders + ') AND deleted_at IS NULL ORDER BY sort ASC').all(...ids);
    const map = {};
    menus.forEach(m => { m.children = []; map[m.id] = m; });
    const roots = [];
    menus.forEach(m => {
      if (m.parent_id && map[m.parent_id]) map[m.parent_id].children.push(m);
      else roots.push(m);
    });
    return roots;
  },
};

// ============ apiService ============
const apiService = {
  list(page, pageSize, keyword, method, apiGroup) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND (path LIKE ? OR description LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }
    if (method) { where += ' AND method = ?'; params.push(method); }
    if (apiGroup) { where += ' AND api_group = ?'; params.push(apiGroup); }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_apis ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM sys_apis ' + where + ' ORDER BY api_group ASC, id ASC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  all() {
    return getDb().prepare('SELECT * FROM sys_apis WHERE deleted_at IS NULL ORDER BY api_group ASC, id ASC').all();
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM sys_apis WHERE id=? AND deleted_at IS NULL').get(id);
  },
  create(data) {
    const safe = pick(data, ['path', 'description', 'api_group', 'method']);
    const info = getDb().prepare('INSERT INTO sys_apis (path,description,api_group,method) VALUES (?,?,?,?)').run(
      safe.path, safe.description || '', safe.api_group || '', safe.method || 'POST'
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['path','description','api_group','method'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_apis SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  del(id) {
    getDb().prepare("UPDATE sys_apis SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
  getGroups() {
    return getDb().prepare("SELECT DISTINCT api_group FROM sys_apis WHERE deleted_at IS NULL AND api_group != '' ORDER BY api_group").all().map(r => r.api_group);
  },
};


// ============ dictionaryService ============
const dictionaryService = {
  list(page, pageSize, keyword) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND (name LIKE ? OR type LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_dictionaries ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM sys_dictionaries ' + where + ' ORDER BY id ASC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM sys_dictionaries WHERE id=? AND deleted_at IS NULL').get(id);
  },
  create(data) {
    const safe = pick(data, ['name', 'type', 'status', 'description']);
    const info = getDb().prepare('INSERT INTO sys_dictionaries (name,type,status,description) VALUES (?,?,?,?)').run(
      safe.name, safe.type, safe.status !== undefined ? safe.status : 1, safe.description || ''
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['name','type','status','description'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_dictionaries SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  del(id) {
    const db = getDb();
    db.prepare("UPDATE sys_dictionaries SET deleted_at=datetime('now') WHERE id=?").run(id);
    db.prepare("UPDATE sys_dictionary_details SET deleted_at=datetime('now') WHERE sys_dictionary_id=?").run(id);
    return true;
  },
  getDetails(dictId) {
    return getDb().prepare('SELECT * FROM sys_dictionary_details WHERE sys_dictionary_id=? AND deleted_at IS NULL ORDER BY sort ASC, id ASC').all(dictId);
  },
  createDetail(data) {
    const safe = pick(data, ['sys_dictionary_id', 'label', 'value', 'sort', 'status']);
    const info = getDb().prepare('INSERT INTO sys_dictionary_details (sys_dictionary_id,label,value,sort,status) VALUES (?,?,?,?,?)').run(
      safe.sys_dictionary_id, safe.label, safe.value, safe.sort || 0, safe.status !== undefined ? safe.status : 1
    );
    return { id: info.lastInsertRowid };
  },
  updateDetail(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['label','value','sort','status'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_dictionary_details SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  delDetail(id) {
    getDb().prepare("UPDATE sys_dictionary_details SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
};

// ============ paramsService ============
const paramsService = {
  list(page, pageSize, keyword) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND (key LIKE ? OR name LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_params ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM sys_params ' + where + ' ORDER BY id ASC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  getByKey(key) {
    return getDb().prepare('SELECT * FROM sys_params WHERE key=? AND deleted_at IS NULL').get(key);
  },
  create(data) {
    const safe = pick(data, ['key', 'value', 'name', 'description']);
    const info = getDb().prepare('INSERT INTO sys_params (key,value,name,description) VALUES (?,?,?,?)').run(
      safe.key, safe.value || '', safe.name || '', safe.description || ''
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['key','value','name','description'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_params SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  del(id) {
    getDb().prepare("UPDATE sys_params SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
};

// ============ configService ============
const configService = {
  list(groupName) {
    let sql = 'SELECT * FROM sys_configs WHERE deleted_at IS NULL';
    const params = [];
    if (groupName) { sql += ' AND group_name = ?'; params.push(groupName); }
    sql += ' ORDER BY group_name ASC, id ASC';
    return getDb().prepare(sql).all(...params);
  },
  getByKey(key) {
    return getDb().prepare('SELECT * FROM sys_configs WHERE key=? AND deleted_at IS NULL').get(key);
  },
  set(key, value, groupName, description) {
    const db = getDb();
    db.prepare(`
      INSERT INTO sys_configs (key, value, group_name, description, deleted_at)
      VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        group_name = excluded.group_name,
        description = excluded.description,
        deleted_at = NULL,
        updated_at = datetime('now')
    `).run(key, value, groupName || 'system', description || '');

    const row = db.prepare('SELECT id FROM sys_configs WHERE key=?').get(key);
    return { id: row?.id };
  },
  del(id) {
    getDb().prepare("UPDATE sys_configs SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
  getGroups() {
    return getDb().prepare('SELECT DISTINCT group_name FROM sys_configs WHERE deleted_at IS NULL ORDER BY group_name').all().map(r => r.group_name);
  },
};


// ============ operationLogService ============
const operationLogService = {
  list(page, pageSize, method, path, userId) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (method) { where += ' AND method = ?'; params.push(method); }
    if (path) { where += ' AND path LIKE ?'; params.push('%'+path+'%'); }
    if (userId) { where += ' AND user_id = ?'; params.push(userId); }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_operation_records ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM sys_operation_records ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  create(data) {
    const safe = pick(data, ['ip', 'method', 'path', 'status', 'latency', 'agent', 'error_message', 'body', 'resp', 'user_id']);
    const info = getDb().prepare('INSERT INTO sys_operation_records (ip,method,path,status,latency,agent,error_message,body,resp,user_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      safe.ip || '', safe.method || '', safe.path || '', safe.status || 0,
      safe.latency || '', safe.agent || '', safe.error_message || '',
      safe.body || '', safe.resp || '', safe.user_id || 0
    );
    return { id: info.lastInsertRowid };
  },
  del(id) {
    getDb().prepare('DELETE FROM sys_operation_records WHERE id=?').run(id);
    return true;
  },
  batchDel(ids) {
    if (!ids || !ids.length) return false;
    const placeholders = ids.map(() => '?').join(',');
    getDb().prepare('DELETE FROM sys_operation_records WHERE id IN (' + placeholders + ')').run(...ids);
    return true;
  },
  clear() {
    getDb().prepare('DELETE FROM sys_operation_records').run();
    return true;
  },
};

// ============ loginLogService ============
const loginLogService = {
  list(page, pageSize, username, status) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (username) { where += ' AND username LIKE ?'; params.push('%'+username+'%'); }
    if (status !== undefined && status !== null) { where += ' AND status = ?'; params.push(status); }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_login_logs ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM sys_login_logs ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  create(data) {
    const safe = pick(data, ['user_id', 'username', 'ip', 'location', 'os', 'browser', 'status', 'message']);
    const info = getDb().prepare('INSERT INTO sys_login_logs (user_id,username,ip,location,os,browser,status,message) VALUES (?,?,?,?,?,?,?,?)').run(
      safe.user_id || 0, safe.username || '', safe.ip || '', safe.location || '',
      safe.os || '', safe.browser || '', safe.status !== undefined ? safe.status : 1, safe.message || ''
    );
    return { id: info.lastInsertRowid };
  },
  del(id) {
    getDb().prepare('DELETE FROM sys_login_logs WHERE id=?').run(id);
    return true;
  },
  clear() {
    getDb().prepare('DELETE FROM sys_login_logs').run();
    return true;
  },
};

// ============ errorLogService ============
const errorLogService = {
  list(page, pageSize, level, mod) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (level) { where += ' AND level = ?'; params.push(level); }
    if (mod) { where += ' AND module = ?'; params.push(mod); }
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_error_logs ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM sys_error_logs ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  create(data) {
    const safe = pick(data, ['level', 'module', 'message', 'stack', 'user_id']);
    const info = getDb().prepare('INSERT INTO sys_error_logs (level,module,message,stack,user_id) VALUES (?,?,?,?,?)').run(
      safe.level || 'error', safe.module || '', safe.message || '', safe.stack || '', safe.user_id || 0
    );
    return { id: info.lastInsertRowid };
  },
  del(id) {
    getDb().prepare('DELETE FROM sys_error_logs WHERE id=?').run(id);
    return true;
  },
  clear() {
    getDb().prepare('DELETE FROM sys_error_logs').run();
    return true;
  },
};

// ============ announcementService ============
const announcementService = {
  list(page, pageSize, keyword) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (keyword) { where += ' AND title LIKE ?'; params.push('%'+keyword+'%'); }
    const total = db.prepare('SELECT COUNT(*) as c FROM plugin_announcements ' + where).get(...params).c;
    const list = db.prepare('SELECT * FROM plugin_announcements ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);
    return { list, total, page, pageSize };
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM plugin_announcements WHERE id=? AND deleted_at IS NULL').get(id);
  },
  create(data) {
    const safe = pick(data, ['title', 'content', 'type', 'level', 'status', 'user_id']);
    const info = getDb().prepare('INSERT INTO plugin_announcements (title,content,type,level,status,user_id) VALUES (?,?,?,?,?,?)').run(
      safe.title, safe.content || '', safe.type || 'notice', safe.level || 'info', safe.status !== undefined ? safe.status : 1, safe.user_id || 0
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    ['title','content','type','level','status'].forEach(k => {
      if (data[k] !== undefined) { fields.push(k + ' = ?'); params.push(data[k]); }
    });
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE plugin_announcements SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  del(id) {
    getDb().prepare("UPDATE plugin_announcements SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
};

// ============ versionService ============
const versionService = {
  list(page, pageSize) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_versions').get().c;
    const list = db.prepare('SELECT * FROM sys_versions ORDER BY id DESC LIMIT ? OFFSET ?').all(pageSize, offset);
    return { list, total, page, pageSize };
  },
  create(data) {
    const safe = pick(data, ['version', 'changelog', 'download_url', 'force_update']);
    const info = getDb().prepare('INSERT INTO sys_versions (version,changelog,download_url,force_update) VALUES (?,?,?,?)').run(
      safe.version, safe.changelog || '', safe.download_url || '', safe.force_update || 0
    );
    return { id: info.lastInsertRowid };
  },
  del(id) {
    getDb().prepare('DELETE FROM sys_versions WHERE id=?').run(id);
    return true;
  },
};

// ============ pluginRegistryService ============
const pluginRegistryService = {
  list() {
    return getDb().prepare('SELECT * FROM sys_plugins ORDER BY id ASC').all();
  },
  getByName(name) {
    return getDb().prepare('SELECT * FROM sys_plugins WHERE name=?').get(name);
  },
  register(data) {
    const db = getDb();
    const safe = pick(data, ['name', 'display_name', 'description', 'version', 'author', 'enabled', 'config', 'path']);
    const existing = db.prepare('SELECT id FROM sys_plugins WHERE name=?').get(safe.name);
    if (existing) {
      db.prepare("UPDATE sys_plugins SET display_name=?,description=?,version=?,author=?,enabled=?,config=?,path=?,updated_at=datetime('now') WHERE name=?").run(
        safe.display_name || '', safe.description || '', safe.version || '1.0.0', safe.author || '',
        safe.enabled !== undefined ? safe.enabled : 1, JSON.stringify(safe.config || {}), safe.path || '', safe.name
      );
      return { id: existing.id };
    }
    const info = db.prepare('INSERT INTO sys_plugins (name,display_name,description,version,author,enabled,config,path) VALUES (?,?,?,?,?,?,?,?)').run(
      safe.name, safe.display_name || '', safe.description || '', safe.version || '1.0.0', safe.author || '',
      safe.enabled !== undefined ? safe.enabled : 1, JSON.stringify(safe.config || {}), safe.path || ''
    );
    return { id: info.lastInsertRowid };
  },
  toggle(name, enabled) {
    getDb().prepare("UPDATE sys_plugins SET enabled=?,updated_at=datetime('now') WHERE name=?").run(enabled ? 1 : 0, name);
    return true;
  },
  del(name) {
    getDb().prepare('DELETE FROM sys_plugins WHERE name=?').run(name);
    return true;
  },
  updateConfig(name, config) {
    getDb().prepare("UPDATE sys_plugins SET config=?,updated_at=datetime('now') WHERE name=?").run(JSON.stringify(config), name);
    return true;
  },
};

// ============ exportTemplateService ============
const exportTemplateService = {
  list(page, pageSize) {
    const db = getDb();
    page = page || 1; pageSize = pageSize || 10;
    const offset = (page - 1) * pageSize;
    const where = 'WHERE deleted_at IS NULL';
    const total = db.prepare('SELECT COUNT(*) as c FROM sys_export_templates ' + where).get().c;
    const list = db.prepare('SELECT * FROM sys_export_templates ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(pageSize, offset);
    list.forEach(item => { try { item.template_info = JSON.parse(item.template_info); } catch {} });
    return { list, total, page, pageSize };
  },
  getById(id) {
    const row = getDb().prepare('SELECT * FROM sys_export_templates WHERE id=? AND deleted_at IS NULL').get(id);
    if (row) { try { row.template_info = JSON.parse(row.template_info); } catch {} }
    return row;
  },
  create(data) {
    const safe = pick(data, ['name', 'template_id', 'template_info']);
    const info = getDb().prepare('INSERT INTO sys_export_templates (name,template_id,template_info) VALUES (?,?,?)').run(
      safe.name, safe.template_id || crypto.randomUUID(), JSON.stringify(safe.template_info || {})
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    const db = getDb();
    const fields = []; const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.template_info !== undefined) { fields.push('template_info = ?'); params.push(JSON.stringify(data.template_info)); }
    if (!fields.length) return false;
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare('UPDATE sys_export_templates SET ' + fields.join(', ') + ' WHERE id = ?').run(...params);
    return true;
  },
  del(id) {
    getDb().prepare("UPDATE sys_export_templates SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
};

// ============ apiTokenService ============
const apiTokenService = {
  list(userId) {
    let sql = 'SELECT id,token,name,expires_at,user_id,created_at FROM sys_api_tokens WHERE deleted_at IS NULL';
    const params = [];
    if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
    sql += ' ORDER BY id DESC';
    return getDb().prepare(sql).all(...params);
  },
  create(data) {
    const safe = pick(data, ['name', 'expires_at', 'user_id']);
    const token = 'cmk_' + crypto.randomBytes(32).toString('hex');
    const info = getDb().prepare('INSERT INTO sys_api_tokens (token,name,expires_at,user_id) VALUES (?,?,?,?)').run(
      token, safe.name || '', safe.expires_at || null, safe.user_id || 0
    );
    return { id: info.lastInsertRowid, token };
  },
  verify(token) {
    const row = getDb().prepare('SELECT * FROM sys_api_tokens WHERE token=? AND deleted_at IS NULL').get(token);
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    return row;
  },
  del(id) {
    getDb().prepare("UPDATE sys_api_tokens SET deleted_at=datetime('now') WHERE id=?").run(id);
    return true;
  },
};

// ============ exports ============
module.exports = {
  userService,
  authorityService,
  menuService,
  apiService,
  dictionaryService,
  paramsService,
  configService,
  operationLogService,
  loginLogService,
  errorLogService,
  announcementService,
  versionService,
  pluginRegistryService,
  exportTemplateService,
  apiTokenService,
};

function validateInt(v, min = 0, max = 1000000) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < min || n > max) return null;
  return n;
}

function validateStr(v, maxLen = 1000) {
  if (v == null) return '';
  const s = String(v);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function validateObj(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v;
}

function validatePage(page, pageSize) {
  return {
    page: validateInt(page, 1, 100000) || 1,
    pageSize: validateInt(pageSize, 1, 200) || 10,
  };
}

function registerDbIpcHandlers({ ipcMain, dbService }) {
  ipcMain.handle('db:user:list', (_, page, pageSize, keyword) => {
    const p = validatePage(page, pageSize);
    return dbService.userService.list(p.page, p.pageSize, validateStr(keyword, 100));
  });

  ipcMain.handle('db:user:getById', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return null;
    return dbService.userService.getById(vid);
  });

  ipcMain.handle('db:user:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false, msg: '参数无效' };
    return dbService.userService.create(d);
  });

  ipcMain.handle('db:user:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.userService.update(vid, d);
  });

  ipcMain.handle('db:user:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.userService.del(vid);
  });

  ipcMain.handle('db:user:changePassword', (_, id, oldPwd, newPwd) => {
    const vid = validateInt(id, 1);
    if (!vid) return { ok: false, msg: '参数无效' };
    return dbService.userService.changePassword(vid, validateStr(oldPwd, 200), validateStr(newPwd, 200));
  });

  ipcMain.handle('db:user:resetPassword', (_, id, newPwd) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.userService.resetPassword(vid, validateStr(newPwd, 200));
  });

  ipcMain.handle('db:authority:list', () => dbService.authorityService.list());
  ipcMain.handle('db:authority:getById', (_, authorityId) => dbService.authorityService.getById(validateInt(authorityId, 0)));
  ipcMain.handle('db:authority:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.authorityService.create(d);
  });
  ipcMain.handle('db:authority:update', (_, authorityId, data) => {
    const d = validateObj(data);
    if (!d) return false;
    return dbService.authorityService.update(validateInt(authorityId, 0), d);
  });
  ipcMain.handle('db:authority:del', (_, authorityId) => dbService.authorityService.del(validateInt(authorityId, 0)));
  ipcMain.handle('db:authority:getMenuIds', (_, authorityId) => dbService.authorityService.getMenuIds(validateInt(authorityId, 0)));
  ipcMain.handle('db:authority:setMenus', (_, authorityId, menuIds) => {
    if (!Array.isArray(menuIds)) return false;
    return dbService.authorityService.setMenus(validateInt(authorityId, 0), menuIds.map(Number).filter((n) => !isNaN(n)));
  });
  ipcMain.handle('db:authority:getCasbinRules', (_, authorityId) => dbService.authorityService.getCasbinRules(validateInt(authorityId, 0)));
  ipcMain.handle('db:authority:setCasbinRules', (_, authorityId, rules) => {
    if (!Array.isArray(rules)) return false;
    return dbService.authorityService.setCasbinRules(validateInt(authorityId, 0), rules);
  });

  ipcMain.handle('db:menu:list', () => dbService.menuService.list());
  ipcMain.handle('db:menu:tree', () => dbService.menuService.tree());
  ipcMain.handle('db:menu:getById', (_, id) => dbService.menuService.getById(validateInt(id, 1)));
  ipcMain.handle('db:menu:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.menuService.create(d);
  });
  ipcMain.handle('db:menu:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.menuService.update(vid, d);
  });
  ipcMain.handle('db:menu:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.menuService.del(vid);
  });
  ipcMain.handle('db:menu:getByAuthority', (_, authorityId) => dbService.menuService.getByAuthority(validateInt(authorityId, 0)));

  ipcMain.handle('db:api:list', (_, page, pageSize, keyword, method, apiGroup) => {
    const p = validatePage(page, pageSize);
    return dbService.apiService.list(
      p.page,
      p.pageSize,
      validateStr(keyword, 100),
      validateStr(method, 10),
      validateStr(apiGroup, 100)
    );
  });
  ipcMain.handle('db:api:all', () => dbService.apiService.all());
  ipcMain.handle('db:api:getById', (_, id) => dbService.apiService.getById(validateInt(id, 1)));
  ipcMain.handle('db:api:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.apiService.create(d);
  });
  ipcMain.handle('db:api:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.apiService.update(vid, d);
  });
  ipcMain.handle('db:api:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.apiService.del(vid);
  });
  ipcMain.handle('db:api:getGroups', () => dbService.apiService.getGroups());

  ipcMain.handle('db:dict:list', (_, page, pageSize, keyword) => {
    const p = validatePage(page, pageSize);
    return dbService.dictionaryService.list(p.page, p.pageSize, validateStr(keyword, 100));
  });
  ipcMain.handle('db:dict:getById', (_, id) => dbService.dictionaryService.getById(validateInt(id, 1)));
  ipcMain.handle('db:dict:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.dictionaryService.create(d);
  });
  ipcMain.handle('db:dict:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.dictionaryService.update(vid, d);
  });
  ipcMain.handle('db:dict:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.dictionaryService.del(vid);
  });
  ipcMain.handle('db:dict:getDetails', (_, dictId) => dbService.dictionaryService.getDetails(validateInt(dictId, 1)));
  ipcMain.handle('db:dict:createDetail', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.dictionaryService.createDetail(d);
  });
  ipcMain.handle('db:dict:updateDetail', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.dictionaryService.updateDetail(vid, d);
  });
  ipcMain.handle('db:dict:delDetail', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.dictionaryService.delDetail(vid);
  });

  ipcMain.handle('db:params:list', (_, page, pageSize, keyword) => {
    const p = validatePage(page, pageSize);
    return dbService.paramsService.list(p.page, p.pageSize, validateStr(keyword, 100));
  });
  ipcMain.handle('db:params:getByKey', (_, key) => dbService.paramsService.getByKey(validateStr(key, 200)));
  ipcMain.handle('db:params:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.paramsService.create(d);
  });
  ipcMain.handle('db:params:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.paramsService.update(vid, d);
  });
  ipcMain.handle('db:params:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.paramsService.del(vid);
  });

  ipcMain.handle('db:config:list', (_, groupName) => dbService.configService.list(validateStr(groupName, 100) || undefined));
  ipcMain.handle('db:config:getByKey', (_, key) => dbService.configService.getByKey(validateStr(key, 200)));
  ipcMain.handle('db:config:set', (_, key, value, groupName, description) => {
    const k = validateStr(key, 200);
    if (!k) return { ok: false };
    return dbService.configService.set(k, validateStr(value, 10000), validateStr(groupName, 100), validateStr(description, 500));
  });
  ipcMain.handle('db:config:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.configService.del(vid);
  });
  ipcMain.handle('db:config:getGroups', () => dbService.configService.getGroups());

  ipcMain.handle('db:opLog:list', (_, page, pageSize, method, opPath, userId) => {
    const p = validatePage(page, pageSize);
    return dbService.operationLogService.list(
      p.page,
      p.pageSize,
      validateStr(method, 10),
      validateStr(opPath, 200),
      validateInt(userId, 0) || undefined
    );
  });
  ipcMain.handle('db:opLog:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.operationLogService.create(d);
  });
  ipcMain.handle('db:opLog:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.operationLogService.del(vid);
  });
  ipcMain.handle('db:opLog:batchDel', (_, ids) => {
    if (!Array.isArray(ids) || ids.length > 1000) return false;
    return dbService.operationLogService.batchDel(ids.map(Number).filter((n) => !isNaN(n) && n > 0));
  });
  ipcMain.handle('db:opLog:clear', () => dbService.operationLogService.clear());

  ipcMain.handle('db:loginLog:list', (_, page, pageSize, username, status) => {
    const p = validatePage(page, pageSize);
    return dbService.loginLogService.list(
      p.page,
      p.pageSize,
      validateStr(username, 100),
      status != null ? validateInt(status, 0, 1) : undefined
    );
  });
  ipcMain.handle('db:loginLog:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.loginLogService.create(d);
  });
  ipcMain.handle('db:loginLog:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.loginLogService.del(vid);
  });
  ipcMain.handle('db:loginLog:clear', () => dbService.loginLogService.clear());

  ipcMain.handle('db:errorLog:list', (_, page, pageSize, level, mod) => {
    const p = validatePage(page, pageSize);
    return dbService.errorLogService.list(p.page, p.pageSize, validateStr(level, 20), validateStr(mod, 100));
  });
  ipcMain.handle('db:errorLog:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.errorLogService.create(d);
  });
  ipcMain.handle('db:errorLog:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.errorLogService.del(vid);
  });
  ipcMain.handle('db:errorLog:clear', () => dbService.errorLogService.clear());

  ipcMain.handle('db:announcement:list', (_, page, pageSize, keyword) => {
    const p = validatePage(page, pageSize);
    return dbService.announcementService.list(p.page, p.pageSize, validateStr(keyword, 100));
  });
  ipcMain.handle('db:announcement:getById', (_, id) => dbService.announcementService.getById(validateInt(id, 1)));
  ipcMain.handle('db:announcement:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.announcementService.create(d);
  });
  ipcMain.handle('db:announcement:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.announcementService.update(vid, d);
  });
  ipcMain.handle('db:announcement:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.announcementService.del(vid);
  });

  ipcMain.handle('db:version:list', (_, page, pageSize) => {
    const p = validatePage(page, pageSize);
    return dbService.versionService.list(p.page, p.pageSize);
  });
  ipcMain.handle('db:version:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.versionService.create(d);
  });
  ipcMain.handle('db:version:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.versionService.del(vid);
  });

  ipcMain.handle('db:plugin:list', () => dbService.pluginRegistryService.list());
  ipcMain.handle('db:plugin:getByName', (_, name) => dbService.pluginRegistryService.getByName(validateStr(name, 200)));
  ipcMain.handle('db:plugin:register', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.pluginRegistryService.register(d);
  });
  ipcMain.handle('db:plugin:toggle', (_, name, enabled) => dbService.pluginRegistryService.toggle(validateStr(name, 200), !!enabled));
  ipcMain.handle('db:plugin:del', (_, name) => dbService.pluginRegistryService.del(validateStr(name, 200)));
  ipcMain.handle('db:plugin:updateConfig', (_, name, config) => {
    const c = validateObj(config);
    if (!c) return false;
    return dbService.pluginRegistryService.updateConfig(validateStr(name, 200), c);
  });

  ipcMain.handle('db:export:list', (_, page, pageSize) => {
    const p = validatePage(page, pageSize);
    return dbService.exportTemplateService.list(p.page, p.pageSize);
  });
  ipcMain.handle('db:export:getById', (_, id) => dbService.exportTemplateService.getById(validateInt(id, 1)));
  ipcMain.handle('db:export:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.exportTemplateService.create(d);
  });
  ipcMain.handle('db:export:update', (_, id, data) => {
    const vid = validateInt(id, 1);
    const d = validateObj(data);
    if (!vid || !d) return false;
    return dbService.exportTemplateService.update(vid, d);
  });
  ipcMain.handle('db:export:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.exportTemplateService.del(vid);
  });

  ipcMain.handle('db:apiToken:list', (_, userId) => dbService.apiTokenService.list(validateInt(userId, 0) || undefined));
  ipcMain.handle('db:apiToken:create', (_, data) => {
    const d = validateObj(data);
    if (!d) return { ok: false };
    return dbService.apiTokenService.create(d);
  });
  ipcMain.handle('db:apiToken:verify', (_, token) => dbService.apiTokenService.verify(validateStr(token, 500)));
  ipcMain.handle('db:apiToken:del', (_, id) => {
    const vid = validateInt(id, 1);
    if (!vid) return false;
    return dbService.apiTokenService.del(vid);
  });
}

module.exports = {
  registerDbIpcHandlers,
};

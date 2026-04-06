// ChainMind Electron Preload Script
// Exposes safe APIs to renderer via contextBridge

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  getDataPath: () => ipcRenderer.invoke('app:getDataPath'),
  getExecToken: () => ipcRenderer.invoke('app:getExecToken'),
  getKeyEncryptionSecret: () => ipcRenderer.invoke('security:getKeyEncryptionSecret'),
  importOpenCodeSetup: () => ipcRenderer.invoke('setup:importOpenCode'),

  // LLM proxy (main-process network calls)
  llmChatStart: (payload) => ipcRenderer.invoke('llm:chatStart', payload),
  llmChatAbort: (requestId) => ipcRenderer.invoke('llm:chatAbort', requestId),
  llmProbeModels: (payload) => ipcRenderer.invoke('llm:probeModels', payload),
  onLLMChatChunk: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('llm:chat:chunk', listener);
    return () => {
      ipcRenderer.removeListener('llm:chat:chunk', listener);
    };
  },

  // Native dialogs
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  // Plugin system IPC (legacy module)
  loadPlugin: (pluginId) => ipcRenderer.invoke('plugin:load', pluginId),
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  unloadPlugin: (pluginId) => ipcRenderer.invoke('plugin:unload', pluginId),

  // MCP Client IPC
  mcpConnect: (config) => ipcRenderer.invoke('mcp:connect', config),
  mcpDisconnect: () => ipcRenderer.invoke('mcp:disconnect'),
  mcpCallTool: (name, args) => ipcRenderer.invoke('mcp:callTool', name, args),
  mcpListTools: () => ipcRenderer.invoke('mcp:listTools'),

  // System monitor
  getSystemInfo: () => ipcRenderer.invoke('system:info'),

  // Legacy auth (old module)
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  verifyToken: (token) => ipcRenderer.invoke('auth:verify', token),
  changePassword: (data) => ipcRenderer.invoke('auth:changePassword', data),

  // Legacy operation logs (old module)
  writeLog: (entry) => ipcRenderer.invoke('log:write', entry),
  queryLogs: (params) => ipcRenderer.invoke('log:query', params),

  // Legacy config (old module)
  getConfig: (keyPath) => ipcRenderer.invoke('config:get', keyPath),
  setConfig: (keyPath, value) => ipcRenderer.invoke('config:set', keyPath, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),
  resetConfig: () => ipcRenderer.invoke('config:reset'),

  // Storage management
  saveLocalFile: (fileName, base64Data) => ipcRenderer.invoke('storage:saveLocal', fileName, base64Data),
  listLocalFiles: (subDir) => ipcRenderer.invoke('storage:listLocal', subDir),
  deleteLocalFile: (fileName) => ipcRenderer.invoke('storage:deleteLocal', fileName),
  uploadToCloud: (params) => ipcRenderer.invoke('storage:upload', params),

  // WebDAV backup
  webdav: {
    configure: (config) => ipcRenderer.invoke('webdav:configure', config),
    getConfig: () => ipcRenderer.invoke('webdav:get-config'),
    test: () => ipcRenderer.invoke('webdav:test'),
    backup: () => ipcRenderer.invoke('webdav:backup'),
    listBackups: () => ipcRenderer.invoke('webdav:list-backups'),
    restore: (filename) => ipcRenderer.invoke('webdav:restore', filename),
    deleteBackup: (filename) => ipcRenderer.invoke('webdav:delete-backup', filename),
  },

  // File indexer
  fileIndexStart: (dirPath) => ipcRenderer.invoke('file-index:start', dirPath),
  fileIndexStop: () => ipcRenderer.invoke('file-index:stop'),
  fileIndexSearch: (query, limit) => ipcRenderer.invoke('file-index:search', query, limit),
  fileIndexStatus: () => ipcRenderer.invoke('file-index:status'),
  fileIndexReindex: () => ipcRenderer.invoke('file-index:reindex'),

  // Auto-updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    onChecking: (cb) => {
      const fn = () => cb();
      ipcRenderer.on('updater:checking', fn);
      return () => ipcRenderer.removeListener('updater:checking', fn);
    },
    onAvailable: (cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on('updater:available', fn);
      return () => ipcRenderer.removeListener('updater:available', fn);
    },
    onNotAvailable: (cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on('updater:not-available', fn);
      return () => ipcRenderer.removeListener('updater:not-available', fn);
    },
    onProgress: (cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on('updater:progress', fn);
      return () => ipcRenderer.removeListener('updater:progress', fn);
    },
    onDownloaded: (cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on('updater:downloaded', fn);
      return () => ipcRenderer.removeListener('updater:downloaded', fn);
    },
    onError: (cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on('updater:error', fn);
      return () => ipcRenderer.removeListener('updater:error', fn);
    },
  },

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // ===== Database Services (SQLite) =====

  db: {
    // --- User ---
    user: {
      list: (page, pageSize, keyword) => ipcRenderer.invoke('db:user:list', page, pageSize, keyword),
      getById: (id) => ipcRenderer.invoke('db:user:getById', id),
      create: (data) => ipcRenderer.invoke('db:user:create', data),
      update: (id, data) => ipcRenderer.invoke('db:user:update', id, data),
      del: (id) => ipcRenderer.invoke('db:user:del', id),
      changePassword: (id, oldPwd, newPwd) => ipcRenderer.invoke('db:user:changePassword', id, oldPwd, newPwd),
      resetPassword: (id, newPwd) => ipcRenderer.invoke('db:user:resetPassword', id, newPwd),
    },
    // --- Authority ---
    authority: {
      list: () => ipcRenderer.invoke('db:authority:list'),
      getById: (authorityId) => ipcRenderer.invoke('db:authority:getById', authorityId),
      create: (data) => ipcRenderer.invoke('db:authority:create', data),
      update: (authorityId, data) => ipcRenderer.invoke('db:authority:update', authorityId, data),
      del: (authorityId) => ipcRenderer.invoke('db:authority:del', authorityId),
      getMenuIds: (authorityId) => ipcRenderer.invoke('db:authority:getMenuIds', authorityId),
      setMenus: (authorityId, menuIds) => ipcRenderer.invoke('db:authority:setMenus', authorityId, menuIds),
      getCasbinRules: (authorityId) => ipcRenderer.invoke('db:authority:getCasbinRules', authorityId),
      setCasbinRules: (authorityId, rules) => ipcRenderer.invoke('db:authority:setCasbinRules', authorityId, rules),
    },
    // --- Menu ---
    menu: {
      list: () => ipcRenderer.invoke('db:menu:list'),
      tree: () => ipcRenderer.invoke('db:menu:tree'),
      getById: (id) => ipcRenderer.invoke('db:menu:getById', id),
      create: (data) => ipcRenderer.invoke('db:menu:create', data),
      update: (id, data) => ipcRenderer.invoke('db:menu:update', id, data),
      del: (id) => ipcRenderer.invoke('db:menu:del', id),
      getByAuthority: (authorityId) => ipcRenderer.invoke('db:menu:getByAuthority', authorityId),
    },
    // --- API ---
    api: {
      list: (page, pageSize, keyword, method, apiGroup) => ipcRenderer.invoke('db:api:list', page, pageSize, keyword, method, apiGroup),
      all: () => ipcRenderer.invoke('db:api:all'),
      getById: (id) => ipcRenderer.invoke('db:api:getById', id),
      create: (data) => ipcRenderer.invoke('db:api:create', data),
      update: (id, data) => ipcRenderer.invoke('db:api:update', id, data),
      del: (id) => ipcRenderer.invoke('db:api:del', id),
      getGroups: () => ipcRenderer.invoke('db:api:getGroups'),
    },
    // --- Dictionary ---
    dict: {
      list: (page, pageSize, keyword) => ipcRenderer.invoke('db:dict:list', page, pageSize, keyword),
      getById: (id) => ipcRenderer.invoke('db:dict:getById', id),
      create: (data) => ipcRenderer.invoke('db:dict:create', data),
      update: (id, data) => ipcRenderer.invoke('db:dict:update', id, data),
      del: (id) => ipcRenderer.invoke('db:dict:del', id),
      getDetails: (dictId) => ipcRenderer.invoke('db:dict:getDetails', dictId),
      createDetail: (data) => ipcRenderer.invoke('db:dict:createDetail', data),
      updateDetail: (id, data) => ipcRenderer.invoke('db:dict:updateDetail', id, data),
      delDetail: (id) => ipcRenderer.invoke('db:dict:delDetail', id),
    },
    // --- Params ---
    params: {
      list: (page, pageSize, keyword) => ipcRenderer.invoke('db:params:list', page, pageSize, keyword),
      getByKey: (key) => ipcRenderer.invoke('db:params:getByKey', key),
      create: (data) => ipcRenderer.invoke('db:params:create', data),
      update: (id, data) => ipcRenderer.invoke('db:params:update', id, data),
      del: (id) => ipcRenderer.invoke('db:params:del', id),
    },
    // --- Config ---
    config: {
      list: (groupName) => ipcRenderer.invoke('db:config:list', groupName),
      getByKey: (key) => ipcRenderer.invoke('db:config:getByKey', key),
      set: (key, value, groupName, description) => ipcRenderer.invoke('db:config:set', key, value, groupName, description),
      del: (id) => ipcRenderer.invoke('db:config:del', id),
      getGroups: () => ipcRenderer.invoke('db:config:getGroups'),
    },
    // --- Operation Log ---
    opLog: {
      list: (page, pageSize, method, path, userId) => ipcRenderer.invoke('db:opLog:list', page, pageSize, method, path, userId),
      create: (data) => ipcRenderer.invoke('db:opLog:create', data),
      del: (id) => ipcRenderer.invoke('db:opLog:del', id),
      batchDel: (ids) => ipcRenderer.invoke('db:opLog:batchDel', ids),
      clear: () => ipcRenderer.invoke('db:opLog:clear'),
    },
    // --- Login Log ---
    loginLog: {
      list: (page, pageSize, username, status) => ipcRenderer.invoke('db:loginLog:list', page, pageSize, username, status),
      create: (data) => ipcRenderer.invoke('db:loginLog:create', data),
      del: (id) => ipcRenderer.invoke('db:loginLog:del', id),
      clear: () => ipcRenderer.invoke('db:loginLog:clear'),
    },
    // --- Error Log ---
    errorLog: {
      list: (page, pageSize, level, mod) => ipcRenderer.invoke('db:errorLog:list', page, pageSize, level, mod),
      create: (data) => ipcRenderer.invoke('db:errorLog:create', data),
      del: (id) => ipcRenderer.invoke('db:errorLog:del', id),
      clear: () => ipcRenderer.invoke('db:errorLog:clear'),
    },
    // --- Announcement ---
    announcement: {
      list: (page, pageSize, keyword) => ipcRenderer.invoke('db:announcement:list', page, pageSize, keyword),
      getById: (id) => ipcRenderer.invoke('db:announcement:getById', id),
      create: (data) => ipcRenderer.invoke('db:announcement:create', data),
      update: (id, data) => ipcRenderer.invoke('db:announcement:update', id, data),
      del: (id) => ipcRenderer.invoke('db:announcement:del', id),
    },
    // --- Version ---
    version: {
      list: (page, pageSize) => ipcRenderer.invoke('db:version:list', page, pageSize),
      create: (data) => ipcRenderer.invoke('db:version:create', data),
      del: (id) => ipcRenderer.invoke('db:version:del', id),
    },
    // --- Plugin Registry ---
    plugin: {
      list: () => ipcRenderer.invoke('db:plugin:list'),
      getByName: (name) => ipcRenderer.invoke('db:plugin:getByName', name),
      register: (data) => ipcRenderer.invoke('db:plugin:register', data),
      toggle: (name, enabled) => ipcRenderer.invoke('db:plugin:toggle', name, enabled),
      del: (name) => ipcRenderer.invoke('db:plugin:del', name),
      updateConfig: (name, config) => ipcRenderer.invoke('db:plugin:updateConfig', name, config),
    },
    // --- Export Template ---
    exportTemplate: {
      list: (page, pageSize) => ipcRenderer.invoke('db:export:list', page, pageSize),
      getById: (id) => ipcRenderer.invoke('db:export:getById', id),
      create: (data) => ipcRenderer.invoke('db:export:create', data),
      update: (id, data) => ipcRenderer.invoke('db:export:update', id, data),
      del: (id) => ipcRenderer.invoke('db:export:del', id),
    },
    // --- API Token ---
    apiToken: {
      list: (userId) => ipcRenderer.invoke('db:apiToken:list', userId),
      create: (data) => ipcRenderer.invoke('db:apiToken:create', data),
      verify: (token) => ipcRenderer.invoke('db:apiToken:verify', token),
      del: (id) => ipcRenderer.invoke('db:apiToken:del', id),
    },
  },

});

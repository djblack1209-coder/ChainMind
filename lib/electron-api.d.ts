// TypeScript declarations for Electron API exposed via preload.js
// Available as window.electronAPI in renderer process

import type { ChatRequestBody, StreamChunk } from './types';

export interface PaginatedResult<T = any> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DbUserService {
  list: (page?: number, pageSize?: number, keyword?: string) => Promise<PaginatedResult>;
  getById: (id: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number; uuid: string }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
  changePassword: (id: number, oldPwd: string, newPwd: string) => Promise<{ ok: boolean; msg: string }>;
  resetPassword: (id: number, newPwd?: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<{ ok: boolean; token?: string; user?: any; secret?: string; msg?: string }>;
}

export interface DbAuthorityService {
  list: () => Promise<any[]>;
  getById: (authorityId: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (authorityId: number, data: any) => Promise<boolean>;
  del: (authorityId: number) => Promise<boolean>;
  getMenuIds: (authorityId: number) => Promise<number[]>;
  setMenus: (authorityId: number, menuIds: number[]) => Promise<boolean>;
  getCasbinRules: (authorityId: number) => Promise<{ path: string; method: string }[]>;
  setCasbinRules: (authorityId: number, rules: { path: string; method: string }[]) => Promise<boolean>;
}

export interface DbMenuService {
  list: () => Promise<any[]>;
  tree: () => Promise<any[]>;
  getById: (id: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
  getByAuthority: (authorityId: number) => Promise<any[]>;
}

export interface DbApiService {
  list: (page?: number, pageSize?: number, keyword?: string, method?: string, apiGroup?: string) => Promise<PaginatedResult>;
  all: () => Promise<any[]>;
  getById: (id: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
  getGroups: () => Promise<string[]>;
}

export interface DbDictService {
  list: (page?: number, pageSize?: number, keyword?: string) => Promise<PaginatedResult>;
  getById: (id: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
  getDetails: (dictId: number) => Promise<any[]>;
  createDetail: (data: any) => Promise<{ id: number }>;
  updateDetail: (id: number, data: any) => Promise<boolean>;
  delDetail: (id: number) => Promise<boolean>;
}

export interface DbParamsService {
  list: (page?: number, pageSize?: number, keyword?: string) => Promise<PaginatedResult>;
  getByKey: (key: string) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
}

export interface DbConfigService {
  list: (groupName?: string) => Promise<any[]>;
  getByKey: (key: string) => Promise<any>;
  set: (key: string, value: string, groupName?: string, description?: string) => Promise<{ id: number }>;
  del: (id: number) => Promise<boolean>;
  getGroups: () => Promise<string[]>;
}

export interface DbLogService {
  list: (...args: any[]) => Promise<PaginatedResult>;
  create: (data: any) => Promise<{ id: number }>;
  del: (id: number) => Promise<boolean>;
  clear: () => Promise<boolean>;
  batchDel?: (ids: number[]) => Promise<boolean>;
}

export interface DbAnnouncementService {
  list: (page?: number, pageSize?: number, keyword?: string) => Promise<PaginatedResult>;
  getById: (id: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
}

export interface DbVersionService {
  list: (page?: number, pageSize?: number) => Promise<PaginatedResult>;
  create: (data: any) => Promise<{ id: number }>;
  del: (id: number) => Promise<boolean>;
}

export interface DbPluginService {
  list: () => Promise<any[]>;
  getByName: (name: string) => Promise<any>;
  register: (data: any) => Promise<{ id: number }>;
  toggle: (name: string, enabled: boolean) => Promise<boolean>;
  del: (name: string) => Promise<boolean>;
  updateConfig: (name: string, config: any) => Promise<boolean>;
}

export interface DbExportTemplateService {
  list: (page?: number, pageSize?: number) => Promise<PaginatedResult>;
  getById: (id: number) => Promise<any>;
  create: (data: any) => Promise<{ id: number }>;
  update: (id: number, data: any) => Promise<boolean>;
  del: (id: number) => Promise<boolean>;
}

export interface DbApiTokenService {
  list: (userId?: number) => Promise<any[]>;
  create: (data: any) => Promise<{ id: number; token: string }>;
  verify: (token: string) => Promise<any>;
  del: (id: number) => Promise<boolean>;
}

export interface DbNamespace {
  user: DbUserService;
  authority: DbAuthorityService;
  menu: DbMenuService;
  api: DbApiService;
  dict: DbDictService;
  params: DbParamsService;
  config: DbConfigService;
  opLog: DbLogService;
  loginLog: DbLogService;
  errorLog: DbLogService;
  announcement: DbAnnouncementService;
  version: DbVersionService;
  plugin: DbPluginService;
  exportTemplate: DbExportTemplateService;
  apiToken: DbApiTokenService;
}

export interface UserInfo {
  id: number;
  uuid: string;
  username: string;
  nick_name: string;
  header_img: string;
  phone: string;
  email: string;
  enable: number;
  authority_id: number;
}

export interface AuthResult {
  ok: boolean;
  data?: {
    token: string;
    user: UserInfo;
  };
  error?: string;
}

export interface LLMChatStartResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

export interface LLMChatAbortResult {
  ok: boolean;
}

export interface LLMProbeModelsResult {
  ok: boolean;
  models?: string[];
  endpoint?: string;
  error?: string;
}

export interface LLMChatChunkPayload {
  requestId: string;
  chunk: StreamChunk;
}

export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getDataPath: () => Promise<string>;
  getExecToken: () => Promise<string>;
  getKeyEncryptionSecret: () => Promise<string>;

  // LLM proxy (Electron main process)
  llmChatStart: (payload: ChatRequestBody) => Promise<LLMChatStartResult>;
  llmChatAbort: (requestId: string) => Promise<LLMChatAbortResult>;
  llmProbeModels: (payload: { baseUrl: string; apiKey: string }) => Promise<LLMProbeModelsResult>;
  onLLMChatChunk: (cb: (payload: LLMChatChunkPayload) => void) => () => void;

  // Native dialogs
  openFile: (options?: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  openDirectory: (options?: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveFile: (options?: any) => Promise<{ canceled: boolean; filePath?: string }>;

  // Plugin system (legacy module)
  loadPlugin: (pluginId: string) => Promise<{ ok: boolean; data?: any; error?: string }>;
  listPlugins: () => Promise<{ ok: boolean; data: PluginInfo[] }>;
  unloadPlugin: (pluginId: string) => Promise<{ ok: boolean }>;

  // MCP Client
  mcpConnect: (config: MCPConfig) => Promise<{ ok: boolean; data?: { tools: MCPTool[] }; error?: string }>;
  mcpDisconnect: () => Promise<{ ok: boolean }>;
  mcpCallTool: (name: string, args: Record<string, any>) => Promise<{ ok: boolean; data?: any; error?: string }>;
  mcpListTools: () => Promise<{ ok: boolean; data: MCPTool[] }>;

  // Auth (SQLite-backed)
  login: (username: string, password: string) => Promise<AuthResult>;
  verifyToken: (token: string) => Promise<{ ok: boolean; data?: { userId: number; uuid: string; authorityId: number; user: UserInfo }; error?: string }>;
  changePassword: (data: { userId: number; oldPassword: string; newPassword: string }) => Promise<{ ok: boolean; error?: string }>;

  // System
  getSystemInfo: () => Promise<{ ok: boolean; data: SystemInfo }>;
  writeLog: (entry: LogEntry) => Promise<{ ok: boolean }>;
  queryLogs: (params?: { date?: string; type?: string; limit?: number }) => Promise<{ ok: boolean; data: LogEntry[] }>;

  // Config (legacy module)
  getConfig: (keyPath: string) => Promise<{ ok: boolean; data: any }>;
  setConfig: (keyPath: string, value: any) => Promise<{ ok: boolean }>;
  getAllConfig: () => Promise<{ ok: boolean; data: any }>;
  resetConfig: () => Promise<{ ok: boolean }>;

  // Storage
  saveLocalFile: (fileName: string, base64Data: string) => Promise<{ ok: boolean; path?: string; name?: string; size?: number; error?: string }>;
  listLocalFiles: (subDir?: string) => Promise<{ ok: boolean; data: Array<{ name: string; type: 'dir' | 'file'; path: string; size: number }> }>;
  deleteLocalFile: (fileName: string) => Promise<{ ok: boolean }>;
  uploadToCloud: (params: any) => Promise<{ ok: boolean; url?: string; name?: string; path?: string; size?: number; error?: string }>;

  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;

  // Database services (SQLite)
  db: DbNamespace;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  status: string;
}

export interface MCPConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: number;
  freeMemory: number;
  uptime: number;
  nodeVersion: string;
  electronVersion: string;
  appVersion: string;
  hostname: string;
  chromeVersion: string;
  dataPath: string;
}

export interface LogEntry {
  timestamp?: string;
  type: string;
  action: string;
  detail?: string;
  [key: string]: any;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ChainMind Electron Main Process
// Launches Next.js server internally, then opens BrowserWindow

const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const crypto = require('crypto');

const { getDb, close: closeDb } = require('./database');
const dbService = require('./db-service');
const secureSecret = require('./secure-secret');
const llmProxy = require('./llm-proxy');
const { createServerManager } = require('./server-manager');
const { createWindowManager } = require('./window-manager');
const { registerCoreIpcHandlers } = require('./ipc-core-handlers');
const { registerDbIpcHandlers } = require('./ipc-db-handlers');

const pluginManager = require('./plugin-manager');
const mcpClient = require('./mcp-client');
const localAuth = require('./local-auth');
const operationLogger = require('./operation-logger');
const configManager = require('./config-manager');
const storageManager = require('./storage-manager');

const isDev = !app.isPackaged;
const HOST = '127.0.0.1';
const parsedPort = Number.parseInt(process.env.CHAINMIND_PORT || '3456', 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3456;
const APP_URL = `http://${HOST}:${PORT}`;

if (!process.env.CHAINMIND_EXEC_TOKEN) {
  process.env.CHAINMIND_EXEC_TOKEN = crypto.randomBytes(32).toString('hex');
}

let isQuitting = false;

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Unhandled rejection:', reason);
});

const serverManager = createServerManager({
  isDev,
  host: HOST,
  port: PORT,
  appUrl: APP_URL,
  isQuitting: () => isQuitting,
});

const windowManager = createWindowManager({
  isDev,
  appUrl: APP_URL,
  isQuitting: () => isQuitting,
});

registerCoreIpcHandlers({
  app,
  ipcMain,
  secureSecret,
  windowManager,
  getExecToken: () => process.env.CHAINMIND_EXEC_TOKEN || '',
});

registerDbIpcHandlers({ ipcMain, dbService });

async function initGVAModules() {
  const userDataPath = app.getPath('userData');
  await secureSecret.init(userDataPath);
  llmProxy.init();
  configManager.init(userDataPath);
  await pluginManager.init(userDataPath);
  mcpClient.init();
  await localAuth.init(userDataPath);
  operationLogger.init(userDataPath);
  storageManager.init(userDataPath);
  getDb();
  console.log('[GVA] Database initialized');
  console.log('[GVA] All core modules initialized');
}

app.whenReady().then(async () => {
  try {
    await initGVAModules();
    console.log(`Starting Next.js server on ${APP_URL}...`);
    await serverManager.startNextServer();
    console.log(`Next.js ready on ${APP_URL}`);
    windowManager.createMainWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    if (!isQuitting && BrowserWindow.getAllWindows().length === 0 && Notification.isSupported()) {
      new Notification({ title: 'ChainMind 启动失败', body: err.message }).show();
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  llmProxy.shutdown();
  pluginManager.shutdown().catch(() => {});
  serverManager.killNextServer();
  try {
    closeDb();
  } catch (e) {
    console.error('[DB] close error:', e.message);
  }
});

app.on('will-quit', () => {
  setTimeout(() => {
    console.error('[FORCE] Process still alive after 5s, forcing exit');
    process.exit(0);
  }, 5000).unref();
});

app.on('activate', () => {
  if (windowManager.getMainWindow() === null && !isQuitting) {
    windowManager.createMainWindow();
  }
});

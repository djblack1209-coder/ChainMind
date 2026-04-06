const os = require('os');
const fs = require('fs');
const path = require('path');

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function pickFirstModelKey(models) {
  if (!models || typeof models !== 'object') return '';
  const keys = Object.keys(models);
  return keys.length > 0 ? keys[0] : '';
}

function importOpenCodeSetup() {
  const home = os.homedir();
  const configPath = path.join(home, '.config', 'opencode', 'opencode.json');
  const authPath = path.join(home, '.local', 'share', 'opencode', 'auth.json');

  const config = readJsonIfExists(configPath);
  const auth = readJsonIfExists(authPath);

  if (!config && !auth) {
    return {
      found: false,
      source: { configPath, authPath },
      keys: {},
      baseUrls: {},
      models: {},
      preferred: null,
    };
  }

  const providerConfig = config?.provider || {};
  const anthropicConfig = providerConfig.anthropic || {};
  const openaiConfig = providerConfig.openai || {};

  const claudeModel = pickFirstModelKey(anthropicConfig.models) || 'claude-opus-4-6';
  const openaiModel = pickFirstModelKey(openaiConfig.models) || 'chatgpt-5.4';

  const preferredRaw = typeof config?.model === 'string' ? config.model : '';
  let preferred = null;
  if (preferredRaw.includes('/')) {
    const [providerPart, modelPart] = preferredRaw.split('/');
    const mappedProvider = providerPart === 'anthropic' ? 'claude'
      : providerPart === 'google' ? 'gemini'
      : providerPart;
    if (modelPart) {
      preferred = {
        provider: mappedProvider,
        model: modelPart,
      };
    }
  }

  return {
    found: true,
    source: { configPath, authPath },
    keys: {
      claude: auth?.anthropic?.key || '',
      openai: auth?.openai?.key || '',
    },
    baseUrls: {
      claude: anthropicConfig?.options?.baseURL || '',
      openai: openaiConfig?.options?.baseURL || '',
    },
    models: {
      claude: claudeModel,
      openai: openaiModel,
    },
    preferred,
  };
}

function registerCoreIpcHandlers({ app, ipcMain, secureSecret, windowManager, getExecToken }) {
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:getDataPath', () => app.getPath('userData'));
  ipcMain.handle('app:getExecToken', () => getExecToken());

  ipcMain.handle('security:getKeyEncryptionSecret', () => {
    try {
      return secureSecret.getSecret();
    } catch {
      return '';
    }
  });

  ipcMain.handle('system:info', () => {
    return {
      ok: true,
      data: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        appVersion: app.getVersion(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        dataPath: app.getPath('userData'),
      },
    };
  });

  ipcMain.handle('window:minimize', () => {
    windowManager.minimizeWindow();
  });

  ipcMain.handle('window:maximize', () => {
    windowManager.toggleMaximizeWindow();
  });

  ipcMain.handle('window:close', () => {
    windowManager.closeWindow();
  });

  ipcMain.handle('dialog:openFile', (_, options) => {
    return windowManager.openFile(options);
  });

  ipcMain.handle('dialog:openDirectory', (_, options) => {
    return windowManager.openDirectory(options);
  });

  ipcMain.handle('dialog:saveFile', (_, options) => {
    return windowManager.saveFile(options);
  });

  ipcMain.handle('setup:importOpenCode', () => {
    try {
      return { ok: true, data: importOpenCodeSetup() };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}

module.exports = {
  registerCoreIpcHandlers,
};

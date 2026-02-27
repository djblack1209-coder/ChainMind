const { BrowserWindow, dialog, shell } = require('electron');
const path = require('path');

function createWindowManager({ isDev, appUrl, isQuitting }) {
  let mainWindow = null;
  const rendererCrashTimestamps = [];
  let crashLoopDialogShown = false;
  const RENDERER_CRASH_WINDOW_MS = 60 * 1000;
  const MAX_AUTO_RELOADS = 3;

  function recordRendererCrash() {
    const now = Date.now();
    while (rendererCrashTimestamps.length > 0 && now - rendererCrashTimestamps[0] > RENDERER_CRASH_WINDOW_MS) {
      rendererCrashTimestamps.shift();
    }
    rendererCrashTimestamps.push(now);
    return rendererCrashTimestamps.length;
  }

  function resetCrashWindow() {
    rendererCrashTimestamps.length = 0;
    crashLoopDialogShown = false;
  }

  function createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 680,
      title: 'ChainMind',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#0a0a0f',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
      show: false,
    });

    mainWindow.loadURL(`${appUrl}/login`);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[CRASH] Renderer process gone:', details.reason);
      if (details.reason !== 'clean-exit') {
        const crashCount = recordRendererCrash();

        if (crashCount > MAX_AUTO_RELOADS) {
          if (!crashLoopDialogShown && mainWindow && !mainWindow.isDestroyed()) {
            crashLoopDialogShown = true;
            dialog.showMessageBox(mainWindow, {
              type: 'error',
              title: '页面连续崩溃',
              message: 'ChainMind 页面连续崩溃，已暂停自动重载。',
              detail: '你可以手动重试加载，或先关闭应用检查最近改动。',
              buttons: ['手动重试', '关闭应用'],
              defaultId: 0,
              cancelId: 1,
            }).then(({ response }) => {
              if (!mainWindow || mainWindow.isDestroyed()) return;
              if (response === 0) {
                resetCrashWindow();
                mainWindow.loadURL(`${appUrl}/login`);
              } else {
                mainWindow.close();
              }
            }).catch(() => {});
          }
          return;
        }

        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(`${appUrl}/login`);
          }
        }, 1000);
      }
    });

    mainWindow.webContents.on('unresponsive', () => {
      console.warn('[WARN] Window unresponsive');
      if (isQuitting()) return;

      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '页面无响应',
        message: 'ChainMind 页面无响应，是否重新加载？',
        buttons: ['重新加载', '等待'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reload();
        }
      }).catch(() => {});
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http')) shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      resetCrashWindow();
      mainWindow = null;
    });

    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    return mainWindow;
  }

  function getMainWindow() {
    return mainWindow;
  }

  function minimizeWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  }

  function toggleMaximizeWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
  }

  function closeWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  }

  async function openFile(options) {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, { properties: ['openFile'], ...options });
  }

  async function openDirectory(options) {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], ...options });
  }

  async function saveFile(options) {
    if (!mainWindow) return { canceled: true, filePath: '' };
    return dialog.showSaveDialog(mainWindow, options);
  }

  return {
    createMainWindow,
    getMainWindow,
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    openFile,
    openDirectory,
    saveFile,
  };
}

module.exports = {
  createWindowManager,
};

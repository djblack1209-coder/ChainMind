// ChainMind Auto-Updater Module
// Ported from Cherry Studio's auto-update pattern (electron-updater)

const { autoUpdater } = require('electron-updater');
const { ipcMain, BrowserWindow } = require('electron');

let initialized = false;

/**
 * Initialize auto-updater with IPC communication to renderer.
 * @param {object} opts
 * @param {boolean} opts.isDev - Skip update checks in dev mode
 */
function initAutoUpdater({ isDev = false } = {}) {
  if (initialized) return;
  initialized = true;

  // Don't check for updates in dev mode
  if (isDev) {
    console.log('[AutoUpdater] Skipping in dev mode');
    return;
  }

  // Configuration
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // --- Events ---

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
    broadcast('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    broadcast('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || '',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Already up to date:', info.version);
    broadcast('updater:not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcast('updater:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    broadcast('updater:downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    broadcast('updater:error', { message: err.message });
  });

  // --- IPC Handlers ---

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('updater:get-version', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  // Check for updates on startup (delay 10s to not block launch)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[AutoUpdater] Startup check failed:', err.message);
    });
  }, 10_000);
}

/**
 * Send event to all renderer windows.
 */
function broadcast(channel, data = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

module.exports = { initAutoUpdater };

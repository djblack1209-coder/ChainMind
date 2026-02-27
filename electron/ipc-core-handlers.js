const os = require('os');

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
}

module.exports = {
  registerCoreIpcHandlers,
};

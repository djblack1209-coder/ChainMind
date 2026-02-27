module.exports = {
  app: {
    getVersion: () => '1.0.0-test',
    getPath: (name) => name === 'userData' ? require('os').tmpdir() + '/chainmind-test-' + process.pid : '/tmp',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
  },
  BrowserWindow: class { constructor() {} static getAllWindows() { return []; } },
  ipcMain: {},
  dialog: {},
  shell: {},
  utilityProcess: { fork: () => ({}) },
  Notification: class { show() {} static isSupported() { return false; } },
};
// Patch ipcMain to use shared handlers
const h = new Map();
module.exports.ipcMain = { handle: (c, f) => h.set(c, f) };
module.exports.__handlers = h;

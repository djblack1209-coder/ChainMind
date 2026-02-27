// ChainMind Local Auth — JWT-based authentication backed by SQLite
// Manages persistent JWT secret + delegates user ops to db-service

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fsp = fs.promises;

let jwtSecret = '';
let dbService = null;

async function init(userDataPath) {
  // Persistent JWT secret
  const secretPath = path.join(userDataPath, '.jwt-secret');
  try {
    jwtSecret = (await fsp.readFile(secretPath, 'utf-8')).trim();
  } catch {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    await fsp.writeFile(secretPath, jwtSecret, { encoding: 'utf-8', mode: 0o600 });
  }

  // Ensure secret file is owner-readable/writable only.
  try {
    await fsp.chmod(secretPath, 0o600);
  } catch {
    // Ignore on platforms/filesystems that don't fully support chmod semantics.
  }

  // Lazy-load db-service (avoid circular require at module level)
  dbService = require('./db-service');

  _registerIPC();
  console.log('[Auth] Initialized with SQLite backend');
}

function generateToken(user) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId: user.id, uuid: user.uuid, authorityId: user.authority_id },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

function login(username, password) {
  const bcrypt = require('bcryptjs');
  const { getDb } = require('./database');
  const db = getDb();

  const user = db.prepare('SELECT * FROM sys_users WHERE username=? AND deleted_at IS NULL').get(username);
  if (!user) return { ok: false, error: '用户不存在' };
  if (!user.enable) return { ok: false, error: '用户已禁用' };
  if (!bcrypt.compareSync(password, user.password)) return { ok: false, error: '密码错误' };

  const token = generateToken(user);

  // Record login log
  db.prepare('INSERT INTO sys_login_logs (user_id,username,status,message) VALUES (?,?,1,?)').run(user.id, username, '登录成功');

  // Return user without password
  const safeUser = Object.assign({}, user);
  delete safeUser.password;

  return { ok: true, data: { token, user: safeUser } };
}

function _registerIPC() {
  ipcMain.handle('auth:login', (_, username, password) => {
    return login(username, password);
  });

  ipcMain.handle('auth:verify', (_, token) => {
    const data = verifyToken(token);
    if (!data) return { ok: false, error: 'Token无效或已过期' };
    // Fetch fresh user info
    const user = dbService.userService.getById(data.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    return { ok: true, data: { ...data, user } };
  });

  ipcMain.handle('auth:changePassword', (_, { userId, oldPassword, newPassword }) => {
    if (!userId || !oldPassword || !newPassword) {
      return { ok: false, error: '参数不完整' };
    }
    const result = dbService.userService.changePassword(userId, oldPassword, newPassword);
    return result.ok ? { ok: true } : { ok: false, error: result.msg };
  });
}

module.exports = { init, login, verifyToken, generateToken };

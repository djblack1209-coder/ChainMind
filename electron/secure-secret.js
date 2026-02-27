// Per-device secret for renderer-side API-key encryption.
// Stored with owner-only file permissions under Electron userData.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const fsp = fs.promises;
const SECRET_FILE_NAME = '.key-encryption-secret';

let keySecret = '';
let initialized = false;

async function init(userDataPath) {
  const secretPath = path.join(userDataPath, SECRET_FILE_NAME);

  try {
    keySecret = (await fsp.readFile(secretPath, 'utf-8')).trim();
  } catch {
    keySecret = '';
  }

  if (!keySecret || keySecret.length < 32) {
    keySecret = crypto.randomBytes(32).toString('hex');
    await fsp.writeFile(secretPath, keySecret, { encoding: 'utf-8', mode: 0o600 });
  }

  try {
    await fsp.chmod(secretPath, 0o600);
  } catch {
    // Ignore on filesystems without POSIX chmod semantics.
  }

  initialized = true;
}

function getSecret() {
  if (!initialized || !keySecret) {
    throw new Error('Secure secret is not initialized');
  }
  return keySecret;
}

module.exports = {
  init,
  getSecret,
};

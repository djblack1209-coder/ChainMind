// ChainMind Storage Manager — ported from GVA's multi-backend upload system
// Supports local storage + cloud providers (Aliyun OSS, AWS S3, MinIO, Qiniu, Tencent COS)

const path = require('path');
const fs = require('fs');
const { ipcMain } = require('electron');
const crypto = require('crypto');

class StorageManager {
  constructor() {
    this.localDir = '';
  }

  init(userDataPath) {
    this.localDir = path.join(userDataPath, 'storage');
    if (!fs.existsSync(this.localDir)) {
      fs.mkdirSync(this.localDir, { recursive: true });
    }
    this._registerIPC();
  }

  // Validate that a resolved path stays within localDir (prevent path traversal)
  _safePath(fileName) {
    const baseName = path.basename(fileName);
    if (!baseName || baseName === '.' || baseName === '..') return null;
    const resolved = path.resolve(this.localDir, baseName);
    if (!resolved.startsWith(this.localDir + path.sep) && resolved !== this.localDir) return null;
    return resolved;
  }

  // Local file storage
  async saveLocal(fileName, buffer) {
    const ext = path.extname(fileName);
    const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = `${date}_${hash}${ext}`;
    const filePath = this._safePath(safeName);
    if (!filePath) return { ok: false, error: 'Invalid file name' };
    await fs.promises.writeFile(filePath, buffer);
    return { ok: true, path: filePath, name: safeName, size: buffer.length };
  }

  // List local files
  async listLocal(subDir) {
    let dir = this.localDir;
    if (subDir) {
      const sub = path.basename(subDir);
      dir = path.join(this.localDir, sub);
      if (!dir.startsWith(this.localDir)) return [];
    }
    if (!fs.existsSync(dir)) return [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (e) => {
        const entryPath = path.join(dir, e.name);
        let size = 0;
        if (e.isFile()) {
          try {
            size = (await fs.promises.stat(entryPath)).size;
          } catch {
            size = 0;
          }
        }
        return {
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          path: entryPath,
          size,
        };
      }));
      return items;
    } catch {
      return [];
    }
  }

  // Delete local file
  async deleteLocal(fileName) {
    const filePath = this._safePath(fileName);
    if (!filePath) return false;
    try {
      await fs.promises.access(filePath);
      await fs.promises.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Cloud upload stub — actual implementation requires provider SDKs
  // In production, install: @aws-sdk/client-s3, ali-oss, minio, qiniu, cos-nodejs-sdk-v5
  async uploadToCloud(provider, fileName, buffer, config) {
    switch (provider) {
      case 'aliyun':
        return this._uploadAliyun(fileName, buffer, config);
      case 'aws':
        return this._uploadAWS(fileName, buffer, config);
      case 'minio':
        return this._uploadMinIO(fileName, buffer, config);
      case 'qiniu':
        return this._uploadQiniu(fileName, buffer, config);
      case 'tencent':
        return this._uploadTencent(fileName, buffer, config);
      default:
        return this.saveLocal(fileName, buffer);
    }
  }

  async _uploadAliyun(fileName, buffer, config) {
    // Requires: npm install ali-oss
    try {
      const OSS = require('ali-oss');
      const client = new OSS({
        region: config.endpoint,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucketName,
      });
      const result = await client.put(fileName, buffer);
      return { ok: true, url: result.url, name: fileName };
    } catch (e) {
      return { ok: false, error: `Aliyun OSS: ${e.message}` };
    }
  }

  async _uploadAWS(fileName, buffer, config) {
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({
        region: config.region,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      });
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: fileName, Body: buffer }));
      const url = config.endpoint
        ? `${config.endpoint}/${config.bucket}/${fileName}`
        : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${fileName}`;
      return { ok: true, url, name: fileName };
    } catch (e) {
      return { ok: false, error: `AWS S3: ${e.message}` };
    }
  }

  async _uploadMinIO(fileName, buffer, config) {
    try {
      const Minio = require('minio');
      const client = new Minio.Client({
        endPoint: config.endpoint.replace(/https?:\/\//, ''),
        useSSL: config.useSSL || false,
        accessKey: config.accessKeyId,
        secretKey: config.secretAccessKey,
      });
      await client.putObject(config.bucket, fileName, buffer);
      const protocol = config.useSSL ? 'https' : 'http';
      return { ok: true, url: `${protocol}://${config.endpoint}/${config.bucket}/${fileName}`, name: fileName };
    } catch (e) {
      return { ok: false, error: `MinIO: ${e.message}` };
    }
  }

  async _uploadQiniu(_fileName, _buffer, _config) {
    // Stub — requires qiniu SDK
    return { ok: false, error: 'Qiniu upload not yet implemented. Install: npm install qiniu' };
  }

  async _uploadTencent(_fileName, _buffer, _config) {
    // Stub — requires cos-nodejs-sdk-v5
    return { ok: false, error: 'Tencent COS upload not yet implemented. Install: npm install cos-nodejs-sdk-v5' };
  }

  _registerIPC() {
    ipcMain.handle('storage:saveLocal', async (_, fileName, base64Data) => {
      const buffer = Buffer.from(base64Data, 'base64');
      return this.saveLocal(fileName, buffer);
    });

    ipcMain.handle('storage:listLocal', async (_, subDir) => {
      return { ok: true, data: await this.listLocal(subDir) };
    });

    ipcMain.handle('storage:deleteLocal', async (_, fileName) => {
      return { ok: await this.deleteLocal(fileName) };
    });

    ipcMain.handle('storage:upload', async (_, { provider, fileName, base64Data, config }) => {
      const buffer = Buffer.from(base64Data, 'base64');
      return this.uploadToCloud(provider, fileName, buffer, config);
    });
  }
}

module.exports = new StorageManager();

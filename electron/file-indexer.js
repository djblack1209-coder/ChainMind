// Local file indexer for codebase context
// Watches a directory, chunks files, generates embeddings, stores in vector index
// Inspired by GPT-Runner's local file context pattern
// NOTE: requires `chokidar` — run `npm install chokidar` to add the dependency

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcMain } = require('electron');

// ─── Config ─────────────────────────────────────────────

const INCLUDED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.md', '.json', '.yaml', '.yml', '.toml', '.css', '.html', '.sql', '.sh',
]);
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.css', '.html', '.sql', '.sh',
]);
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.turbo', '.cache', 'coverage',
]);
const EXCLUDED_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const MAX_FILE_SIZE = 500 * 1024;
const CHUNK_CHARS = 2000; // ~500 tokens
const OVERLAP_LINES = 3;

// ─── State ──────────────────────────────────────────────

let watcher = null;
let fileHashes = new Map();
let chunkIndex = [];
let status = { watching: false, directory: null, filesIndexed: 0, totalChunks: 0, lastIndexedAt: null };

// ─── Helpers ────────────────────────────────────────────

const hashContent = (c) => crypto.createHash('md5').update(c).digest('hex');

function shouldIndex(filePath) {
  const base = path.basename(filePath);
  if (EXCLUDED_FILES.has(base) || base.endsWith('.min.js') || base.endsWith('.map')) return false;
  if (filePath.split(path.sep).some((p) => EXCLUDED_DIRS.has(p))) return false;
  return INCLUDED_EXTS.has(path.extname(filePath).toLowerCase());
}

// ─── Unified line-based chunker ─────────────────────────

const CODE_BOUNDARY = /^(?:(?:export\s+)?(?:function|class|const|let|var|interface|type|enum|def|func|fn|pub\s+fn|impl|struct)\s|\/\/\s*───|# ───)/;
const MD_HEADING = /^#{1,4}\s/;

function chunkByLines(content, isBoundary) {
  const lines = content.split('\n');
  const chunks = [];
  let buf = [], bufLen = 0, startLine = 1;

  const flush = (i) => {
    if (!buf.length) return;
    chunks.push({ chunk: buf.join('\n'), lineStart: startLine, lineEnd: startLine + buf.length - 1 });
    const overlap = buf.slice(-OVERLAP_LINES);
    buf = isBoundary ? [] : [...overlap];
    bufLen = buf.join('\n').length;
    startLine = isBoundary ? i + 2 : i + 2 - overlap.length;
  };

  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i]) && buf.length > 0 && bufLen > CHUNK_CHARS / 2) flush(i);
    buf.push(lines[i]);
    bufLen += lines[i].length + 1;
    if (bufLen >= CHUNK_CHARS) flush(i);
  }
  if (buf.length) {
    chunks.push({ chunk: buf.join('\n'), lineStart: startLine, lineEnd: startLine + buf.length - 1 });
  }
  return chunks;
}

function chunkFile(content, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md') return chunkByLines(content, (l) => MD_HEADING.test(l));
  if (CODE_EXTS.has(ext)) return chunkByLines(content, (l) => CODE_BOUNDARY.test(l.trim()));
  // Generic: chunk by size only, no boundary detection
  return chunkByLines(content, () => false);
}

// ─── Indexing ───────────────────────────────────────────

function indexFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE || stat.size === 0) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = hashContent(content);
    if (fileHashes.get(filePath) === hash) return;

    removeFileChunks(filePath);
    for (const c of chunkFile(content, filePath)) {
      chunkIndex.push({ id: `${filePath}:${c.lineStart}-${c.lineEnd}`, filePath, ...c });
    }
    fileHashes.set(filePath, hash);
    syncStatus();
  } catch (err) {
    console.error(`[FileIndexer] Error indexing ${filePath}:`, err.message);
  }
}

function removeFileChunks(filePath) {
  chunkIndex = chunkIndex.filter((c) => c.filePath !== filePath);
  fileHashes.delete(filePath);
  syncStatus();
}

function syncStatus() {
  status.filesIndexed = fileHashes.size;
  status.totalChunks = chunkIndex.length;
  status.lastIndexedAt = Date.now();
}

// ─── Search ─────────────────────────────────────────────

function searchIndex(query, limit = 10) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const scored = [];
  for (const entry of chunkIndex) {
    const lower = entry.chunk.toLowerCase();
    const lowerPath = entry.filePath.toLowerCase();
    let score = 0;

    for (const t of terms) {
      const idx = lower.indexOf(t);
      if (idx === -1) continue;
      score += 1;
      // Exact word boundary bonus
      const before = idx > 0 ? lower[idx - 1] : ' ';
      const after = idx + t.length < lower.length ? lower[idx + t.length] : ' ';
      if (/\W/.test(before) && /\W/.test(after)) score += 0.5;
      // Frequency bonus (capped)
      score += Math.min((lower.split(t).length - 2), 3) * 0.2;
      // Filename match bonus
      if (lowerPath.includes(t)) score += 0.5;
    }
    if (score >= terms.length) score += 1; // all-terms-present bonus
    if (score > 0) scored.push({ ...entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ filePath, chunk, lineStart, lineEnd, score }) => ({
    filePath, chunk, lineStart, lineEnd, score: Math.round(score * 100) / 100,
  }));
}

// ─── Watcher lifecycle ──────────────────────────────────

function startWatching(dirPath) {
  stopWatching();
  const dir = path.resolve(dirPath);
  if (!fs.existsSync(dir)) throw new Error(`Directory does not exist: ${dir}`);

  fileHashes = new Map();
  chunkIndex = [];
  status = { watching: true, directory: dir, filesIndexed: 0, totalChunks: 0, lastIndexedAt: null };

  watcher = chokidar.watch(dir, {
    ignored: (p) => path.relative(dir, p).split(path.sep).some((s) => EXCLUDED_DIRS.has(s)),
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });
  watcher
    .on('add', (fp) => shouldIndex(fp) && indexFile(fp))
    .on('change', (fp) => shouldIndex(fp) && indexFile(fp))
    .on('unlink', (fp) => removeFileChunks(fp));

  console.log(`[FileIndexer] Watching ${dir}`);
}

function stopWatching() {
  if (watcher) { watcher.close(); watcher = null; }
  status.watching = false;
}

// ─── IPC registration ───────────────────────────────────

function registerFileIndexerIpc() {
  const wrap = (fn) => {
    try { fn(); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  };

  ipcMain.handle('file-index:start', (_, dirPath) => wrap(() => startWatching(dirPath)));
  ipcMain.handle('file-index:stop', () => { stopWatching(); return { ok: true }; });
  ipcMain.handle('file-index:search', (_, query, limit) => {
    try { return { ok: true, data: searchIndex(query, limit) }; }
    catch (err) { return { ok: false, error: err.message, data: [] }; }
  });
  ipcMain.handle('file-index:status', () => ({ ok: true, data: { ...status } }));
  ipcMain.handle('file-index:reindex', () => {
    if (!status.directory) return { ok: false, error: 'No directory being watched' };
    return wrap(() => startWatching(status.directory));
  });
}

module.exports = { registerFileIndexerIpc, stopWatching };

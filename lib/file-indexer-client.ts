// Client-side API for file indexer (calls Electron IPC)
// Use in renderer process — requires preload bridge

export interface FileSearchResult {
  filePath: string;
  chunk: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

export interface IndexStatus {
  watching: boolean;
  directory: string | null;
  filesIndexed: number;
  totalChunks: number;
  lastIndexedAt: number | null;
}

type IpcResult<T = unknown> = { ok: boolean; data?: T; error?: string };

function getAPI() {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('File indexer requires Electron environment');
  }
  return window.electronAPI;
}

export async function startIndexing(dirPath: string): Promise<void> {
  const api = getAPI();
  const res: IpcResult = await (api as any).fileIndexStart(dirPath);
  if (!res.ok) throw new Error(res.error ?? 'Failed to start indexing');
}

export async function stopIndexing(): Promise<void> {
  const api = getAPI();
  await (api as any).fileIndexStop();
}

export async function searchFiles(
  query: string,
  limit = 10,
): Promise<FileSearchResult[]> {
  const api = getAPI();
  const res: IpcResult<FileSearchResult[]> = await (api as any).fileIndexSearch(query, limit);
  if (!res.ok) return [];
  return res.data ?? [];
}

export async function getIndexStatus(): Promise<IndexStatus> {
  const api = getAPI();
  const res: IpcResult<IndexStatus> = await (api as any).fileIndexStatus();
  return res.data ?? {
    watching: false,
    directory: null,
    filesIndexed: 0,
    totalChunks: 0,
    lastIndexedAt: null,
  };
}

export async function forceReindex(): Promise<void> {
  const api = getAPI();
  const res: IpcResult = await (api as any).fileIndexReindex();
  if (!res.ok) throw new Error(res.error ?? 'Failed to reindex');
}

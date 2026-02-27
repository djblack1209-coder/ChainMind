// Token management with Web Worker offloading for UI responsiveness
// Uses simple character-based estimation when worker is unavailable

let worker: Worker | null = null;
let workerReady = false;
let requestId = 0;
const pendingRequests = new Map<number, (count: number) => void>();

export function initTokenWorker(): void {
  if (typeof window === 'undefined') return;
  try {
    worker = new Worker('/workers/tokenizer.worker.js');
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'ready') {
        workerReady = true;
      } else if (e.data.type === 'result' && e.data.id != null) {
        const resolve = pendingRequests.get(e.data.id);
        if (resolve) {
          pendingRequests.delete(e.data.id);
          resolve(e.data.count);
        }
      }
    };
    worker.onerror = () => {
      workerReady = false;
      worker = null;
      // Resolve all pending with fallback
      for (const [id, resolve] of pendingRequests) {
        resolve(0);
        pendingRequests.delete(id);
      }
    };
  } catch {
    worker = null;
  }
}

// Estimate token count — offload to worker if available, else heuristic
export function countTokens(text: string): Promise<number> {
  if (worker && workerReady) {
    return new Promise((resolve) => {
      const id = ++requestId;
      pendingRequests.set(id, resolve);
      worker!.postMessage({ type: 'count', text, id });
      // Timeout fallback
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          resolve(estimateTokens(text));
        }
      }, 1000);
    });
  }
  return Promise.resolve(estimateTokens(text));
}

// Heuristic: ~4 chars per token for English, ~2 chars per token for CJK
function estimateTokens(text: string): number {
  let count = 0;
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    if (code >= 0x4e00 && code <= 0x9fff) {
      count += 0.5;
    } else {
      count += 0.25;
    }
  }
  return Math.ceil(count);
}

export interface TokenBudget {
  used: number;
  limit: number;
  percentage: number;
  level: 'ok' | 'warning' | 'critical';
}

export function checkTokenBudget(used: number, maxTokens: number): TokenBudget {
  const percentage = maxTokens > 0 ? (used / maxTokens) * 100 : 0;
  let level: TokenBudget['level'] = 'ok';
  if (percentage >= 80) level = 'critical';
  else if (percentage >= 50) level = 'warning';
  return { used, limit: maxTokens, percentage, level };
}

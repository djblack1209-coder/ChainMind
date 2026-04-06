// ChatControllerPool — per-message AbortController management (inspired by NextChat)
// Enables independent stop/retry for each streaming message.

type PoolKey = string; // format: "sessionId:messageId"

function makeKey(sessionId: string, messageId: string): PoolKey {
  return `${sessionId}:${messageId}`;
}

class ChatControllerPool {
  private controllers = new Map<PoolKey, AbortController>();

  /** Create and register a new AbortController for a session+message pair */
  create(sessionId: string, messageId: string): AbortController {
    const key = makeKey(sessionId, messageId);
    // Abort any existing controller for this key
    this.abort(sessionId, messageId);
    const controller = new AbortController();
    this.controllers.set(key, controller);
    return controller;
  }

  /** Abort a specific message's stream */
  abort(sessionId: string, messageId: string): void {
    const key = makeKey(sessionId, messageId);
    const ctrl = this.controllers.get(key);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(key);
    }
  }

  /** Abort all streams for a session */
  abortSession(sessionId: string): void {
    for (const [key, ctrl] of this.controllers) {
      if (key.startsWith(sessionId + ':')) {
        ctrl.abort();
        this.controllers.delete(key);
      }
    }
  }

  /** Abort all active streams */
  abortAll(): void {
    for (const ctrl of this.controllers.values()) {
      ctrl.abort();
    }
    this.controllers.clear();
  }

  /** Remove a controller after stream completes (without aborting) */
  remove(sessionId: string, messageId: string): void {
    this.controllers.delete(makeKey(sessionId, messageId));
  }

  /** Check if a specific message is currently streaming */
  isStreaming(sessionId: string, messageId: string): boolean {
    return this.controllers.has(makeKey(sessionId, messageId));
  }

  /** Check if any message in a session is streaming */
  isSessionStreaming(sessionId: string): boolean {
    for (const key of this.controllers.keys()) {
      if (key.startsWith(sessionId + ':')) return true;
    }
    return false;
  }

  /** Get count of active streams */
  get size(): number {
    return this.controllers.size;
  }
}

export const chatControllerPool = new ChatControllerPool();

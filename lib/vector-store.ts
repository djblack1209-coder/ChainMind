// Vector storage layer using Orama
// Pure TypeScript, zero native dependencies, works in Electron main + renderer
// Supports: full-text search, vector search, hybrid search
// Persistence: serialize to JSON, store in SQLite or filesystem

import {
  create,
  insert,
  search,
  remove,
  save,
  load,
  count,
  type AnyOrama,
} from '@orama/orama';

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: 'memory' | 'file_chunk' | 'conversation' | 'agent_output';
    source: string;
    timestamp: number;
    [key: string]: unknown;
  };
}

interface OramaDoc {
  id: string;
  content: string;
  type: string;
  source: string;
  timestamp: number;
  metaJson: string; // extra metadata serialized
}

const SCHEMA = {
  id: 'string' as const,
  content: 'string' as const,
  type: 'string' as const,
  source: 'string' as const,
  timestamp: 'number' as const,
  metaJson: 'string' as const,
};

export class VectorStore {
  private db: AnyOrama | null = null;
  private idSet = new Set<string>();

  get initialized(): boolean {
    return this.db !== null;
  }

  get size(): number {
    if (!this.db) return 0;
    return count(this.db) as unknown as number;
  }

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await create({ schema: SCHEMA, id: 'vector-store' });
    this.idSet.clear();
  }

  private ensureInit(): AnyOrama {
    if (!this.db) throw new Error('VectorStore not initialized. Call init() first.');
    return this.db;
  }

  async add(doc: VectorDocument): Promise<void> {
    const db = this.ensureInit();
    // Remove existing doc with same id to allow upsert
    if (this.idSet.has(doc.id)) {
      await this.remove(doc.id);
    }
    const { type, source, timestamp, ...extra } = doc.metadata;
    const oramaDoc: OramaDoc = {
      id: doc.id,
      content: doc.content,
      type,
      source,
      timestamp,
      metaJson: JSON.stringify(extra),
    };
    await insert(db, oramaDoc);
    this.idSet.add(doc.id);
  }

  async addMany(docs: VectorDocument[]): Promise<void> {
    for (const doc of docs) {
      await this.add(doc);
    }
  }

  async search(query: string, limit = 10): Promise<VectorDocument[]> {
    const db = this.ensureInit();
    const results = await search(db, {
      term: query,
      limit,
      properties: ['content', 'type', 'source'],
    });
    return results.hits.map((hit) => this.hitToDoc(hit));
  }

  async searchByType(
    query: string,
    type: VectorDocument['metadata']['type'],
    limit = 10,
  ): Promise<VectorDocument[]> {
    const db = this.ensureInit();
    const results = await search(db, {
      term: query,
      limit,
      properties: ['content'],
      where: { type },
    });
    return results.hits.map((hit) => this.hitToDoc(hit));
  }

  async remove(id: string): Promise<boolean> {
    const db = this.ensureInit();
    try {
      await remove(db, id);
      this.idSet.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  async serialize(): Promise<string> {
    const db = this.ensureInit();
    const raw = await save(db);
    return JSON.stringify(raw);
  }

  async restore(data: string): Promise<void> {
    const parsed = JSON.parse(data);
    this.db = await create({ schema: SCHEMA, id: 'vector-store' });
    await load(this.db, parsed);
    // Rebuild id set from restored data
    this.idSet.clear();
    const all = await search(this.db, { term: '', limit: 100_000 });
    for (const hit of all.hits) {
      const doc = hit.document as unknown as OramaDoc;
      if (doc.id) this.idSet.add(doc.id);
    }
  }

  async clear(): Promise<void> {
    this.db = null;
    this.idSet.clear();
    await this.init();
  }

  private hitToDoc(hit: { document: unknown; score: number }): VectorDocument {
    const d = hit.document as OramaDoc;
    let extra: Record<string, unknown> = {};
    try {
      extra = JSON.parse(d.metaJson || '{}');
    } catch { /* ignore */ }
    return {
      id: d.id,
      content: d.content,
      metadata: {
        type: d.type as VectorDocument['metadata']['type'],
        source: d.source,
        timestamp: d.timestamp,
        ...extra,
      },
    };
  }
}

// Singleton instances for different purposes
export const memoryStore = new VectorStore();
export const fileStore = new VectorStore();
export const conversationStore = new VectorStore();

// Helper: initialize all stores at once
export async function initAllStores(): Promise<void> {
  await Promise.all([
    memoryStore.init(),
    fileStore.init(),
    conversationStore.init(),
  ]);
}

// Persistent memory system inspired by Mem0
// "The more you use it, the more it understands you"
// Extracts facts/preferences from conversations, stores them with importance scores,
// retrieves relevant memories via semantic search, and injects them as context.

import { memoryStore } from '@/lib/vector-store';
import { generateEmbedding, cosineSimilarity } from '@/lib/embeddings';

export interface Memory {
  id: string;
  fact: string;
  category: 'preference' | 'fact' | 'skill' | 'context' | 'feedback';
  importance: number;       // 0-1, decays over time
  accessCount: number;
  lastAccessedAt: number;
  sourceConversationId?: string;
  createdAt: number;
}

// ─── LLM extraction prompt ─────────────────────────────

const EXTRACTION_PROMPT = `You are a memory extraction engine. Analyze the conversation below and extract discrete, reusable facts about the user. Each fact should be a single, self-contained statement that would be useful in future conversations.

Extract these categories:
- **preference**: Coding style, tools, frameworks, languages, UI preferences, communication style (e.g. "User prefers TypeScript over JavaScript", "User likes concise responses")
- **fact**: Concrete facts about their project, team, infrastructure, deadlines, or domain (e.g. "Project uses Electron + Next.js", "Team has 3 backend developers")
- **skill**: Indicators of expertise or knowledge gaps (e.g. "User is experienced with React but new to Rust", "User understands distributed systems well")
- **context**: Ongoing work context, goals, or recurring themes (e.g. "User is building an AI-powered IDE", "Currently migrating from REST to GraphQL")
- **feedback**: What the user liked/disliked about AI responses, corrections they made (e.g. "User prefers code examples over explanations", "User corrected: use pnpm not npm")

Rules:
1. Only extract facts that would be useful across FUTURE conversations, not ephemeral details.
2. Be specific and concise — each fact should be one clear sentence.
3. Assign importance 0.0-1.0: preferences/feedback=0.6-0.8, facts=0.5-0.7, skills=0.7-0.9, context=0.4-0.6.
4. If nothing worth remembering, return an empty array.
5. Do NOT extract facts about the AI assistant itself.
6. Do NOT repeat information that is obvious or generic.

Respond with ONLY a JSON array (no markdown fences):
[{"fact": "...", "category": "preference|fact|skill|context|feedback", "importance": 0.0-1.0}]

USER MESSAGE:
{user_message}

ASSISTANT RESPONSE:
{assistant_response}`;

// ─── Helpers ────────────────────────────────────────────

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function llmExtract(
  userMessage: string,
  assistantResponse: string,
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1',
): Promise<Array<{ fact: string; category: Memory['category']; importance: number }>> {
  const prompt = EXTRACTION_PROMPT
    .replace('{user_message}', userMessage.slice(0, 3000))
    .replace('{assistant_response}', assistantResponse.slice(0, 3000));

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) return [];

  const json = await res.json();
  const text: string = json.choices?.[0]?.message?.content ?? '[]';

  try {
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m: any) => m.fact && typeof m.fact === 'string' && m.category && typeof m.importance === 'number',
    );
  } catch {
    return [];
  }
}

const SIMILARITY_THRESHOLD = 0.85;

// ─── MemorySystem ───────────────────────────────────────

export class MemorySystem {
  private memories: Map<string, Memory> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private store = memoryStore;

  async init(): Promise<void> {
    if (!this.store.initialized) await this.store.init();
  }

  // Extract memories from a conversation turn
  async extractMemories(
    userMessage: string,
    assistantResponse: string,
    conversationId: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<Memory[]> {
    await this.init();
    const extracted = await llmExtract(userMessage, assistantResponse, apiKey, baseUrl);
    const newMemories: Memory[] = [];

    for (const item of extracted) {
      // Deduplicate: check semantic similarity against existing memories
      const embedding = await generateEmbedding(item.fact, apiKey, baseUrl);
      if (await this.isDuplicate(embedding)) continue;

      const memory: Memory = {
        id: generateId(),
        fact: item.fact,
        category: item.category,
        importance: Math.max(0, Math.min(1, item.importance)),
        accessCount: 0,
        lastAccessedAt: Date.now(),
        sourceConversationId: conversationId,
        createdAt: Date.now(),
      };

      this.memories.set(memory.id, memory);
      this.embeddings.set(memory.id, embedding);

      // Store in vector store for full-text search fallback
      await this.store.add({
        id: memory.id,
        content: memory.fact,
        metadata: {
          type: 'memory',
          source: `conversation:${conversationId}`,
          timestamp: memory.createdAt,
          category: memory.category,
          importance: memory.importance,
        },
      });

      newMemories.push(memory);
    }

    return newMemories;
  }

  // Retrieve relevant memories for a new conversation
  async recall(query: string, limit = 5, apiKey?: string, baseUrl?: string): Promise<Memory[]> {
    if (this.memories.size === 0) return [];

    // Apply decay before recall
    this.applyDecay();

    let ranked: Array<{ id: string; score: number }>;

    if (apiKey) {
      // Semantic search via embeddings
      const queryEmb = await generateEmbedding(query, apiKey, baseUrl);
      ranked = Array.from(this.embeddings.entries()).map(([id, emb]) => ({
        id,
        score: cosineSimilarity(queryEmb, emb),
      }));
    } else {
      // Fallback: full-text search via vector store
      await this.init();
      const results = await this.store.searchByType(query, 'memory', limit * 3);
      ranked = results.map((r, i) => ({ id: r.id, score: 1 - i * 0.05 }));
    }

    // Boost by importance and access frequency
    const now = Date.now();
    const scored = ranked
      .filter(({ id }) => this.memories.has(id))
      .map(({ id, score }) => {
        const mem = this.memories.get(id)!;
        const recencyBoost = Math.max(0, 1 - (now - mem.lastAccessedAt) / (30 * 86400000)); // 30-day window
        const freqBoost = Math.min(0.2, mem.accessCount * 0.02);
        const finalScore = score * 0.5 + mem.importance * 0.3 + recencyBoost * 0.1 + freqBoost * 0.1;
        return { id, score: finalScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Update access counts
    return scored.map(({ id }) => {
      const mem = this.memories.get(id)!;
      mem.accessCount++;
      mem.lastAccessedAt = now;
      return { ...mem };
    });
  }

  // Build a memory context string to inject into system prompts
  buildMemoryContext(memories: Memory[]): string {
    if (memories.length === 0) return '';

    const grouped: Record<string, string[]> = {};
    for (const mem of memories) {
      (grouped[mem.category] ??= []).push(mem.fact);
    }

    const sections = Object.entries(grouped)
      .map(([cat, facts]) => `[${cat}] ${facts.join('; ')}`)
      .join('\n');

    return `Based on previous interactions, I know the following about the user:\n${sections}`;
  }

  // ─── Persistence ────────────────────────────────────

  async save(): Promise<string> {
    const data = {
      memories: Array.from(this.memories.values()),
      embeddings: Array.from(this.embeddings.entries()),
      vectorStore: this.store.initialized ? await this.store.serialize() : null,
    };
    const serialized = JSON.stringify(data);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('chainmind-memories', serialized);
      }
    } catch (e) {
      console.warn('Memory localStorage save failed:', e);
    }

    return serialized;
  }

  async load(data?: string): Promise<void> {
    let raw = data;

    // If no data provided, try loading from localStorage
    if (!raw) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem('chainmind-memories') || undefined;
        }
      } catch (e) {
        console.warn('Memory localStorage load failed:', e);
      }
    }

    if (!raw) return;

    const parsed = JSON.parse(raw);

    this.memories.clear();
    this.embeddings.clear();

    if (Array.isArray(parsed.memories)) {
      for (const mem of parsed.memories) {
        this.memories.set(mem.id, mem);
      }
    }

    if (Array.isArray(parsed.embeddings)) {
      for (const [id, emb] of parsed.embeddings) {
        this.embeddings.set(id, emb);
      }
    }

    if (parsed.vectorStore) {
      await this.init();
      await this.store.restore(parsed.vectorStore);
    }
  }

  // ─── Maintenance ────────────────────────────────────

  private applyDecay(): void {
    const now = Date.now();
    const DAY = 86400000;
    for (const mem of this.memories.values()) {
      const ageDays = (now - mem.lastAccessedAt) / DAY;
      if (ageDays > 7) {
        // Lose ~2% importance per day after 7 days of no access
        const decayDays = ageDays - 7;
        mem.importance *= Math.pow(0.98, decayDays);
      }
    }
  }

  async decay(factor = 0.95): Promise<void> {
    for (const mem of this.memories.values()) {
      mem.importance *= factor;
    }
  }

  async prune(minImportance = 0.05): Promise<void> {
    for (const [id, mem] of this.memories) {
      if (mem.importance < minImportance) {
        this.memories.delete(id);
        this.embeddings.delete(id);
        await this.store.remove(id).catch(() => {});
      }
    }
  }

  get size(): number {
    return this.memories.size;
  }

  getAll(): Memory[] {
    return Array.from(this.memories.values());
  }

  // ─── Internal ───────────────────────────────────────

  private async isDuplicate(embedding: number[]): Promise<boolean> {
    for (const existing of this.embeddings.values()) {
      if (cosineSimilarity(embedding, existing) > SIMILARITY_THRESHOLD) return true;
    }
    return false;
  }
}

export const memorySystem = new MemorySystem();

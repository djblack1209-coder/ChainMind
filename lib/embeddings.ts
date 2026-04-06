// Embedding generation for vector search
// Supports OpenAI-compatible embeddings API with offline fallback
// The simple fallback uses deterministic hashing — not semantic, but stable

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 256;

export async function generateEmbedding(
  text: string,
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1',
  model = DEFAULT_EMBEDDING_MODEL,
): Promise<number[]> {
  try {
    return await fetchOpenAIEmbedding(text, apiKey, baseUrl, model);
  } catch {
    // Offline or API unavailable — fall back to simple embedding
    return simpleEmbedding(text, DEFAULT_DIMENSIONS);
  }
}

async function fetchOpenAIEmbedding(
  text: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<number[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/embeddings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text.slice(0, 8000), // API limit safety
      model,
      dimensions: DEFAULT_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    throw new Error(`Embedding API error: ${res.status}`);
  }
  const json = await res.json();
  return json.data?.[0]?.embedding ?? simpleEmbedding(text, DEFAULT_DIMENSIONS);
}

// ─── Cosine similarity ──────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Simple hash-based pseudo-embeddings ────────────────
// Deterministic, fast, zero-dependency. NOT semantic — but useful
// for offline dedup, clustering by surface form, and as a fallback.

export function simpleEmbedding(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const normalized = text.toLowerCase().trim();
  const vec = new Float64Array(dimensions);

  // Seed each dimension from character n-grams
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const bigram = i < normalized.length - 1
      ? code * 31 + normalized.charCodeAt(i + 1)
      : code * 31;
    const idx = Math.abs(bigram) % dimensions;
    vec[idx] += 1;
  }

  // Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] /= norm;
    }
  }

  return Array.from(vec);
}

// ─── Batch embedding ────────────────────────────────────

export async function generateEmbeddings(
  texts: string[],
  apiKey: string,
  baseUrl?: string,
  model?: string,
): Promise<number[][]> {
  return Promise.all(
    texts.map((t) => generateEmbedding(t, apiKey, baseUrl, model)),
  );
}

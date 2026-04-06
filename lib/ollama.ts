// Ollama local model discovery
// Probes the Ollama REST API to discover locally installed models.

export interface OllamaModel {
  name: string;
  size: number;        // bytes
  parameterSize: string; // e.g. "7B", "13B"
  quantization: string;  // e.g. "Q4_0"
  modifiedAt: string;
}

export interface OllamaProbeResult {
  ok: boolean;
  running: boolean;
  models: OllamaModel[];
  error?: string;
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/**
 * Check if Ollama is running locally.
 */
export async function isOllamaRunning(baseUrl = DEFAULT_OLLAMA_URL): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Discover all locally installed Ollama models.
 */
export async function probeOllamaModels(baseUrl = DEFAULT_OLLAMA_URL): Promise<OllamaProbeResult> {
  try {
    const running = await isOllamaRunning(baseUrl);
    if (!running) {
      return { ok: false, running: false, models: [], error: 'Ollama is not running. Start it with: ollama serve' };
    }

    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { ok: false, running: true, models: [], error: `Ollama API error: ${res.status}` };
    }

    const data = await res.json();
    const models: OllamaModel[] = (data.models || []).map((m: any) => ({
      name: m.name || m.model || '',
      size: m.size || 0,
      parameterSize: m.details?.parameter_size || '',
      quantization: m.details?.quantization_level || '',
      modifiedAt: m.modified_at || '',
    }));

    return { ok: true, running: true, models };
  } catch (e: any) {
    return { ok: false, running: false, models: [], error: e?.message || 'Failed to probe Ollama' };
  }
}

/**
 * Get model names as strings for the model picker.
 */
export async function getOllamaModelNames(baseUrl = DEFAULT_OLLAMA_URL): Promise<string[]> {
  const result = await probeOllamaModels(baseUrl);
  return result.models.map((m) => m.name);
}

/**
 * Format model size for display.
 */
export function formatModelSize(bytes: number): string {
  if (bytes === 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

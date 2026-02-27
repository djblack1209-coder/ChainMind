// Smart config parser — extracts API Key and Base URL from any pasted config text
// Supports: JSON configs, plain text with URLs and keys, env vars,
// AND Chinese-style replacement instructions like "替换上述模版Key为：sk-xxx"

export interface ParsedConfig {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  provider: 'claude' | 'openai' | 'gemini' | null;
}

// ===== Chinese replacement instruction patterns (HIGHEST PRIORITY) =====
// These override anything found in templates/examples above them.
// Matches: "替换...Key为：sk-xxx", "Key替换为：sk-xxx", "密钥：sk-xxx" etc.
const CN_KEY_PATTERNS = [
  /替换.*(?:Key|key|KEY|密钥|秘钥|token|Token).*[：:]\s*(\S+)/,
  /(?:Key|key|KEY|密钥|秘钥|token|Token).*替换.*[：:]\s*(\S+)/,
  /(?:你的|自己的|实际的|真实的)(?:Key|key|KEY|密钥|秘钥).*[：:]\s*(\S+)/i,
];

const CN_URL_PATTERNS = [
  /替换.*(?:地址|域名|URL|url|Base|base|网址|链接).*[：:]\s*(\S+)/,
  /(?:地址|域名|URL|url|Base|base|网址|链接).*替换.*[：:]\s*(\S+)/,
  /(?:你的|自己的|实际的|真实的)(?:地址|域名|URL|url|网址).*[：:]\s*(\S+)/i,
];

// ===== Standard key patterns =====
const KEY_PATTERNS = [
  // sk-xxx style (OpenAI / relay)
  /\b(sk-[A-Za-z0-9]{20,})\b/,
  // anthropic key
  /\b(sk-ant-[A-Za-z0-9-]{20,})\b/,
  // generic quoted key after common field names
  /(?:ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|apiKey|api_key|key)["']?\s*[:=]\s*["']([^"'\s,}{]+)["']/i,
  // unquoted key after field names
  /(?:ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|apiKey|api_key|key)["']?\s*[:=]\s*([^\s,"'}{]+)/i,
];

// ===== URL patterns =====
const URL_PATTERNS = [
  // Quoted URL after common field names
  /(?:ANTHROPIC_BASE_URL|OPENAI_BASE_URL|baseURL|baseUrl|base_url|BASE_URL)["']?\s*[:=]\s*["']?(https?:\/\/[^\s"',}{]+)["']?/i,
  // Any https URL that looks like an API endpoint (not github, not docs)
  /\b(https?:\/\/(?!github\.com|docs\.)[\w.-]+\.[\w]{2,}(?:\/[^\s"',}{]*)?)\b/,
];

// ===== Model patterns =====
const MODEL_PATTERNS = [
  /(?:model|MODEL|模型\s*(?:ID|id|名称|名)?)\s*[：:=]\s*["']?(?:anthropic\/|openai\/)?([a-z0-9][\w.-]*(?:\/[\w.-]+)?)["']?/i,
];

function cleanUrl(raw: string): string {
  let url = raw.trim();
  // Remove trailing punctuation that might have been captured
  url = url.replace(/[，。、；！？]+$/, '');
  // Add https:// if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  // Clean up double https://
  url = url.replace(/^https?:\/\/https?:\/\//, 'https://');
  // Remove trailing /v1, /v1/ — adapter adds it
  url = url.replace(/\/v1\/?$/, '');
  // Remove trailing slash
  url = url.replace(/\/+$/, '');
  return url;
}

export function parseConfig(text: string): ParsedConfig {
  const result: ParsedConfig = {
    apiKey: null,
    baseUrl: null,
    model: null,
    provider: null,
  };

  // ===== PHASE 1: Chinese replacement instructions (highest priority) =====
  // These are the user's ACTUAL values, not template placeholders
  for (const pattern of CN_KEY_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 10) {
      result.apiKey = match[1];
      break;
    }
  }

  for (const pattern of CN_URL_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.baseUrl = cleanUrl(match[1]);
      break;
    }
  }

  // ===== PHASE 2: JSON extraction (supplements, does NOT override phase 1) =====
  try {
    const cleaned = text.replace(/,\s*([}\]])/g, '$1'); // trailing commas
    const json = JSON.parse(cleaned);
    extractFromJson(json, result);
  } catch {
    // Not valid JSON, continue with regex
  }

  // ===== PHASE 3: Standard regex extraction (lowest priority, fills gaps) =====
  if (!result.apiKey) {
    for (const pattern of KEY_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const key = match[match.length - 1] || match[1];
        // Skip placeholder values like "替换成自己KEY"
        if (key && key.length > 10 && /^[A-Za-z0-9\-_]+$/.test(key)) {
          result.apiKey = key;
          break;
        }
      }
    }
  }

  if (!result.baseUrl) {
    for (const pattern of URL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const raw = match[match.length - 1] || match[1];
        result.baseUrl = cleanUrl(raw);
        break;
      }
    }
  }

  if (!result.model) {
    for (const pattern of MODEL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        let model = match[1];
        model = model.replace(/^(anthropic|openai|google)\//i, '');
        result.model = model;
        break;
      }
    }
  }

  // ===== PHASE 4: Provider detection =====
  if (!result.provider) {
    const allText = `${result.apiKey || ''} ${result.baseUrl || ''} ${result.model || ''} ${text}`.toLowerCase();
    if (allText.includes('anthropic') || allText.includes('claude') || result.apiKey?.startsWith('sk-ant-')) {
      result.provider = 'claude';
    } else if (allText.includes('gemini') || allText.includes('google')) {
      result.provider = 'gemini';
    } else {
      // Default to openai — most relay APIs use OpenAI-compatible format
      result.provider = 'openai';
    }
  }

  return result;
}

function extractFromJson(obj: unknown, result: ParsedConfig, depth = 0): void {
  if (depth > 5 || !obj || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    const lk = key.toLowerCase();

    if (typeof value === 'string') {
      // Key detection — skip placeholder values
      if (!result.apiKey && (
        lk.includes('key') || lk.includes('token') || lk === 'anthropic_auth_token'
      )) {
        if (value.length > 10 && /^[A-Za-z0-9\-_]+$/.test(value)) {
          result.apiKey = value;
        }
      }

      // URL detection
      if (!result.baseUrl && (
        lk.includes('base_url') || lk.includes('baseurl') || lk === 'anthropic_base_url' || lk === 'openai_base_url'
      )) {
        result.baseUrl = cleanUrl(value);
      }

      // Model detection
      if (!result.model && lk === 'model') {
        result.model = value.replace(/^(anthropic|openai|google)\//i, '');
      }
    } else if (typeof value === 'object' && value !== null) {
      extractFromJson(value, result, depth + 1);
    }
  }
}

// Check if pasted text looks like a config (vs normal chat message)
export function looksLikeConfig(text: string): boolean {
  const t = text.trim();
  // Has a key-like pattern (real key, not placeholder)
  const hasKey = /\bsk-[A-Za-z0-9]{10,}\b/.test(t);
  // Has a URL or bare domain
  const hasUrl = /https?:\/\/[\w.-]+/.test(t) || /[\w.-]+\.\w{2,}/.test(t);
  // Has JSON-like structure with config keywords
  const hasJson = /[{"]/.test(t) && (t.includes('key') || t.includes('KEY') || t.includes('token') || t.includes('TOKEN') || t.includes('url') || t.includes('URL'));
  // Has env var style
  const hasEnv = /[A-Z_]+=/.test(t);
  // Has Chinese replacement instructions
  const hasCnReplace = /替换.*[：:]/.test(t);

  // Must have at least a key to be considered config
  return hasKey && (hasUrl || hasJson || hasEnv || hasCnReplace || t.length > 50);
}

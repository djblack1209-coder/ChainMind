// Token counting and cost estimation using js-tiktoken
// Reference: OpenAI tiktoken, adapted for multi-provider support

import { encodingForModel } from 'js-tiktoken';

// Pricing per 1M tokens (input/output) in USD
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // Claude
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.8, output: 4 },
  // Gemini
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

let encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder() {
  if (!encoder) {
    try {
      encoder = encodingForModel('gpt-4o' as any);
    } catch {
      // Fallback: rough estimate
      return null;
    }
  }
  return encoder;
}

export function countTokens(text: string): number {
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      // fallback
    }
  }
  // Rough estimate: ~4 chars per token for English, ~2 for Chinese
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return Math.ceil(cjkChars / 1.5 + otherChars / 4);
}

export function findPricing(model: string): { input: number; output: number } | null {
  // Exact match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Fuzzy match
  const lower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key) || key.includes(lower)) return pricing;
  }
  return null;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = findPricing(model);
  if (!pricing) return null;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function formatCost(cost: number): string {
  if (cost < 0.001) return `$${(cost * 100).toFixed(4)}¢`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

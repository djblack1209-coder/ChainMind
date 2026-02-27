// Unified API adapter layer for multi-provider streaming support.
// Thin typed wrappers over lib/llm-core so Electron + Next share one implementation.

import type { AIProvider, EffortLevel } from './types';
import {
  buildClaudeRequest as coreBuildClaudeRequest,
  buildGeminiRequest as coreBuildGeminiRequest,
  buildOpenAIRequest as coreBuildOpenAIRequest,
  buildRequest as coreBuildRequest,
  isRelay as coreIsRelay,
} from './llm-core';

export interface AdapterConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  effort: EffortLevel;
}

export interface AdapterRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildClaudeRequest(config: AdapterConfig): AdapterRequest {
  return coreBuildClaudeRequest(config);
}

export function buildOpenAIRequest(config: AdapterConfig): AdapterRequest {
  return coreBuildOpenAIRequest(config);
}

export function buildGeminiRequest(config: AdapterConfig): AdapterRequest {
  return coreBuildGeminiRequest(config);
}

export function isRelay(provider: AIProvider, baseUrl?: string): boolean {
  return coreIsRelay(provider, baseUrl);
}

export function buildRequest(provider: AIProvider, config: AdapterConfig): AdapterRequest {
  return coreBuildRequest(provider, config);
}

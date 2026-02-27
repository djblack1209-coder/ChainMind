import type { AIProvider, ChatRequestBody, EffortLevel, StreamChunk } from './types';

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

export interface ValidateError {
  ok: false;
  status: number;
  message: string;
}

export interface ValidateSuccess {
  ok: true;
  payload: ChatRequestBody;
}

export type ValidateChatPayloadResult = ValidateSuccess | ValidateError;
export type StreamFormat = AIProvider | 'openai';

export const DEFAULT_TIMEOUT_MS: number;
export const MAX_API_KEY_LEN: number;
export const MAX_MODELS: number;
export const MAX_MODEL_NAME_LEN: number;

export function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string | null;
export function isRelay(provider: AIProvider, baseUrl?: string): boolean;

export function buildOpenAIRequest(config: AdapterConfig): AdapterRequest;
export function buildClaudeRequest(config: AdapterConfig): AdapterRequest;
export function buildGeminiRequest(config: AdapterConfig): AdapterRequest;
export function buildRequest(provider: AIProvider, config: AdapterConfig): AdapterRequest;

export function validateChatPayload(payload: unknown): ValidateChatPayloadResult;

export function fetchWithTimeout(url: string, options: RequestInit, timeoutMs?: number): Promise<Response>;
export function maybeOptimizePrompt(
  payload: ChatRequestBody,
  options?: { timeoutMs?: number }
): Promise<string>;

export function resolveStreamFormat(provider: AIProvider, baseUrl?: string): StreamFormat;
export function mapStreamChunk(streamFormat: StreamFormat, parsed: unknown): StreamChunk | null;
export function forwardStreamChunks(
  upstreamBody: ReadableStream<Uint8Array>,
  streamFormat: StreamFormat,
  onChunk: (chunk: StreamChunk) => void
): Promise<void>;

export function sanitizeModels(models: unknown[], maxModels?: number, maxModelNameLen?: number): string[];

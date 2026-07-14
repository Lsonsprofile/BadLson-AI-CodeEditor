// src/ai/types.ts
// ─────────────────────────────────────────────────────────────────────
// AI Client Types — Types used by the AI client and request adapter
// ─────────────────────────────────────────────────────────────────────

import type { AIMessage, AIProvider } from '@/store/ai/ai.types';

/**
 * Generic request sent to any AI provider.
 */
export interface AIProviderRequest {
  provider: AIProvider;
  model: string;
  messages: AIMessage[];

  // ✅ NEW: Project context fields forwarded to backend
  projectFiles: Record<string, string>;
  activeFile: string | null;
  recentFiles: string[];
  folders?: string[];
  selectedCode?: string | null;
  consoleErrors?: string[];
  buildErrors?: string[];
  cursorPosition?: {
    line: number;
    column: number;
  } | null;

  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;

  /**
   * AbortSignal to cancel the request.
   */
  signal?: AbortSignal;
}

/**
 * Token usage information.
 */
export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * A normalized AI response.
 */
export interface AIProviderResponse {
  id: string;
  provider: AIProvider;
  model: string;

  message: AIMessage;

  usage?: AIUsage;

  finishReason?: string;
}

/**
 * A streaming chunk returned by a provider.
 */
export interface AIStreamChunk {
  id: string;
  content: string;
  done: boolean;
}

/**
 * Normalized AI error.
 */
export interface AIProviderError {
  provider: AIProvider;
  message: string;
  code?: string;
  status?: number;
}

/**
 * Common interface every provider must implement.
 */
export interface AIProviderClient {
  readonly provider: AIProvider;

  send(
    request: AIProviderRequest
  ): Promise<AIProviderResponse>;

  stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse>;
}
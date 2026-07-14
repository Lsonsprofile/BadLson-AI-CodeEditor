// src/ai/service.ts

import { aiClient } from './client';
import { toProviderRequest } from './requestAdapter';
import { useAIStore } from '@/store/ai/aiStore';
import type { AIRequest, AIMessage } from '@/store/ai/ai.types';
import type { AIProviderResponse } from './types';

// ─── HELPER: Token Estimator ───────────────────────────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── HELPER: Model Capabilities ──────────────────────────────────
// Updated with higher maxTokens for models that support it
const MODEL_METADATA: Record<string, { maxTokens: number; contextWindow: number }> = {
  // Groq models
  'meta-llama/llama-4-scout-17b-16e-instruct': { maxTokens: 16384, contextWindow: 131072 },
  'llama-3.3-70b-versatile': { maxTokens: 16384, contextWindow: 131072 },
  'llama-3.1-8b-instant': { maxTokens: 8192, contextWindow: 131072 },
  'gemma2-9b-it': { maxTokens: 8192, contextWindow: 8192 },
  // OpenRouter models
  'openai/gpt-4o': { maxTokens: 16384, contextWindow: 128000 },
  'openai/gpt-4-turbo': { maxTokens: 8192, contextWindow: 128000 },
  'anthropic/claude-3.5-sonnet': { maxTokens: 16384, contextWindow: 200000 },
  'anthropic/claude-3-opus': { maxTokens: 8192, contextWindow: 200000 },
  'google/gemini-2.0-flash-001': { maxTokens: 16384, contextWindow: 1048576 },
  'mistralai/mistral-large-2411': { maxTokens: 8192, contextWindow: 131072 },
  'meta-llama/llama-3.3-70b-instruct:free': { maxTokens: 8192, contextWindow: 131072 },
  // Gemini models
  'gemini-2.5-pro': { maxTokens: 16384, contextWindow: 1048576 },
  'gemini-2.5-flash': { maxTokens: 16384, contextWindow: 1048576 },
  'gemini-2.0-flash': { maxTokens: 8192, contextWindow: 1048576 },
  'gemini-1.5-pro': { maxTokens: 8192, contextWindow: 2097152 },
  'gemini-1.5-flash': { maxTokens: 8192, contextWindow: 1048576 },
  // Fallback
  'default': { maxTokens: 4096, contextWindow: 32768 },
};

function getModelCapabilities(model: string): { maxTokens: number; contextWindow: number } {
  return MODEL_METADATA[model] || MODEL_METADATA['default'];
}

// ─── HELPER: Error Mapper ───────────────────────────────────────────
interface ErrorMapping {
  regex: RegExp;
  message: string;
  status?: number;
}

const ERROR_MAP: ErrorMapping[] = [
  { regex: /401|Unauthorized|API key/i, message: 'Invalid API key. Please check your configuration.' },
  { regex: /429|Rate limit/i, message: 'Rate limit exceeded. Please wait and try again later.' },
  { regex: /413|Payload Too Large|Prompt too long/i, message: 'The input exceeds the model\'s capacity. Try shortening your code or splitting it into parts.' },
  { regex: /500|Internal Server Error|Service unavailable/i, message: 'The AI service is currently unavailable. Please try again later.' },
  { regex: /404|Not Found|model not found/i, message: 'The selected model is not available. Please choose another.' },
  { regex: /AbortError|aborted/i, message: 'Request was cancelled.' },
  { regex: /timeout|Timed out/i, message: 'The request timed out. The model may be overloaded or your network is slow.' },
  { regex: /fetch failed|NetworkError|Failed to fetch/i, message: 'Network error. Please check your internet connection.' },
  { regex: /empty response/i, message: 'The AI returned an empty response. Please try again.' },
  { regex: /unknown/i, message: 'An unknown error occurred. Please try again.' },
];

function mapError(error: unknown): string {
  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    for (const entry of ERROR_MAP) {
      if (entry.regex.test(lower)) return entry.message;
    }
    return error;
  }
  if (error instanceof Error) {
    const message = error.message;
    const lower = message.toLowerCase();
    for (const entry of ERROR_MAP) {
      if (entry.regex.test(lower)) return entry.message;
    }
    return message;
  }
  return 'An unexpected error occurred.';
}

// ─── HELPER: Retry Logic ────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        (error instanceof Error &&
          (error.message.includes('fetch failed') ||
            error.message.includes('timeout') ||
            error.message.includes('500') ||
            error.message.includes('503')));
      if (attempt === maxRetries || !isRetryable) break;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ─── MAIN SERVICE ────────────────────────────────────────────────────

export class AIService {
  private abortController: AbortController | null = null;
  private readonly REQUEST_TIMEOUT = 120000; // 2 minutes
  private readonly MAX_RETRIES = 1;

  /**
   * Send a non‑streaming request.
   * Validates token count, manages timeout, retries, and error mapping.
   */
  async send(request: AIRequest): Promise<AIProviderResponse> {
    const store = useAIStore.getState();
    this.cancel();

    store.setStatus('connecting');
    store.setLoading(true);
    store.setError(null);
    store.setCurrentRequest(request);
    store.setTruncated(false); // Reset truncation flag

    // Validate token count
    const totalPrompt = request.messages.map(m => m.content).join('\n');
    const estimatedTokens = estimateTokens(totalPrompt);
    const modelCaps = getModelCapabilities(request.model);
    if (estimatedTokens > modelCaps.contextWindow) {
      const errorMsg = `The prompt uses approximately ${estimatedTokens} tokens, but the model "${request.model}" supports at most ${modelCaps.contextWindow} tokens. Please shorten your input or split it into smaller parts.`;
      store.setStatus('error');
      store.setError(errorMsg);
      store.setLoading(false);
      throw new Error(errorMsg);
    }

    this.abortController = new AbortController();
    const providerRequest = toProviderRequest(request);
    providerRequest.signal = this.abortController.signal;

    // ✅ FIX: Use import.meta.env.DEV instead of process.env
    if (import.meta.env.DEV) {
      console.log(`[AI] Sending request to ${request.provider} / ${request.model}, estimated tokens: ${estimatedTokens}`);
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out.')), this.REQUEST_TIMEOUT);
    });

    const sendPromise = withRetry(() => aiClient.send(providerRequest), this.MAX_RETRIES);

    try {
      store.setStatus('sending');
      const response = await Promise.race([sendPromise, timeoutPromise]) as AIProviderResponse;

      // Check for truncation
      const truncated = response.finishReason === 'length';
      if (truncated) {
        store.setTruncated(true);
        if (response.usage) {
          store.setTokenUsage({
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
          });
        }
        // Optionally add a warning message
        const warningMessage: AIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '\n\n⚠️ **Response truncated** – the model reached its length limit. Try splitting your request into smaller parts, or switch to a model with higher output capacity.',
          timestamp: Date.now(),
        };
        store.addMessage(warningMessage);
      }

      store.addMessage(response.message);
      store.setStatus('completed');
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;

      // Store usage info for UI
      if (response.usage) {
        store.setTokenUsage({
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        });
        console.log(`[AI] Usage: ${response.usage.promptTokens} prompt, ${response.usage.completionTokens} completion, ${response.usage.totalTokens} total`);
      }

      return response;
    } catch (error) {
      const friendlyMessage = mapError(error);
      store.setError(friendlyMessage);
      store.setStatus('error');
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;
      throw new Error(friendlyMessage);
    }
  }

  /**
   * Send a streaming request.
   * Creates an assistant placeholder, updates it efficiently,
   * provides progress and cancellation feedback, and tracks token usage.
   */
  async stream(
    request: AIRequest,
    onChunk?: (chunk: { id: string; content: string; done: boolean }) => void
  ): Promise<AIProviderResponse> {
    const store = useAIStore.getState();
    this.cancel();

    store.setStatus('connecting');
    store.setLoading(true);
    store.setTyping(true);
    store.setError(null);
    store.setCurrentRequest(request);
    store.setTruncated(false);
    store.setTokenUsage(null);

    // Token validation
    const totalPrompt = request.messages.map(m => m.content).join('\n');
    const estimatedTokens = estimateTokens(totalPrompt);
    const modelCaps = getModelCapabilities(request.model);
    if (estimatedTokens > modelCaps.contextWindow) {
      const errorMsg = `The prompt uses approximately ${estimatedTokens} tokens, but the model "${request.model}" supports at most ${modelCaps.contextWindow} tokens. Please shorten your input.`;
      store.setStatus('error');
      store.setError(errorMsg);
      store.setLoading(false);
      store.setTyping(false);
      throw new Error(errorMsg);
    }

    // Placeholder assistant message
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: AIMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    store.addMessage(assistantPlaceholder);

    this.abortController = new AbortController();
    const providerRequest = toProviderRequest(request);
    providerRequest.signal = this.abortController.signal;

    // Streaming buffers
    const CHUNK_BUFFER_SIZE = 10;
    let chunkCounter = 0;
    let fullContent = '';
    const contentParts: string[] = [];

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out.')), this.REQUEST_TIMEOUT);
    });

    const streamPromise = withRetry(
      () =>
        aiClient.stream(providerRequest, (chunk) => {
          if (!chunk.done) {
            contentParts.push(chunk.content);
            fullContent += chunk.content;
            chunkCounter++;

            // Batch updates
            if (chunkCounter % CHUNK_BUFFER_SIZE === 0) {
              const currentMessages = useAIStore.getState().messages;
              const existing = currentMessages.find((m) => m.id === assistantId);
              if (existing) {
                useAIStore.getState().replaceMessageById(assistantId, {
                  ...existing,
                  content: fullContent,
                });
              }
            }

            if (useAIStore.getState().status !== 'streaming') {
              store.setStatus('streaming');
            }
          }

          if (onChunk) {
            onChunk(chunk);
          }
        }),
      this.MAX_RETRIES
    );

    try {
      const response = await Promise.race([streamPromise, timeoutPromise]) as AIProviderResponse;

      // Final content update
      const finalMessages = useAIStore.getState().messages;
      const existingFinal = finalMessages.find((m) => m.id === assistantId);
      if (existingFinal && existingFinal.content !== fullContent) {
        useAIStore.getState().replaceMessageById(assistantId, {
          ...existingFinal,
          content: fullContent,
        });
      }

      // Check for truncation
      const truncated = response.finishReason === 'length';
      if (truncated) {
        store.setTruncated(true);
        store.setStatus('truncated');
        // Append warning to the assistant message
        const currentMessages = useAIStore.getState().messages;
        const existing = currentMessages.find((m) => m.id === assistantId);
        if (existing) {
          useAIStore.getState().replaceMessageById(assistantId, {
            ...existing,
            content: existing.content + '\n\n⚠️ **Response truncated** – the model reached its length limit. Try splitting your request into smaller parts, or switch to a model with higher output capacity.',
          });
        }
      }

      // Store token usage
      if (response.usage) {
        store.setTokenUsage({
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        });
      }

      store.setStatus('completed');
      store.setTyping(false);
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;

      return response;
    } catch (error) {
      const errorMessage = mapError(error);
      const currentMessages = useAIStore.getState().messages;
      const existing = currentMessages.find((m) => m.id === assistantId);

      if (existing) {
        if (errorMessage.includes('cancelled')) {
          useAIStore.getState().replaceMessageById(assistantId, {
            ...existing,
            content: existing.content + '\n\n*[Generation stopped.]*',
          });
          store.setStatus('cancelled');
        } else {
          useAIStore.getState().replaceMessageById(assistantId, {
            ...existing,
            content: existing.content + `\n\n⚠️ Error: ${errorMessage}`,
          });
          store.setStatus('error');
        }
      } else {
        store.addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ Error: ${errorMessage}`,
          timestamp: Date.now(),
        });
      }

      store.setError(errorMessage);
      store.setTyping(false);
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;
      throw new Error(errorMessage);
    }
  }

  /**
   * Cancel the ongoing request.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    const store = useAIStore.getState();
    store.setTyping(false);
    store.setLoading(false);
    store.setCurrentRequest(null);
    if (store.status !== 'truncated') {
      store.setStatus('cancelled');
    }
    store.cancelStreaming();
  }
}

export const aiService = new AIService();
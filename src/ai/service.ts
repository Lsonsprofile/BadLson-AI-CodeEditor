// src/ai/service.ts

import { aiClient } from './client';
import { toProviderRequest } from './requestAdapter';

import { useAIStore } from '@/store/ai/aiStore';
import type { AIRequest, AIMessage } from '@/store/ai/ai.types';
import type { AIProviderResponse } from './types';

export class AIService {
  private abortController: AbortController | null = null;

  /**
   * Send a non‑streaming request.
   * Orchestrates store updates and calls the AI client.
   */
  async send(request: AIRequest): Promise<AIProviderResponse> {
    const store = useAIStore.getState();

    // Cancel any ongoing request
    this.cancel();

    // Update store state
    store.setLoading(true);
    store.setError(null);
    store.setCurrentRequest(request);

    // Prepare provider request with abort signal
    this.abortController = new AbortController();
    const providerRequest = toProviderRequest(request);
    providerRequest.signal = this.abortController.signal;

    try {
      const response = await aiClient.send(providerRequest);

      // Add the assistant’s response to the store
      store.addMessage(response.message);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.setError(message);
      throw error;
    } finally {
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;
    }
  }

  /**
   * Send a streaming request.
   * Creates an assistant placeholder, updates it chunk by chunk,
   * and notifies the caller via an optional callback.
   */
  async stream(
    request: AIRequest,
    onChunk?: (chunk: { id: string; content: string; done: boolean }) => void
  ): Promise<AIProviderResponse> {
    const store = useAIStore.getState();

    // Cancel any ongoing request
    this.cancel();

    // Update store state
    store.setLoading(true);
    store.setTyping(true);
    store.setError(null);
    store.setCurrentRequest(request);

    // Create an empty assistant message as a placeholder
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: AIMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    store.addMessage(assistantPlaceholder);

    // Prepare provider request with abort signal
    this.abortController = new AbortController();
    const providerRequest = toProviderRequest(request);
    providerRequest.signal = this.abortController.signal;

    try {
      const response = await aiClient.stream(providerRequest, (chunk) => {
        // Update the assistant message with each received chunk
        if (!chunk.done) {
          const currentMessages = useAIStore.getState().messages;
          const existing = currentMessages.find((m) => m.id === assistantId);
          if (existing) {
            const updated = {
              ...existing,
              content: existing.content + chunk.content,
            };
            useAIStore.getState().replaceMessageById(assistantId, updated);
          } else {
            // Fallback: should never happen, but safe guard
            store.addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: chunk.content,
              timestamp: Date.now(),
            });
          }
        }

        // Forward the chunk to the caller if needed
        if (onChunk) {
          onChunk(chunk);
        }
      });

      // Streaming finished successfully
      store.setTyping(false);
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.setError(message);
      store.setTyping(false);
      store.setLoading(false);
      store.setCurrentRequest(null);
      this.abortController = null;
      throw error;
    }
  }

  /**
   * Cancel the currently ongoing request (if any).
   * Resets loading and typing states.
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
    store.cancelStreaming();
  }
}

// Export a singleton instance
export const aiService = new AIService();
// src/store/ai/aiStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  AIState,
  AIMessage,
  AIProvider,
  AIProviderConfig,
  AIRequest,
  AIStreamState,
  AISuggestion,
  AIDiagnostic,
} from './ai.types';

// 👇 new imports
import { aiClient } from '@/ai/client';
import { toProviderRequest } from '@/ai/requestAdapter';

/**
 * Default provider configuration.
 *
 * These values can later be overridden from Settings.
 */
const DEFAULT_PROVIDER_CONFIG = Object.freeze({
  provider: 'openrouter',
  model: 'deepseek/deepseek-chat-v3-0324:free',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  stream: true,
  enabled: true,
} satisfies AIProviderConfig);

// 👇 abort controller for cancellation
let abortController: AbortController | null = null;

interface AIStore extends AIState {
  // The following are inherited from AIState:
  // providerConfig, loading, lastError, etc.

  // Actions
  setProvider(provider: AIProvider): void;
  setModel(model: string): void;
  setProviderConfig(updates: Partial<AIProviderConfig>): void;
  setConversation(id: string | null): void;
  addMessage(message: AIMessage): void;

  /**
   * Update the last message with the given role (default: assistant).
   * @deprecated Prefer updateMessageById for deterministic updates.
   */
  updateLastMessage(content: string, role?: AIMessage['role']): void;
  /**
   * Replace the last message with the given role (default: assistant).
   * @deprecated Prefer replaceMessageById for deterministic updates.
   */
  replaceLastMessage(message: AIMessage, role?: AIMessage['role']): void;

  // New deterministic message updates by ID
  updateMessageById(id: string, updates: Partial<AIMessage>): void;
  replaceMessageById(id: string, message: AIMessage): void;

  clearMessages(): void;
  setTyping(typing: boolean): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  setFallbackEnabled(enabled: boolean): void;
  startStreaming(requestId: string): void;
  appendStreaming(chunk: string): void;
  finishStreaming(): void;
  cancelStreaming(): void;
  setCurrentRequest(request: AIRequest | null): void;
  setSuggestions(suggestions: AISuggestion[]): void;
  clearSuggestions(): void;
  setDiagnostics(diagnostics: AIDiagnostic[]): void;
  clearDiagnostics(): void;
  reset(): void;

  // 👇 NEW high-level actions
  sendMessage(content: string): Promise<void>;
  stopGenerating(): void;
  sendRequest(request: AIRequest): Promise<void>; // optional, for advanced use
}

const defaultStreamState: AIStreamState = {
  isStreaming: false,
  partialResponse: '',
  requestId: undefined,
};

const initialState: Omit<
  AIStore,
  | 'setProvider'
  | 'setModel'
  | 'setProviderConfig'
  | 'setConversation'
  | 'addMessage'
  | 'updateLastMessage'
  | 'replaceLastMessage'
  | 'updateMessageById'
  | 'replaceMessageById'
  | 'clearMessages'
  | 'setTyping'
  | 'setLoading'
  | 'setError'
  | 'setFallbackEnabled'
  | 'startStreaming'
  | 'appendStreaming'
  | 'finishStreaming'
  | 'cancelStreaming'
  | 'setCurrentRequest'
  | 'setSuggestions'
  | 'clearSuggestions'
  | 'setDiagnostics'
  | 'clearDiagnostics'
  | 'reset'
  | 'sendMessage'
  | 'stopGenerating'
  | 'sendRequest'
> = {
  provider: 'openrouter',
  model: DEFAULT_PROVIDER_CONFIG.model,
  fallbackEnabled: true,
  conversationId: null,
  messages: [],
  suggestions: [],
  diagnostics: [],
  currentRequest: null,
  stream: defaultStreamState,
  isTyping: false,
  providerConfig: DEFAULT_PROVIDER_CONFIG,
  loading: false,
  lastError: null,
};

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ---------- Existing actions (unchanged) ----------
      setProvider: (provider) =>
        set((state) => ({
          provider,
          providerConfig: {
            ...state.providerConfig,
            provider,
          },
        })),

      setModel: (model) =>
        set((state) => ({
          model,
          providerConfig: {
            ...state.providerConfig,
            model,
          },
        })),

      setProviderConfig: (updates) =>
        set((state) => ({
          providerConfig: {
            ...state.providerConfig,
            ...updates,
          },
          provider: updates.provider ?? state.provider,
          model: updates.model ?? state.model,
        })),

      setConversation: (conversationId) =>
        set({
          conversationId,
        }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      updateLastMessage: (content, role = 'assistant') =>
        set((state) => {
          let index = -1;
          for (let i = state.messages.length - 1; i >= 0; i--) {
            if (state.messages[i].role === role) {
              index = i;
              break;
            }
          }
          if (index === -1) return state;
          const messages = [...state.messages];
          messages[index] = {
            ...messages[index],
            content,
          };
          return { messages };
        }),

      replaceLastMessage: (message, role = 'assistant') =>
        set((state) => {
          let index = -1;
          for (let i = state.messages.length - 1; i >= 0; i--) {
            if (state.messages[i].role === role) {
              index = i;
              break;
            }
          }
          if (index === -1) {
            return { messages: [...state.messages, message] };
          }
          const messages = [...state.messages];
          messages[index] = message;
          return { messages };
        }),

      updateMessageById: (id, updates) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) return state;
          const messages = [...state.messages];
          messages[index] = {
            ...messages[index],
            ...updates,
          };
          return { messages };
        }),

      replaceMessageById: (id, message) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) {
            return state;
          }
          const messages = [...state.messages];
          messages[index] = message;
          return { messages };
        }),

      clearMessages: () =>
        set({
          messages: [],
          conversationId: null,
        }),

      setTyping: (isTyping) =>
        set({
          isTyping,
        }),

      setLoading: (loading) =>
        set({
          loading,
        }),

      setError: (lastError) =>
        set({
          lastError,
        }),

      setFallbackEnabled: (fallbackEnabled) =>
        set({ fallbackEnabled }),

      startStreaming: (requestId) =>
        set({
          stream: {
            isStreaming: true,
            partialResponse: '',
            requestId,
          },
        }),

      appendStreaming: (chunk) =>
        set((state) => ({
          stream: {
            ...state.stream,
            partialResponse: state.stream.partialResponse + chunk,
          },
        })),

      finishStreaming: () =>
        set({
          stream: {
            isStreaming: false,
            partialResponse: '',
            requestId: undefined,
          },
        }),

      cancelStreaming: () =>
        set({
          stream: {
            isStreaming: false,
            partialResponse: '',
            requestId: undefined,
          },
        }),

      setCurrentRequest: (currentRequest) =>
        set({
          currentRequest,
        }),

      setSuggestions: (suggestions) =>
        set({
          suggestions,
        }),

      clearSuggestions: () =>
        set({
          suggestions: [],
        }),

      setDiagnostics: (diagnostics) =>
        set({
          diagnostics,
        }),

      clearDiagnostics: () =>
        set({
          diagnostics: [],
        }),

      reset: () =>
        set((state) => ({
          ...initialState,
          provider: state.provider,
          model: state.model,
          fallbackEnabled: state.fallbackEnabled,
          providerConfig: state.providerConfig,
        })),

      // ---------- NEW high-level actions ----------

      /**
       * Send a user message and get an AI response.
       */
      sendMessage: async (content: string) => {
        // Guard against concurrent requests
        if (get().loading) {
          throw new Error('Already processing a message');
        }

        try {
          // 1. Create user message
          const userMessage: AIMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
            timestamp: Date.now(),
          };

          // 2. Create placeholder assistant message (will be updated)
          const assistantId = crypto.randomUUID();
          const assistantPlaceholder: AIMessage = {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          };

          // 3. Update store: add both messages and start streaming state
          set((state) => ({
            messages: [...state.messages, userMessage, assistantPlaceholder],
            isTyping: true,
            loading: true,
            lastError: null,
            stream: {
              isStreaming: true,
              partialResponse: '',
              requestId: assistantId,
            },
          }));

          // 4. Build the AI request from the store's current state
          const storeState = get();
          const request: AIRequest = {
            id: crypto.randomUUID(),
            provider: storeState.provider,
            model: storeState.model,
            messages: storeState.messages, // includes user + placeholder
            options: {
              temperature: storeState.providerConfig.temperature,
              maxTokens: storeState.providerConfig.maxTokens,
              topP: storeState.providerConfig.topP,
              stream: true,
            },
            timestamp: Date.now(),
            // signal will be set by the adapter
          };

          // 5. Convert to provider request and add AbortController
          abortController = new AbortController();
          const providerRequest = toProviderRequest(request);
          providerRequest.signal = abortController.signal;

          // 6. Call the AI client with streaming
          await aiClient.stream(providerRequest, (chunk) => {
            if (chunk.done) {
              // finished
              return;
            }
            // Append chunk to the assistant message
            const currentMessages = get().messages;
            const assistantIndex = currentMessages.findIndex(
              (m) => m.id === assistantId
            );
            if (assistantIndex === -1) {
              // fallback: just update the last assistant
              get().updateLastMessage(chunk.content);
            } else {
              const updated = {
                ...currentMessages[assistantIndex],
                content: currentMessages[assistantIndex].content + chunk.content,
              };
              get().replaceMessageById(assistantId, updated);
            }
            // Also update streaming partial response (optional)
            set((state) => ({
              stream: {
                ...state.stream,
                partialResponse: state.stream.partialResponse + chunk.content,
              },
            }));
          });

          // 7. Streaming finished successfully
          set({
            isTyping: false,
            loading: false,
            stream: {
              isStreaming: false,
              partialResponse: '',
              requestId: undefined,
            },
          });

          abortController = null;
        } catch (error) {
          // Handle errors (including cancellation)
          const errorMessage = error instanceof Error ? error.message : String(error);
          set({
            isTyping: false,
            loading: false,
            lastError: errorMessage,
            stream: {
              isStreaming: false,
              partialResponse: '',
              requestId: undefined,
            },
          });
          abortController = null;
          // Re-throw so the caller can handle it
          throw error;
        }
      },

      /**
       * Stop the current generation.
       */
      stopGenerating: () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        set({
          isTyping: false,
          loading: false,
          stream: {
            isStreaming: false,
            partialResponse: '',
            requestId: undefined,
          },
        });
      },

      /**
       * Advanced: send an existing AIRequest directly.
       * Useful for retries or custom workflows.
       */
      sendRequest: async (request: AIRequest) => {
        // Similar to sendMessage but uses the provided request
        // (Implementation omitted for brevity – can be added later)
        throw new Error('Not implemented');
      },
    }),
    {
      name: 'ai-store',
      partialize: (state) => ({
        provider: state.provider,
        model: state.model,
        fallbackEnabled: state.fallbackEnabled,
        providerConfig: state.providerConfig,
        conversationId: state.conversationId,
        messages: state.messages,
        suggestions: state.suggestions,
        diagnostics: state.diagnostics,
      }),
    }
  )
);

/**
 * ------------------------------------------------------------------
 * Selectors
 * ------------------------------------------------------------------
 */

export const useAIProvider = () => useAIStore((state) => state.provider);
export const useAIModel = () => useAIStore((state) => state.model);
export const useAIMessages = () => useAIStore((state) => state.messages);
export const useAIStreaming = () => useAIStore((state) => state.stream);
export const useAITyping = () => useAIStore((state) => state.isTyping);
export const useAILoading = () => useAIStore((state) => state.loading);
export const useAISuggestions = () => useAIStore((state) => state.suggestions);
export const useAIDiagnostics = () => useAIStore((state) => state.diagnostics);
export const useAIRequest = () => useAIStore((state) => state.currentRequest);
export const useAIError = () => useAIStore((state) => state.lastError);

/**
 * Export a grouped actions selector for components.
 */
export const useAIActions = () =>
  useAIStore((state) => ({
    sendMessage: state.sendMessage,
    stopGenerating: state.stopGenerating,
    setProvider: state.setProvider,
    setModel: state.setModel,
    setProviderConfig: state.setProviderConfig,
    clearMessages: state.clearMessages,
    reset: state.reset,
  }));

/**
 * Export the store type for external use.
 */
export type AIStoreState = AIStore;
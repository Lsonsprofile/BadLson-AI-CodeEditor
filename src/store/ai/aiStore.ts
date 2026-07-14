// src/store/ai/aiStore.ts
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
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
import { aiClient } from '@/ai/client';
import { toProviderRequest } from '@/ai/requestAdapter';
import { useWorkspaceStore } from '@/store/workspaceStore';

export type AIStatus =
  | 'idle'
  | 'connecting'
  | 'sending'
  | 'waiting'
  | 'streaming'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'truncated';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ExtendedAIState extends AIState {
  status: AIStatus;
  truncated: boolean;
  tokenUsage: TokenUsage | null;
}

interface AIStore extends ExtendedAIState {
  setStatus: (status: AIStatus) => void;
  setTruncated: (truncated: boolean) => void;
  setTokenUsage: (usage: TokenUsage | null) => void;
  setProvider: (provider: AIProvider) => void;
  setModel: (model: string) => void;
  setProviderConfig: (updates: Partial<AIProviderConfig>) => void;
  setConversation: (id: string | null) => void;
  addMessage: (message: AIMessage) => void;
  updateLastMessage: (content: string, role?: AIMessage['role']) => void;
  replaceLastMessage: (message: AIMessage, role?: AIMessage['role']) => void;
  updateMessageById: (id: string, updates: Partial<AIMessage>) => void;
  replaceMessageById: (id: string, message: AIMessage) => void;
  clearMessages: () => void;
  setTyping: (typing: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFallbackEnabled: (enabled: boolean) => void;
  startStreaming: (requestId: string) => void;
  appendStreaming: (chunk: string) => void;
  finishStreaming: () => void;
  cancelStreaming: () => void;
  setCurrentRequest: (request: AIRequest | null) => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  clearSuggestions: () => void;
  setDiagnostics: (diagnostics: AIDiagnostic[]) => void;
  clearDiagnostics: () => void;
  reset: () => void;
  sendMessage: (content: string) => Promise<void>;
  stopGenerating: () => void;
  sendRequest: (request: AIRequest) => Promise<void>;
}

const DEFAULT_PROVIDER_CONFIG = Object.freeze({
  provider: 'openrouter',
  model: 'deepseek/deepseek-chat-v3-0324:free',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  stream: true,
  enabled: true,
} satisfies AIProviderConfig);

let abortController: AbortController | null = null;

const defaultStreamState: AIStreamState = {
  isStreaming: false,
  partialResponse: '',
  requestId: undefined,
};

const initialState: ExtendedAIState = {
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
  status: 'idle',
  truncated: false,
  tokenUsage: null,
};

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStatus: (status) => set({ status }),
      setTruncated: (truncated) => set({ truncated }),
      setTokenUsage: (tokenUsage) => set({ tokenUsage }),

      setProvider: (provider) =>
        set((state) => ({
          provider,
          providerConfig: { ...state.providerConfig, provider },
        })),

      setModel: (model) =>
        set((state) => ({
          model,
          providerConfig: { ...state.providerConfig, model },
        })),

      setProviderConfig: (updates) =>
        set((state) => ({
          providerConfig: { ...state.providerConfig, ...updates },
          provider: updates.provider ?? state.provider,
          model: updates.model ?? state.model,
        })),

      setConversation: (conversationId) => set({ conversationId }),

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

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
          messages[index] = { ...messages[index], content };
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
          messages[index] = { ...messages[index], ...updates };
          return { messages };
        }),

      replaceMessageById: (id, message) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) return state;
          const messages = [...state.messages];
          messages[index] = message;
          return { messages };
        }),

      clearMessages: () =>
        set({
          messages: [],
          conversationId: null,
          truncated: false,
          tokenUsage: null,
        }),

      setTyping: (isTyping) => set({ isTyping }),
      setLoading: (loading) => set({ loading }),
      setError: (lastError) => set({ lastError }),
      setFallbackEnabled: (fallbackEnabled) => set({ fallbackEnabled }),

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

      setCurrentRequest: (currentRequest) => set({ currentRequest }),

      setSuggestions: (suggestions) => set({ suggestions }),
      clearSuggestions: () => set({ suggestions: [] }),
      setDiagnostics: (diagnostics) => set({ diagnostics }),
      clearDiagnostics: () => set({ diagnostics: [] }),

      reset: () =>
        set((state) => ({
          ...initialState,
          provider: state.provider,
          model: state.model,
          fallbackEnabled: state.fallbackEnabled,
          providerConfig: state.providerConfig,
        })),

      sendMessage: async (content: string) => {
        if (get().loading) {
          throw new Error('Already processing a message');
        }

        set({ status: 'connecting', loading: true, isTyping: true, lastError: null, truncated: false, tokenUsage: null });

        const userMessage: AIMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          timestamp: Date.now(),
        };
        const assistantId = crypto.randomUUID();
        const assistantPlaceholder: AIMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };

        const conversation = [...get().messages, userMessage, assistantPlaceholder];

        set({
          messages: conversation,
          stream: { isStreaming: true, partialResponse: '', requestId: assistantId },
        });

        try {
          const storeState = get();
          const workspace = useWorkspaceStore.getState();

          const request: AIRequest = {
            id: crypto.randomUUID(),
            provider: storeState.provider,
            model: storeState.model,
            messages: conversation,
            projectFiles: workspace.files,
            activeFile: workspace.activeFile || null,
            recentFiles: workspace.openFiles,
            folders: workspace.folders,
            selectedCode: null,
            consoleErrors: [],
            buildErrors: [],
            cursorPosition: null,
            options: {
              temperature: storeState.providerConfig.temperature,
              maxTokens: storeState.providerConfig.maxTokens,
              topP: storeState.providerConfig.topP,
              stream: true,
            },
            timestamp: Date.now(),
          };

          abortController = new AbortController();
          const providerRequest = toProviderRequest(request);
          providerRequest.signal = abortController.signal;

          set({ status: 'sending' });

          let fullContent = '';

          const response = await aiClient.stream(providerRequest, (chunk) => {
            if (chunk.done) {
              set({
                status: 'completed',
                loading: false,
                isTyping: false,
                stream: {
                  isStreaming: false,
                  partialResponse: '',
                  requestId: undefined,
                },
              });
              return;
            }

            fullContent += chunk.content;

            get().replaceMessageById(assistantId, {
              id: assistantId,
              role: 'assistant',
              content: fullContent,
              timestamp: Date.now(),
            });

            set((state) => ({
              stream: {
                ...state.stream,
                partialResponse: state.stream.partialResponse + chunk.content,
              },
              status: state.status !== 'streaming' ? 'streaming' : state.status,
            }));
          });

          const finalMessages = get().messages;
          const finalAssistant = finalMessages.find((m) => m.id === assistantId);
          if (finalAssistant) {
            get().replaceMessageById(assistantId, {
              ...finalAssistant,
              content: fullContent,
            });
          }

          if (response.finishReason === 'length') {
            set({ truncated: true, status: 'truncated' });
            const current = get().messages.find((m) => m.id === assistantId);
            if (current) {
              get().replaceMessageById(assistantId, {
                ...current,
                content: current.content + '\n\n⚠️ **Response truncated** – the model reached its length limit. Try splitting your request.',
              });
            }
          }

          if (response.usage) {
            set({
              tokenUsage: {
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                totalTokens: response.usage.totalTokens,
              },
            });
          }

          set({ status: 'completed', loading: false, isTyping: false });
          abortController = null;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          set({
            loading: false,
            isTyping: false,
            lastError: errorMessage,
            status: errorMessage.includes('cancelled') ? 'cancelled' : 'error',
            stream: { isStreaming: false, partialResponse: '', requestId: undefined },
          });
          abortController = null;
          throw error;
        }
      },

      stopGenerating: () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        set({
          isTyping: false,
          loading: false,
          status: 'cancelled',
          stream: { isStreaming: false, partialResponse: '', requestId: undefined },
        });
      },

      sendRequest: async () => {
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
        // Limit persisted messages to last 20
        messages: state.messages.slice(-20),
        suggestions: state.suggestions.slice(-10),
        diagnostics: state.diagnostics.slice(-10),
      }),
    }
  )
);

// ─── SELECTORS ──────────────────────────────────────────────────────

export const useAIProvider = () => useAIStore((state) => state.provider);
export const useAIModel = () => useAIStore((state) => state.model);
export const useAIMessages = () => useAIStore((state) => state.messages);
export const useAIStreaming = () => useAIStore((state) => state.stream);
export const useAITyping = () => useAIStore((state) => state.isTyping);
export const useAILoading = () => useAIStore((state) => state.loading);
export const useAIStatus = () => useAIStore((state) => state.status);
export const useAITruncated = () => useAIStore((state) => state.truncated);
export const useAITokenUsage = () => useAIStore((state) => state.tokenUsage);
export const useAISuggestions = () => useAIStore((state) => state.suggestions);
export const useAIDiagnostics = () => useAIStore((state) => state.diagnostics);
export const useAIError = () => useAIStore((state) => state.lastError);

export const useAIActions = (): Pick<AIStore, 'sendMessage' | 'stopGenerating' | 'setProvider' | 'setModel' | 'setProviderConfig' | 'clearMessages' | 'reset'> =>
  useAIStore(
    useShallow((state) => ({
      sendMessage: state.sendMessage,
      stopGenerating: state.stopGenerating,
      setProvider: state.setProvider,
      setModel: state.setModel,
      setProviderConfig: state.setProviderConfig,
      clearMessages: state.clearMessages,
      reset: state.reset,
    }))
  );
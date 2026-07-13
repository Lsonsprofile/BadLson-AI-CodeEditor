// src/hooks/useChat.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import {
  sendChatMessageWithStore,
  streamChatMessageWithStore,
  clearCapturedErrors,
  type ChatApiResponse,
  type StreamCallbacks,
} from '../services/api';

// ─── TYPES ───────────────────────────────────────────────────────────

export interface EditNotification {
  filename: string;
  type: 'created' | 'replaced' | 'appended' | 'unchanged';
  status: 'success' | 'failed';
}

export interface UseChatOptions {
  onWillSend?: (message: string) => void;
  onMessageReceived?: (message: string) => void;
  onEditsApplied?: (edits: EditNotification[]) => void;
  onError?: (error: string) => void;
}

export interface UseChatReturn {
  send: (message: string) => Promise<void>;
  sendStream: (message: string) => Promise<void>;
  sendStandard: (message: string) => Promise<void>;
  isBusy: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  errorMessage: string | null;
  appliedEdits: EditNotification[];
  clearError: () => void;
  clearEdits: () => void;
  reset: () => void;
}

// ─── HOOK ────────────────────────────────────────────────────────────

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { onMessageReceived, onEditsApplied, onError } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appliedEdits, setAppliedEdits] = useState<EditNotification[]>([]);

  const {
    files,
    activeFile,
    chatHistory,
    addChatMessage,
    setIsAiTyping,
    aiProvider,
    updateFile,
  } = useWorkspaceStore();

  // ─── EDITOR CONTEXT ──────────────────────────────────────────────
  // Use editor store to get current selection and cursor
  const getEditorContext = useCallback(() => {
    const { context } = useEditorStore.getState();
    return {
      selectedCode: context?.selectedText || null,
      cursorPosition: context?.cursor || null,
    };
  }, []);

  // ─── ABORT CONTROLLER ─────────────────────────────────────────────
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── HELPERS ──────────────────────────────────────────────────────

  const clearError = useCallback(() => setErrorMessage(null), []);
  const clearEdits = useCallback(() => setAppliedEdits([]), []);
  const reset = useCallback(() => {
    clearError();
    clearEdits();
    setStreamingContent('');
    setIsLoading(false);
    setIsStreaming(false);
  }, [clearError, clearEdits]);

  // ─── APPLY EDITS ──────────────────────────────────────────────────

  const applyAiEdits = useCallback(
    (response: ChatApiResponse) => {
      if (!response.edits?.applied?.length && !response.updatedFiles) {
        return;
      }

      const notifications: EditNotification[] = [];

      if (response.updatedFiles) {
        Object.entries(response.updatedFiles).forEach(([filename, content]) => {
          const existing = files[filename];
          let type: EditNotification['type'] = 'unchanged';
          if (!existing) type = 'created';
          else if (content !== existing) type = 'replaced';

          if (type !== 'unchanged') {
            updateFile(filename, content);
          }
          notifications.push({ filename, type, status: 'success' });
        });
      }

      response.edits?.failed?.forEach(({ filename, reason }) => {
        notifications.push({ filename, type: 'unchanged', status: 'failed' });
        console.warn(`AI edit failed for ${filename}:`, reason);
      });

      if (notifications.length > 0) {
        setAppliedEdits((prev) => [...prev, ...notifications].slice(-10));
        setTimeout(() => {
          setAppliedEdits((prev) =>
            prev.filter((n) => !notifications.some((pn) => pn.filename === n.filename))
          );
        }, 8000);
        onEditsApplied?.(notifications);
      }

      clearCapturedErrors();
    },
    [files, updateFile, onEditsApplied]
  );

  // ─── SEND – STANDARD (NON‑STREAMING) ─────────────────────────────

  const sendStandard = useCallback(
    async (userMessage: string): Promise<void> => {
      if (!userMessage || isLoading || isStreaming) return;

      // Cancel previous request (if any)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      addChatMessage('user', userMessage);
      setIsLoading(true);
      setIsAiTyping(true);
      setErrorMessage(null);
      setAppliedEdits([]);

      try {
        const recentHistory = chatHistory.slice(-10);
        const { selectedCode, cursorPosition } = getEditorContext();

        // Pass selected code and cursor position to the API
        const response = await sendChatMessageWithStore(
          userMessage,
          recentHistory,
          aiProvider.provider,
          aiProvider.preferredOpenRouterModel,
          activeFile || undefined,
          selectedCode || undefined,
          cursorPosition || undefined
        );

        const aiMessage = response?.response?.trim() || 'The AI returned an empty response.';
        addChatMessage('ai', aiMessage);
        onMessageReceived?.(aiMessage);
        applyAiEdits(response);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('[useChat] Request aborted');
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown AI service error';
        setErrorMessage(message);
        onError?.(message);
        addChatMessage(
          'ai',
          `⚠️ AI service error: ${message}\n\nPlease check:\n• Backend server is running\n• API key is set in backend/.env\n• Network connection is stable`
        );
      } finally {
        setIsLoading(false);
        setIsAiTyping(false);
        abortControllerRef.current = null;
      }
    },
    [
      isLoading,
      isStreaming,
      addChatMessage,
      setIsAiTyping,
      chatHistory,
      aiProvider,
      activeFile,
      getEditorContext,
      applyAiEdits,
      onMessageReceived,
      onError,
    ]
  );

  // ─── SEND – STREAMING ─────────────────────────────────────────────

  const sendStream = useCallback(
    async (userMessage: string): Promise<void> => {
      if (!userMessage || isLoading || isStreaming) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      addChatMessage('user', userMessage);
      setIsStreaming(true);
      setIsAiTyping(true);
      setErrorMessage(null);
      setStreamingContent('');
      setAppliedEdits([]);

      const recentHistory = chatHistory.slice(-10);
      const { selectedCode, cursorPosition } = getEditorContext();
      let fullResponse = '';
      let streamError: string | null = null;

      try {
        const callbacks: StreamCallbacks = {
          onChunk: (chunk: string) => {
            fullResponse += chunk;
            setStreamingContent(fullResponse);
          },
          onDone: (metadata) => {
            console.log(`[useChat] Stream complete: ${metadata.provider}/${metadata.model}`);
          },
          onError: (err: string) => {
            streamError = err;
            setErrorMessage(err);
            onError?.(err);
          },
        };

        await streamChatMessageWithStore(
          userMessage,
          callbacks,
          recentHistory,
          aiProvider.provider,
          aiProvider.preferredOpenRouterModel,
          activeFile || undefined,
          selectedCode || undefined,
          cursorPosition || undefined
        );

        if (streamError) {
          addChatMessage('ai', `⚠️ AI streaming error: ${streamError}\n\nPlease try again.`);
          return;
        }

        const finalMessage = fullResponse.trim() || 'The AI returned an empty response.';
        addChatMessage('ai', finalMessage);
        onMessageReceived?.(finalMessage);
        setStreamingContent('');
        clearCapturedErrors();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('[useChat] Stream aborted');
          if (fullResponse.trim()) {
            addChatMessage('ai', fullResponse.trim() + '\n\n*[Stream interrupted]*');
          }
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown streaming error';
        setErrorMessage(message);
        onError?.(message);
        if (!fullResponse.trim()) {
          addChatMessage(
            'ai',
            `⚠️ AI streaming error: ${message}\n\nPlease check your connection and try again.`
          );
        } else {
          addChatMessage('ai', fullResponse.trim() + '\n\n*[Stream interrupted]*');
        }
      } finally {
        setIsStreaming(false);
        setIsAiTyping(false);
        abortControllerRef.current = null;
      }
    },
    [
      isLoading,
      isStreaming,
      addChatMessage,
      setIsAiTyping,
      chatHistory,
      aiProvider,
      activeFile,
      getEditorContext,
      onMessageReceived,
      onError,
    ]
  );

  // ─── SEND – AUTO-CHOOSE ──────────────────────────────────────────

  const send = useCallback(
    async (userMessage: string): Promise<void> => {
      if (aiProvider.provider === 'gemini') {
        await sendStream(userMessage);
      } else {
        await sendStandard(userMessage);
      }
    },
    [aiProvider.provider, sendStream, sendStandard]
  );

  // ─── CLEANUP ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ─── RETURN ──────────────────────────────────────────────────────

  return {
    send,
    sendStream,
    sendStandard,
    isBusy: isLoading || isStreaming,
    isLoading,
    isStreaming,
    streamingContent,
    errorMessage,
    appliedEdits,
    clearError,
    clearEdits,
    reset,
  };
}

export default useChat;
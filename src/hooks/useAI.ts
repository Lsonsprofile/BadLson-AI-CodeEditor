// src/hooks/useAI.ts

import { useCallback } from 'react';

import { aiService } from '@/ai/service';

import {
  useAIMessages,
  useAILoading,
  useAIStreaming,
  useAITyping,
  useAIError,
  useAIStore,
} from '@/store/ai/aiStore';

import type { AIRequest } from '@/store/ai/ai.types';

export function useAI() {
  const messages = useAIMessages();
  const loading = useAILoading();
  const streaming = useAIStreaming();
  const typing = useAITyping();
  const error = useAIError();

  const provider = useAIStore((state) => state.provider);
  const model = useAIStore((state) => state.model);

  const send = useCallback(
    async (request: AIRequest) => {
      return aiService.send(request);
    },
    []
  );

  const stream = useCallback(
    async (request: AIRequest) => {
      return aiService.stream(request);
    },
    []
  );

  const cancel = useCallback(() => {
    aiService.cancel();
  }, []);

  return {
    messages,

    loading,
    streaming,
    typing,
    error,

    provider,
    model,

    send,
    stream,
    cancel,
  };
}
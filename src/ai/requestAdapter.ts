// src/ai/requestAdapter.ts

import type { AIRequest } from '@/store/ai/ai.types';
import type { AIProviderRequest } from './types';

export function toProviderRequest(request: AIRequest): AIProviderRequest {
  return {
    provider: request.provider,
    model: request.model,
    messages: request.messages,
    temperature: request.options?.temperature,
    maxTokens: request.options?.maxTokens,
    topP: request.options?.topP,
    stream: request.options?.stream,
    signal: request.signal,
  };
}
// src/ai/requestAdapter.ts
// ─────────────────────────────────────────────────────────────────────
// Request Adapter — Converts AIRequest → AIProviderRequest
// ─────────────────────────────────────────────────────────────────────

import type { AIRequest } from '@/store/ai/ai.types';
import type { AIProviderRequest } from './types';

export function toProviderRequest(request: AIRequest): AIProviderRequest {
  // Filter out empty assistant placeholders to keep context clean
  const cleanMessages = request.messages.filter(
    (m) => !(m.role === 'assistant' && m.content.trim() === '')
  );

  return {
    provider: request.provider,
    model: request.model,
    messages: cleanMessages,

    // ✅ NEW: Forward all workspace context fields
    projectFiles: request.projectFiles,
    activeFile: request.activeFile,
    recentFiles: request.recentFiles,
    folders: request.folders,
    selectedCode: request.selectedCode,
    consoleErrors: request.consoleErrors,
    buildErrors: request.buildErrors,
    cursorPosition: request.cursorPosition,

    temperature: request.options?.temperature,
    maxTokens: request.options?.maxTokens,
    topP: request.options?.topP,
    stream: request.options?.stream,
    signal: request.signal,
  };
}
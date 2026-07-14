// src/store/ai/ai.types.ts
// ─────────────────────────────────────────────────────────────────────
// AI Type Definitions — Shared types for AI store, client, and components
// ─────────────────────────────────────────────────────────────────────

export type AIProvider = 'openrouter' | 'groq' | 'gemini';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  id?: string;
}

export interface AIRequest {
  id: string;
  provider: AIProvider;
  model: string;
  messages: AIMessage[];

  // ✅ NEW: Project context fields for backend awareness
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

  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stream?: boolean;
  };
  timestamp: number;
  signal?: AbortSignal; // ✅ enables clean cancellation for streaming and requests
}

export interface AIStreamState {
  isStreaming: boolean;
  partialResponse: string;
  requestId?: string;
}

export interface AISuggestion {
  id: string;
  text: string;
  category?: string;
  confidence?: number;
}

export interface AIDiagnostic {
  id: string;
  type: 'info' | 'warning' | 'error';
  message: string;
  code?: string;
  timestamp: number;
}

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  enabled: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  stream: boolean;
}

export interface AIState {
  provider: AIProvider;
  model: string;
  fallbackEnabled: boolean;
  conversationId: string | null;
  messages: AIMessage[];
  suggestions: AISuggestion[];
  diagnostics: AIDiagnostic[];
  currentRequest: AIRequest | null;
  stream: AIStreamState;
  isTyping: boolean;
  providerConfig: AIProviderConfig;
  loading: boolean;
  lastError: string | null;
  // editorContext removed – editor state lives exclusively in editorStore
}
export type AIProvider = 'openrouter' | 'groq' | 'gemini';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProviderRequest {
  provider: AIProvider;
  model: string;
  messages: AIMessage[];

  projectFiles?: Record<string, string>;
  activeFile?: string | null;
  recentFiles?: string[];
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
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIProviderResponse {
  id: string;
  provider: AIProvider;
  model: string;

  message: AIMessage;

  usage?: AIUsage;
  finishReason?: string;
}

export interface AIStreamChunk {
  id: string;
  content: string;
  done: boolean;
}

export interface AIProviderError {
  provider: AIProvider;
  message: string;
  code?: string;
  status?: number;
}

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
// src/ai/providers/groq.ts

import type { AIMessage } from '@/store/ai/ai.types';
import type {
  AIProviderRequest,
  AIProviderResponse,
  AIStreamChunk,
  AIProviderClient,
  AIUsage,
} from '@/ai/types';
import type { AIProviderSettings } from '@/ai/config';

interface GroqMessage {
  role: AIMessage['role'];
  content: string;
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

interface GroqResponse {
  id: string;
  model: string;
  choices: Array<{
    finish_reason?: string;
    message: {
      role: AIMessage['role'];
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqStreamChunk {
  id: string;
  model?: string;
  choices?: Array<{
    delta?: {
      role?: AIMessage['role'];
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqProvider implements AIProviderClient {
  readonly provider = 'groq' as const;

  private readonly config: AIProviderSettings;

  constructor(config: AIProviderSettings) {
    this.config = config;
  }

  private get apiKey(): string {
    if (!this.config.apiKey) {
      throw new Error('Groq API key is not configured');
    }
    return this.config.apiKey;
  }

  private createHeaders(): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    });

    if (this.config.headers) {
      for (const [key, value] of Object.entries(this.config.headers)) {
        headers.set(key, value);
      }
    }

    return headers;
  }

  private createBody(request: AIProviderRequest, stream: boolean): GroqRequest {
    return {
      model: request.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      stream,
    };
  }

  private normalizeUsage(usage?: GroqStreamChunk['usage']): AIUsage | undefined {
    if (!usage) return undefined;
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    };
  }

  /**
   * Process a single SSE line, updating the streaming state.
   */
  private processSseLine(
    line: string,
    state: {
      complete: string;
      finishReason?: string;
      usage?: AIUsage;
    },
    onChunk: (chunk: AIStreamChunk) => void,
    requestId: string
  ): void {
    if (!line.startsWith('data:')) return;
    const payload = line.replace(/^data:\s*/, '');
    if (payload === '[DONE]') return;

    try {
      const parsed = JSON.parse(payload) as GroqStreamChunk;

      state.usage = this.normalizeUsage(parsed.usage) ?? state.usage;

      const delta = parsed.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        state.complete += delta;
        onChunk({
          id: requestId,
          content: delta,
          done: false,
        });
      }

      state.finishReason = parsed.choices?.[0]?.finish_reason ?? state.finishReason;
    } catch {
      // ignore malformed chunks
    }
  }

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(this.createBody(request, false)),
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as GroqResponse;
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('Groq returned no response choices');
    }

    return {
      id: data.id,
      provider: this.provider,
      model: data.model,
      message: {
        id: crypto.randomUUID(),
        role: choice.message.role,
        content: choice.message.content,
        timestamp: Date.now(),
      },
      finishReason: choice.finish_reason,
      usage: this.normalizeUsage(data.usage),
    };
  }

  async stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse> {
    const streamId = crypto.randomUUID();

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(this.createBody(request, true)),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      const error = response.ok ? 'Missing response body' : await response.text();
      throw new Error(`Groq stream error (${response.status}): ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const state = {
      complete: '',
      finishReason: undefined as string | undefined,
      usage: undefined as AIUsage | undefined,
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          this.processSseLine(line, state, onChunk, streamId);
        }
      }

      // Flush remaining buffer
      buffer += decoder.decode();
      if (buffer) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          this.processSseLine(line, state, onChunk, streamId);
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // reader already closed
      }
    }

    onChunk({
      id: streamId,
      content: '',
      done: true,
    });

    return {
      id: streamId,
      provider: this.provider,
      model: request.model,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: state.complete,
        timestamp: Date.now(),
      },
      finishReason: state.finishReason,
      usage: state.usage,
    };
  }
}
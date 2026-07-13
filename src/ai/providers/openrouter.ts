// src/ai/providers/openrouter.ts

import type { AIMessage } from '@/store/ai/ai.types';
import type {
  AIProviderRequest,
  AIProviderResponse,
  AIStreamChunk,
  AIProviderClient,
  AIUsage,
} from '@/ai/types';
import type { AIProviderSettings } from '@/ai/config';

interface OpenRouterMessage {
  role: AIMessage['role'];
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

interface OpenRouterResponse {
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

interface OpenRouterStreamChunk {
  id: string;
  model: string;
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterProvider implements AIProviderClient {
  readonly provider = 'openrouter' as const;

  private readonly config: AIProviderSettings;

  constructor(config: AIProviderSettings) {
    this.config = config;
  }

  private get apiKey(): string {
    if (!this.config.apiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    return this.config.apiKey;
  }

  private get baseUrl(): string {
    return this.config.baseUrl;
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

    if (typeof window !== 'undefined') {
      if (!headers.has('X-Title')) {
        headers.set('X-Title', 'BadLson AI Code Editor');
      }
      if (!headers.has('HTTP-Referer')) {
        headers.set('HTTP-Referer', window.location.origin);
      }
    }

    return headers;
  }

  private createBody(
    request: AIProviderRequest,
    stream: boolean
  ): OpenRouterRequest {
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
      const parsed = JSON.parse(payload) as OpenRouterStreamChunk;

      if (parsed.usage) {
        state.usage = {
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
          totalTokens: parsed.usage.total_tokens,
        };
      }

      const delta = parsed.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        state.complete += delta;
        onChunk({
          id: requestId,
          content: delta,
          done: false,
        });
      }

      if (parsed.choices?.[0]?.finish_reason) {
        state.finishReason = parsed.choices[0].finish_reason;
      }
    } catch {
      // ignore malformed chunks
    }
  }

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(this.createBody(request, false)),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('OpenRouter returned no response choices');
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
      usage: data.usage && {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }

  async stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse> {
    const streamId = crypto.randomUUID();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify(this.createBody(request, true)),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = response.ok
        ? 'Missing response body'
        : await response.text();
      throw new Error(`OpenRouter stream error (${response.status}): ${errorText}`);
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

      buffer += decoder.decode(); // final flush
      if (buffer) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          this.processSseLine(line, state, onChunk, streamId);
        }
      }
    } finally {
      // ✅ safely cancel reader, ignore errors if already closed
      try {
        await reader.cancel();
      } catch {
        // reader already closed – safe to ignore
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
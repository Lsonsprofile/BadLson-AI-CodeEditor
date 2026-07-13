// src/ai/providers/gemini.ts

import type { AIMessage } from '@/store/ai/ai.types';
import type {
  AIProviderRequest,
  AIProviderResponse,
  AIStreamChunk,
  AIProviderClient,
  AIUsage,
} from '@/ai/types';
import type { AIProviderSettings } from '@/ai/config';

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GeminiProvider implements AIProviderClient {
  readonly provider = 'gemini' as const;

  private readonly config: AIProviderSettings;

  constructor(config: AIProviderSettings) {
    this.config = config;
  }

  private get apiKey(): string {
    if (!this.config.apiKey) {
      throw new Error('Gemini API key is not configured');
    }
    return this.config.apiKey;
  }

  private createBody(request: AIProviderRequest): GeminiRequest {
    return {
      contents: request.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        topP: request.topP,
      },
    };
  }

  private normalizeUsage(
    usage?: GeminiStreamChunk['usageMetadata']
  ): AIUsage | undefined {
    if (!usage) return undefined;
    return {
      promptTokens: usage.promptTokenCount ?? 0,
      completionTokens: usage.candidatesTokenCount ?? 0,
      totalTokens: usage.totalTokenCount ?? 0,
    };
  }

  private buildUrl(stream: boolean, model: string): string {
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    const query = stream ? '&alt=sse' : '';
    return `${this.config.baseUrl}/models/${model}:${action}?key=${this.apiKey}${query}`;
  }

  /**
   * Process a single SSE line (Gemini uses SSE only when streaming with alt=sse).
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
      const parsed = JSON.parse(payload) as GeminiStreamChunk;

      state.usage = this.normalizeUsage(parsed.usageMetadata) ?? state.usage;

      const text =
        parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

      if (text) {
        state.complete += text;
        onChunk({
          id: requestId,
          content: text,
          done: false,
        });
      }

      state.finishReason = parsed.candidates?.[0]?.finishReason ?? state.finishReason;
    } catch {
      // ignore malformed chunks
    }
  }

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    const response = await fetch(this.buildUrl(false, request.model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.createBody(request)),
      signal: request.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const content =
      candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    return {
      id: crypto.randomUUID(),
      provider: this.provider,
      model: request.model,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
      },
      finishReason: candidate?.finishReason,
      usage: this.normalizeUsage(data.usageMetadata),
    };
  }

  async stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse> {
    const streamId = crypto.randomUUID();

    const response = await fetch(this.buildUrl(true, request.model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.createBody(request)),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      const error = response.ok ? 'Missing response body' : await response.text();
      throw new Error(`Gemini stream error (${response.status}): ${error}`);
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
        // already closed
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
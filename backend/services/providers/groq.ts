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

// Model capability map (max output tokens, context window)
const GROQ_MODEL_CAPABILITIES: Record<string, { maxOutput: number; context: number }> = {
  'meta-llama/llama-4-scout-17b-16e-instruct': { maxOutput: 8192, context: 131072 },
  'llama-3.3-70b-versatile': { maxOutput: 8192, context: 131072 },
  'llama-3.1-8b-instant': { maxOutput: 8192, context: 131072 },
  'gemma2-9b-it': { maxOutput: 8192, context: 8192 },
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert coding assistant integrated into a code editor. Follow these rules strictly:
- Respond in Markdown format.
- Wrap all code in fenced code blocks with the appropriate language.
- Preserve indentation and whitespace.
- Explain compilation or runtime errors clearly.
- If the user's question is ambiguous, ask for clarification.
- If you need to see more files, ask the user to share them.
- Never invent code that is not present in the context.
- If the prompt exceeds the model's context window, inform the user and suggest shortening the input.`;

export class GroqProvider implements AIProviderClient {
  readonly provider = 'groq' as const;

  private readonly config: AIProviderSettings;
  private readonly systemPrompt: string;

  constructor(config: AIProviderSettings, systemPrompt?: string) {
    this.config = config;
    this.systemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
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
    // Ensure system message is first, if not already present
    const messages: GroqMessage[] = [];
    const hasSystem = request.messages.some((m) => m.role === 'system');
    if (!hasSystem) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }
    messages.push(...request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })));

    // Sanitize maxTokens
    let maxTokens = request.maxTokens;
    if (maxTokens === undefined || maxTokens < 1) {
      maxTokens = 4096; // default
    }
    // Cap based on model capabilities
    const caps = GROQ_MODEL_CAPABILITIES[request.model];
    if (caps && maxTokens > caps.maxOutput) {
      maxTokens = caps.maxOutput;
    }

    return {
      model: request.model,
      messages,
      temperature: request.temperature,
      max_tokens: maxTokens,
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

  private handleError(response: Response, text: string): never {
    let message = `Groq API error (${response.status})`;
    switch (response.status) {
      case 401:
        message = 'Groq API key is invalid. Please check your configuration.';
        break;
      case 413:
        message = 'The prompt is too long for the selected model. Please shorten your input or switch to a model with larger context.';
        break;
      case 429:
        message = 'Groq rate limit exceeded. Please wait and try again.';
        break;
      case 500:
        message = 'Groq service is currently experiencing issues. Please try again later.';
        break;
      default:
        if (text) message += `: ${text}`;
        break;
    }
    throw new Error(message);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 60000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. The AI provider took too long to respond.');
      }
      throw error;
    }
  }

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    const body = this.createBody(request, false);
    const response = await this.fetchWithTimeout(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.createHeaders(),
        body: JSON.stringify(body),
        signal: request.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.handleError(response, errorText);
    }

    const data = (await response.json()) as GroqResponse;
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('Groq returned no response choices');
    }

    // Validate response content
    const content = choice.message.content?.trim();
    if (!content) {
      throw new Error('Groq returned an empty response. Please try again.');
    }

    return {
      id: data.id,
      provider: this.provider,
      model: data.model,
      message: {
        id: crypto.randomUUID(),
        role: choice.message.role,
        content: content,
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
    const body = this.createBody(request, true);

    const response = await this.fetchWithTimeout(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.createHeaders(),
        body: JSON.stringify(body),
        signal: request.signal,
      }
    );

    if (!response.ok || !response.body) {
      const errorText = response.ok ? 'Missing response body' : await response.text();
      this.handleError(response, errorText);
    }

    const reader = response.body!.getReader();
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

    // Validate final content
    if (!state.complete.trim()) {
      throw new Error('Groq stream returned an empty response.');
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
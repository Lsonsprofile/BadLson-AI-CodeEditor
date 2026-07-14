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
  systemInstruction?: {
    parts: [{ text: string }];
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

// Gemini model capabilities (max output tokens, context)
const GEMINI_MODEL_CAPABILITIES: Record<string, { maxOutput: number; context: number }> = {
  'gemini-2.5-pro': { maxOutput: 8192, context: 1048576 },
  'gemini-2.5-flash': { maxOutput: 8192, context: 1048576 },
  'gemini-2.0-flash': { maxOutput: 8192, context: 1048576 },
  'gemini-1.5-pro': { maxOutput: 8192, context: 2097152 },
  'gemini-1.5-flash': { maxOutput: 8192, context: 1048576 },
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

export class GeminiProvider implements AIProviderClient {
  readonly provider = 'gemini' as const;

  private readonly config: AIProviderSettings;
  private readonly systemPrompt: string;

  constructor(config: AIProviderSettings, systemPrompt?: string) {
    this.config = config;
    this.systemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  }

  private get apiKey(): string {
    const key = this.config.apiKey?.trim();

    if (!key) {
      throw new Error('Gemini API key is not configured');
    }

    return key;
  }

  private createBody(request: AIProviderRequest): GeminiRequest {
    // Add system instruction if not present
    let systemInstruction: { parts: [{ text: string }] } | undefined;
    const hasSystem = request.messages.some((m) => m.role === 'system');
    if (!hasSystem) {
      systemInstruction = { parts: [{ text: this.systemPrompt }] };
    }

    // ✅ FIX: Explicitly cast role to 'user' | 'model'
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((message) => ({
        role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: message.content }],
      }));

    // Sanitize maxTokens
    let maxOutputTokens = request.maxTokens;
    if (maxOutputTokens === undefined || maxOutputTokens < 1) {
      maxOutputTokens = 4096;
    }
    const caps = GEMINI_MODEL_CAPABILITIES[request.model];
    if (caps && maxOutputTokens > caps.maxOutput) {
      maxOutputTokens = caps.maxOutput;
    }

    return {
      contents,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens,
        topP: request.topP,
      },
      systemInstruction,
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

  private handleError(response: Response, text: string): never {
    let message = `Gemini API error (${response.status})`;
    switch (response.status) {
      case 401:
        message = 'Gemini API key is invalid. Please check your configuration.';
        break;
      case 413:
        message = 'The prompt is too long for the selected model. Please shorten your input or switch to a model with larger context.';
        break;
      case 429:
        message = 'Gemini rate limit exceeded. Please wait and try again.';
        break;
      case 500:
        message = 'Gemini service is currently experiencing issues. Please try again later.';
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
    const response = await this.fetchWithTimeout(
      this.buildUrl(false, request.model),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.createBody(request)),
        signal: request.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.handleError(response, errorText);
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const content =
      candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    if (!content.trim()) {
      throw new Error('Gemini returned an empty response. Please try again.');
    }

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

    const response = await this.fetchWithTimeout(
      this.buildUrl(true, request.model),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.createBody(request)),
        signal: request.signal,
      }
    );

    if (!response.ok || !response.body) {
      const error = response.ok ? 'Missing response body' : await response.text();
      this.handleError(response, error);
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

    if (!state.complete.trim()) {
      throw new Error('Gemini stream returned an empty response.');
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
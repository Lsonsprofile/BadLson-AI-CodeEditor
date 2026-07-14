// backend/services/providers/openrouter.mjs

import { BaseAIProvider } from './base.mjs';

const DEFAULT_SYSTEM_PROMPT = `You are an expert coding assistant integrated into a code editor. Follow these rules strictly:
- Respond in Markdown format.
- Wrap all code in fenced code blocks with the appropriate language.
- Preserve indentation and whitespace.
- Explain compilation or runtime errors clearly.
- If the user's question is ambiguous, ask for clarification.
- If you need to see more files, ask the user to share them.
- Never invent code that is not present in the context.
- If the prompt exceeds the model's context window, inform the user and suggest shortening the input.`;

// Model capabilities (common models)
const OPENROUTER_MODEL_CAPABILITIES = {
  'openai/gpt-4o': { maxOutput: 4096, context: 128000 },
  'openai/gpt-4-turbo': { maxOutput: 4096, context: 128000 },
  'anthropic/claude-3.5-sonnet': { maxOutput: 8192, context: 200000 },
  'anthropic/claude-3-opus': { maxOutput: 4096, context: 200000 },
  'google/gemini-2.0-flash-001': { maxOutput: 8192, context: 1048576 },
  'mistralai/mistral-large-2411': { maxOutput: 8192, context: 131072 },
  'meta-llama/llama-3.3-70b-instruct:free': { maxOutput: 8192, context: 131072 },
  // fallback
  'default': { maxOutput: 4096, context: 32768 },
};

export class OpenRouterProvider extends BaseAIProvider {
  constructor(config, systemPrompt) {
    super();
    this.config = config;
    this.systemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  }

  get provider() {
    return 'openrouter';
  }

  get apiKey() {
    if (!this.config.apiKey) {
      throw new Error('OpenRouter API key is not configured');
    }
    return this.config.apiKey;
  }

  get baseUrl() {
    return this.config.baseUrl;
  }

  createHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Title': 'BadLson AI Code Editor',
    };

    if (this.config.headers) {
      for (const [key, value] of Object.entries(this.config.headers)) {
        headers[key] = value;
      }
    }

    return headers;
  }

  createBody(request, stream) {
    // Inject system prompt
    const messages = [];
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
      maxTokens = 4096;
    }
    const caps = OPENROUTER_MODEL_CAPABILITIES[request.model] || OPENROUTER_MODEL_CAPABILITIES['default'];
    if (maxTokens > caps.maxOutput) {
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

  normalizeUsage(usage) {
    if (!usage) return undefined;
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    };
  }

  processSseLine(line, state, onChunk, requestId) {
    if (!line.startsWith('data:')) return;
    const payload = line.replace(/^data:\s*/, '');
    if (payload === '[DONE]') return;

    try {
      const parsed = JSON.parse(payload);

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

  handleError(response, text) {
    let message = `OpenRouter API error (${response.status})`;
    switch (response.status) {
      case 401:
        message = 'OpenRouter API key is invalid. Please check your configuration.';
        break;
      case 413:
        message = 'The prompt is too long for the selected model. Please shorten your input or switch to a model with larger context.';
        break;
      case 429:
        message = 'OpenRouter rate limit exceeded. Please wait and try again.';
        break;
      case 500:
        message = 'OpenRouter service is currently experiencing issues. Please try again later.';
        break;
      default:
        if (text) message += `: ${text}`;
        break;
    }
    throw new Error(message);
  }

  async fetchWithTimeout(url, options, timeoutMs = 60000) {
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

  async send(request) {
    const body = this.createBody(request, false);
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
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

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('OpenRouter returned no response choices');
    }

    const content = choice.message.content?.trim();
    if (!content) {
      throw new Error('OpenRouter returned an empty response. Please try again.');
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

  async stream(request, onChunk) {
    const streamId = crypto.randomUUID();
    const body = this.createBody(request, true);

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const state = {
      complete: '',
      finishReason: undefined,
      usage: undefined,
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
      throw new Error('OpenRouter stream returned an empty response.');
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
// src/ai/client.ts

import type {
  AIProviderClient,
  AIProviderRequest,
  AIProviderResponse,
  AIStreamChunk,
} from './types';

import { OpenRouterProvider } from './providers/openrouter';
import { GroqProvider } from './providers/groq';
import { GeminiProvider } from './providers/gemini';

import { aiConfig, type AIConfig, type AIProviderSettings } from './config';
import type { AIProvider } from '@/store/ai/ai.types';

export class AIClient {
  private readonly providers = new Map<AIProvider, AIProviderClient>();
  private readonly config: AIConfig;
  private readonly providerFactories: Record<
    AIProvider,
    (config: AIProviderSettings) => AIProviderClient
  >;

  constructor(config: AIConfig = aiConfig) {
    this.config = config;

    this.providerFactories = {
      openrouter: (cfg) => new OpenRouterProvider(cfg),
      groq: (cfg) => new GroqProvider(cfg),
      gemini: (cfg) => new GeminiProvider(cfg),
    };
  }

  /**
   * Lazy‑load a provider. If not yet instantiated, create it.
   */
  getProvider(provider: AIProvider): AIProviderClient {
    let client = this.providers.get(provider);
    if (!client) {
      const config = this.config[provider];
      if (!config.enabled) {
        throw new Error(`AI provider "${provider}" is disabled in config.`);
      }
      const factory = this.providerFactories[provider];
      if (!factory) {
        throw new Error(`No factory registered for provider "${provider}".`);
      }
      client = factory(config);
      this.providers.set(provider, client);
    }
    return client;
  }

  private async executeWithRetryAndFallback<T>(
    request: AIProviderRequest,
    executor: (provider: AIProviderClient, req: AIProviderRequest) => Promise<T>
  ): Promise<T> {
    const primary = request.provider;
    const fallbackChain = this.config.fallbackOrder ?? [primary];

    const providersToTry: AIProvider[] = [];
    const seen = new Set<AIProvider>();
    for (const p of [primary, ...fallbackChain]) {
      if (!seen.has(p) && this.config[p].enabled) {
        seen.add(p);
        providersToTry.push(p);
      }
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries + 1; attempt++) {
      for (const provider of providersToTry) {
        try {
          const client = this.getProvider(provider);
          const timeoutMs = this.config[provider].timeout ?? this.config.requestTimeout;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          const mergedSignal = request.signal
            ? this.anySignal([request.signal, controller.signal])
            : controller.signal;

          const reqWithTimeout = {
            ...request,
            signal: mergedSignal,
          };

          const result = await executor(client, reqWithTimeout);
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
      if (attempt < this.config.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('All providers failed after retries.');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private anySignal(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', onAbort);
    }
    return controller.signal;
  }

  // ---------- Public API ----------

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    return this.executeWithRetryAndFallback(request, (client, req) =>
      client.send(req)
    );
  }

  async stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse> {
    return this.executeWithRetryAndFallback(request, (client, req) =>
      client.stream(req, onChunk)
    );
  }

  hasProvider(provider: AIProvider): boolean {
    return !!this.config[provider]?.enabled;
  }

  getProviders(): AIProvider[] {
    return Object.keys(this.config).filter(
      (key) =>
        key !== 'defaultProvider' &&
        key !== 'fallbackOrder' &&
        key !== 'requestTimeout' &&
        key !== 'maxRetries' &&
        typeof this.config[key as keyof AIConfig] === 'object' &&
        (this.config[key as keyof AIConfig] as AIProviderSettings).enabled
    ) as AIProvider[];
  }

  getDefaultProvider(): AIProvider {
    return this.config.defaultProvider;
  }

  getConfig(provider: AIProvider): typeof this.config[typeof provider] {
    return this.config[provider];
  }
}

export const aiClient = new AIClient();
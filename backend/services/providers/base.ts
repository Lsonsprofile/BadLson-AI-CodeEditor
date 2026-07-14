// backend/services/providers/base.ts

import type {
  AIProvider,
  AIProviderClient,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  AIStreamChunk,
} from '../types';

/**
 * Base class for all AI providers.
 *
 * Shared responsibilities:
 * - Request validation
 * - HTTP header creation
 * - Error normalization
 * - Safe JSON parsing
 *
 * Provider-specific responsibilities:
 * - Endpoint URL
 * - Request body format
 * - Response mapping
 * - Streaming implementation
 */
export abstract class BaseAIProvider implements AIProviderClient {
  /**
   * Provider identifier.
   */
  abstract readonly provider: AIProvider;

  /**
   * Send a non-streaming request.
   */
  abstract send(
    request: AIProviderRequest
  ): Promise<AIProviderResponse>;

  /**
   * Send a streaming request.
   */
  abstract stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse>;

  /**
   * Validate a request before sending it.
   */
  protected validateRequest(request: AIProviderRequest): void {
    if (!request.model) {
      throw new Error('AI model is required.');
    }

    if (request.messages.length === 0) {
      throw new Error('At least one message is required.');
    }
  }

  /**
   * Build standard JSON headers.
   */
  protected createHeaders(apiKey: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  /**
   * Parse a JSON response safely.
   */
  protected async parseJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        text || `HTTP ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Normalize provider-specific errors.
   */
  protected normalizeError(error: unknown): AIProviderError {
    if (error instanceof Error) {
      return {
        provider: this.provider,
        message: error.message,
      };
    }

    return {
      provider: this.provider,
      message: 'Unknown AI provider error.',
    };
  }

  /**
   * Wrap provider calls with consistent validation
   * and error normalization.
   */
  protected async execute<T>(
    request: AIProviderRequest,
    operation: () => Promise<T>
  ): Promise<T> {
    this.validateRequest(request);

    try {
      return await operation();
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
}
// backend/services/providers/base.mjs

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
export class BaseAIProvider {
  /**
   * Provider identifier.
   * Must be overridden by subclasses.
   */
  get provider() {
    throw new Error('Provider must override the provider getter');
  }

  /**
   * Send a non-streaming request.
   * Must be overridden by subclasses.
   */
  async send(request) {
    throw new Error('Provider must implement send()');
  }

  /**
   * Send a streaming request.
   * Must be overridden by subclasses.
   */
  async stream(request, onChunk) {
    throw new Error('Provider must implement stream()');
  }

  /**
   * Validate a request before sending it.
   */
  validateRequest(request) {
    if (!request.model) {
      throw new Error('AI model is required.');
    }

    if (!request.messages || request.messages.length === 0) {
      throw new Error('At least one message is required.');
    }
  }

  /**
   * Build standard JSON headers.
   */
  createHeaders(apiKey) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  /**
   * Parse a JSON response safely.
   */
  async parseJson(response) {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Normalize provider-specific errors.
   */
  normalizeError(error) {
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
  async execute(request, operation) {
    this.validateRequest(request);

    try {
      return await operation();
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
}
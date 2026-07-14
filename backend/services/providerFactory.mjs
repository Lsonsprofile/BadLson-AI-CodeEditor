// backend/services/providerFactory.mjs

import { OpenRouterProvider } from './providers/openrouter.mjs';
import { GroqProvider } from './providers/groq.mjs';
import { GeminiProvider } from './providers/gemini.mjs';

/**
 * Create a provider instance based on the provider name.
 * @param {string} providerName - 'openrouter', 'groq', or 'gemini'
 * @returns {object} Provider instance with send() and stream() methods
 */
export function createProvider(providerName) {
  switch (providerName) {
    case 'openrouter':
      return new OpenRouterProvider({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'deepseek/deepseek-chat:free',
        enabled: true,
        headers: {
          'X-Title': 'BadLson AI Code Editor',
        },
      });
    case 'groq':
      return new GroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
        enabled: true,
      });
    case 'gemini':
      return new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultModel: 'gemini-2.5-flash',
        enabled: true,
      });
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}
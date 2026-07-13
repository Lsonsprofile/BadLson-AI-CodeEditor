// src/ai/config.ts

import type { AIProvider } from '@/store/ai/ai.types';

export interface AIProviderSettings {
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  headers?: Record<string, string>;
  timeout?: number;      // per‑provider timeout (overrides global)
  maxRetries?: number;   // per‑provider retries
}

export interface AIConfig {
  defaultProvider: AIProvider;
  fallbackOrder?: AIProvider[]; // ordered list of providers to try on failure
  openrouter: AIProviderSettings;
  groq: AIProviderSettings;
  gemini: AIProviderSettings;
  requestTimeout: number;
  maxRetries: number;
}

export const aiConfig = {
  defaultProvider: 'openrouter',
  fallbackOrder: ['openrouter', 'groq', 'gemini'], // 👈 fallback chain

  openrouter: {
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    enabled: true,
    headers: {
      'X-Title': 'BadLson AI Code Editor',
    },
  },

  groq: {
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    enabled: true,
  },

  gemini: {
    apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    enabled: true,
  },

  requestTimeout: 30_000,
  maxRetries: 2,
} satisfies AIConfig;
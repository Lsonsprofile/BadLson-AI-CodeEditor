// src/ai/providerConfig.ts
import { Globe, Zap, Brain, type LucideIcon } from 'lucide-react';

export type AiProviderKey = 'openrouter' | 'groq' | 'gemini';

export interface ProviderConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: LucideIcon;
  desc: string;
}

// ─── DEFAULT CONFIG (used as fallback for unknown keys) ──────────
const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  label: 'Unknown',
  color: 'text-slate-400',
  bg: 'bg-slate-500/10',
  border: 'border-slate-500/20',
  icon: Globe,
  desc: 'Unknown provider',
};

export const PROVIDER_CONFIG: Record<AiProviderKey, ProviderConfig> = {
  openrouter: {
    label: 'OpenRouter',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: Globe,
    desc: 'Free models rotation',
  },
  groq: {
    label: 'Groq',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Zap,
    desc: 'Fast inference',
  },
  gemini: {
    label: 'Gemini',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    icon: Brain,
    desc: 'Google AI',
  },
};

export const PROVIDER_KEYS = Object.keys(PROVIDER_CONFIG) as AiProviderKey[];

/**
 * Get provider config with fallback for unknown keys.
 * This prevents runtime errors when accessing undefined properties.
 */
export function getProviderConfig(key: string | AiProviderKey): ProviderConfig {
  if (key && key in PROVIDER_CONFIG) {
    return PROVIDER_CONFIG[key as AiProviderKey];
  }
  // Return a copy of the default config to avoid mutation
  return { ...DEFAULT_PROVIDER_CONFIG };
}

/**
 * Type guard to check if a string is a valid provider key.
 */
export function isProviderKey(key: string): key is AiProviderKey {
  return key in PROVIDER_CONFIG;
}

/**
 * Safely get a specific config value with optional fallback.
 * Useful for accessing nested properties without optional chaining every time.
 */
export function getProviderValue<K extends keyof ProviderConfig>(
  key: string | AiProviderKey,
  field: K
): ProviderConfig[K] {
  const config = getProviderConfig(key);
  return config[field];
}
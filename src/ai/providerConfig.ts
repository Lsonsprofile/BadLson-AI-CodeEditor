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

export function getProviderConfig(key: AiProviderKey): ProviderConfig {
  return PROVIDER_CONFIG[key];
}

export function isProviderKey(key: string): key is AiProviderKey {
  return key in PROVIDER_CONFIG;
}
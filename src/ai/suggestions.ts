// src/ai/suggestions.ts
import { Wand2, Code, Bug, Lightbulb, Loader2, type LucideIcon } from 'lucide-react';

export interface AiSuggestion {
  icon: LucideIcon;
  text: string;
  color: string;
}

export const AI_SUGGESTIONS: AiSuggestion[] = [
  {
    icon: Wand2,
    text: 'Make the hero headline larger and purple',
    color: 'text-violet-400',
  },
  {
    icon: Code,
    text: 'Add an interactive FAQ list with slide details',
    color: 'text-blue-400',
  },
  {
    icon: Lightbulb,
    text: 'Add a dark/light mode toggle function',
    color: 'text-yellow-400',
  },
  {
    icon: Bug,
    text: 'Fix any responsive issues in the CSS',
    color: 'text-red-400',
  },
  {
    icon: Loader2,
    text: 'Add smooth scroll animations',
    color: 'text-emerald-400',
  },
];

/**
 * Get a random suggestion from the list
 */
export function getRandomSuggestion(): AiSuggestion {
  return AI_SUGGESTIONS[Math.floor(Math.random() * AI_SUGGESTIONS.length)];
}

/**
 * Get suggestions filtered by a search term
 */
export function getFilteredSuggestions(query: string): AiSuggestion[] {
  if (!query.trim()) return AI_SUGGESTIONS;
  const lower = query.toLowerCase();
  return AI_SUGGESTIONS.filter((s) =>
    s.text.toLowerCase().includes(lower)
  );
}
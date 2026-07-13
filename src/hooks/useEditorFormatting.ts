// src/hooks/useEditorFormatting.ts

import { useCallback } from 'react';
import {
  formatHTML,
  formatCSS,
  formatJS,
  getFileLanguage,
} from '../utils/formatter';
import { saveContent } from '../lib/fileStorage';
import { useWorkspaceStore } from '../store/workspaceStore';

type Formatter = (code: string) => string;

const formatters: Record<string, Formatter> = {
  html: formatHTML,
  css: formatCSS,
  javascript: formatJS,
};

export function useEditorFormatting() {
  const { activeFile, updateFile } = useWorkspaceStore();

  const formatContent = useCallback(
    async (content: string): Promise<string> => {
      if (!activeFile) {
        return content;
      }

      const language = getFileLanguage(activeFile);

      const formatter = formatters[language];

      if (!formatter) {
        return content;
      }

      const formatted = formatter(content);

      updateFile(activeFile, formatted);

      try {
        await saveContent(activeFile, formatted);
      } catch (error) {
        console.error('Failed to save formatted file:', error);
      }

      return formatted;
    },
    [activeFile, updateFile]
  );

  return {
    formatContent,
  };
}
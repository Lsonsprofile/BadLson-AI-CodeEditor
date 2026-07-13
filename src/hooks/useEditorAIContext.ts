// src/hooks/useEditorAIContext.ts

import { useEffect } from 'react';
import type { editor as MonacoEditorType } from 'monaco-editor';
import { useWorkspaceStore } from '../store/workspaceStore';
import { getFileLanguage } from '../utils/formatter';

export interface EditorAIContext {
  activeFile: string;
  language: string;
  selectedText: string;
  fullText: string;
  cursor: {
    line: number;
    column: number;
  };
}

declare global {
  interface Window {
    __editorAIContext?: EditorAIContext;
  }
}

interface UseEditorAIContextOptions {
  editor: MonacoEditorType.IStandaloneCodeEditor | null;
}

export function useEditorAIContext({
  editor,
}: UseEditorAIContextOptions) {
  const { activeFile } = useWorkspaceStore();

  useEffect(() => {
    if (!editor || !activeFile) {
      return;
    }

    const updateContext = () => {
      const model = editor.getModel();

      if (!model) return;

      const selection = editor.getSelection();

      window.__editorAIContext = {
        activeFile,
        language: getFileLanguage(activeFile),
        selectedText: selection
          ? model.getValueInRange(selection)
          : '',
        fullText: model.getValue(),
        cursor: {
          line: selection?.positionLineNumber ?? 1,
          column: selection?.positionColumn ?? 1,
        },
      };
    };

    updateContext();

    const selectionDisposable =
      editor.onDidChangeCursorSelection(updateContext);

    const contentDisposable =
      editor.onDidChangeModelContent(updateContext);

    const blurDisposable =
      editor.onDidBlurEditorWidget(() => {
        if (window.__editorAIContext) {
          window.__editorAIContext.selectedText = '';
        }
      });

    return () => {
      selectionDisposable.dispose();
      contentDisposable.dispose();
      blurDisposable.dispose();

      delete window.__editorAIContext;
    };
  }, [editor, activeFile]);
}
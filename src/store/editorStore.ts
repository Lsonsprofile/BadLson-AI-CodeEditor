// src/store/editorStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { editor as MonacoEditorType } from 'monaco-editor';

export interface CursorPosition {
  line: number;
  column: number;
}

export interface EditorSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface EditorContext {
  activeFile: string;
  language: string;
  selectedText: string;
  fullText: string;
  cursor: CursorPosition;
}

export interface EditorOptions {
  fontSize: number;
  wordWrap: boolean;
  tabSize: number;
  minimap: boolean;
  lineNumbers: boolean;
  theme: string;
}

interface EditorStore {
  /**
   * Monaco editor instance.
   * Not persisted.
   */
  editor: MonacoEditorType.IStandaloneCodeEditor | null;

  /**
   * Current editor context for AI features.
   */
  context: EditorContext | null;

  /**
   * Current editor selection.
   */
  selection: EditorSelection | null;

  /**
   * Editor configuration.
   */
  options: EditorOptions;

  /**
   * True while Monaco is initializing.
   */
  isReady: boolean;

  /**
   * Actions
   */
  setEditor(
    editor: MonacoEditorType.IStandaloneCodeEditor | null
  ): void;

  setReady(
    ready: boolean
  ): void;

  setContext(
    context: EditorContext | null
  ): void;

  setSelection(
    selection: EditorSelection | null
  ): void;

  setOptions(
    options: Partial<EditorOptions>
  ): void;

  reset(): void;
}

const defaultOptions: EditorOptions = {
  fontSize: 13,
  wordWrap: true,
  tabSize: 2,
  minimap: false,
  lineNumbers: true,
  theme: 'vs-dark',
};

export const useEditorStore = create<EditorStore>()(
  persist(
    (set) => ({
      editor: null,

      context: null,

      selection: null,

      options: defaultOptions,

      isReady: false,

      setEditor: (editor) =>
        set({
          editor,
        }),

      setReady: (ready) =>
        set({
          isReady: ready,
        }),

      setContext: (context) =>
        set({
          context,
        }),

      setSelection: (selection) =>
        set({
          selection,
        }),

      setOptions: (options) =>
        set((state) => ({
          options: {
            ...state.options,
            ...options,
          },
        })),

      reset: () =>
        set({
          editor: null,
          context: null,
          selection: null,
          isReady: false,
          options: defaultOptions,
        }),
    }),
    {
      name: 'editor-store',

      partialize: (state) => ({
        options: state.options,
      }),
    }
  )
);
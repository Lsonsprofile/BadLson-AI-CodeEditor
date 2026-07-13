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
  editor: MonacoEditorType.IStandaloneCodeEditor | null;
  context: EditorContext | null;
  selection: EditorSelection | null;
  options: EditorOptions;
  isReady: boolean;

  setEditor(editor: MonacoEditorType.IStandaloneCodeEditor | null): void;
  setReady(ready: boolean): void;
  setContext(context: EditorContext | null): void;
  setSelection(selection: EditorSelection | null): void;
  setOptions(options: Partial<EditorOptions>): void;
  updateContext(partial: Partial<EditorContext>): void;
  clearSelectedText(): void;
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
    (set, get) => ({
      editor: null,
      context: null,
      selection: null,
      options: defaultOptions,
      isReady: false,

      setEditor: (editor) => set({ editor }),
      setReady: (ready) => set({ isReady: ready }),
      setContext: (context) => set({ context }),
      setSelection: (selection) => set({ selection }),
      setOptions: (options) =>
        set((state) => ({
          options: {
            ...state.options,
            ...options,
          },
        })),
      updateContext: (partial) =>
        set((state) => ({
          context: state.context ? { ...state.context, ...partial } : null,
        })),
      clearSelectedText: () =>
        set((state) => ({
          context: state.context ? { ...state.context, selectedText: '' } : null,
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
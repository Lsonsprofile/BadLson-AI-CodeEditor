// src/hooks/useEditorShortcuts.ts

import { useEffect } from 'react';
import * as monaco from 'monaco-editor';
import type { editor as MonacoEditorType } from 'monaco-editor';

interface UseEditorShortcutsOptions {
  editor: MonacoEditorType.IStandaloneCodeEditor | null;
  onSave?: () => void;
  onFormat?: () => void;
}

export function useEditorShortcuts({
  editor,
  onSave,
  onFormat,
}: UseEditorShortcutsOptions) {
  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        onSave?.();
        window.dispatchEvent(new CustomEvent('save-files'));
      }
    );

    editor.addCommand(
      monaco.KeyMod.Shift |
        monaco.KeyMod.Alt |
        monaco.KeyCode.KeyF,
      () => {
        onFormat?.();
        window.dispatchEvent(new CustomEvent('format-code'));
      }
    );
  }, [editor, onSave, onFormat]);
}
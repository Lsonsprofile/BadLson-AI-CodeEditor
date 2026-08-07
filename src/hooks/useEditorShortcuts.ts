// src/hooks/useEditorShortcuts.ts

import { useEffect, useRef } from 'react';
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
  const onSaveRef = useRef(onSave);
  const onFormatRef = useRef(onFormat);

  useEffect(() => {
    onSaveRef.current = onSave;
    onFormatRef.current = onFormat;
  }, [onSave, onFormat]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        onSaveRef.current?.();
      }
    );

    editor.addCommand(
      monaco.KeyMod.Shift |
        monaco.KeyMod.Alt |
        monaco.KeyCode.KeyF,
      () => {
        onFormatRef.current?.();
      }
    );
  }, [editor]);
}

// src/hooks/useEditorPersistence.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { getContent, saveContent } from '../lib/fileStorage';
import { useWorkspaceStore } from '../store/workspaceStore';

const SAVE_DELAY = 300;

export function useEditorPersistence() {
  const {
    files,
    activeFile,
    updateFile,
  } = useWorkspaceStore();

  const [content, setContent] = useState('');

  const saveTimeout = useRef<number | null>(null);

  /**
   * Load the current file whenever the active file changes.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadFile() {
      if (!activeFile) {
        setContent('');
        return;
      }

      const memoryContent = files[activeFile];

      if (memoryContent !== undefined) {
        if (!cancelled) {
          setContent(memoryContent);
        }

        try {
          await saveContent(activeFile, memoryContent);
        } catch (error) {
          console.error('Failed to sync IndexedDB:', error);
        }

        return;
      }

      try {
        const storedContent = await getContent(activeFile);

        if (!cancelled) {
          setContent(storedContent ?? '');
        }
      } catch (error) {
        console.error('Failed to load file:', error);

        if (!cancelled) {
          setContent('');
        }
      }
    }

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [activeFile, files]);

  /**
   * Update editor content.
   * Zustand updates immediately.
   * IndexedDB is saved with a debounce.
   */
  const updateContent = useCallback(
    (value: string) => {
      if (!activeFile) return;

      setContent(value);

      updateFile(activeFile, value);

      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
      }

      saveTimeout.current = window.setTimeout(async () => {
        try {
          await saveContent(activeFile, value);
        } catch (error) {
          console.error('Failed to save file:', error);
        }
      }, SAVE_DELAY);
    },
    [activeFile, updateFile]
  );

  /**
   * Flush pending save on unmount.
   */
  useEffect(() => {
    return () => {
      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
      }
    };
  }, []);

  return {
    content,
    setContent,
    updateContent,
  };
}
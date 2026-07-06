import { useRef, useEffect, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditorType } from 'monaco-editor';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getFileLanguage } from '../../utils/formatter';
import { formatHTML, formatCSS, formatJS } from '../../utils/formatter';
import { getContent, saveContent } from '../../lib/fileStorage';

export default function MonacoEditorComponent() {
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const {
    files,
    activeFile,
    updateFile,
    editorOptions,
  } = useWorkspaceStore();

  const [currentContent, setCurrentContent] = useState('');
  const language = getFileLanguage(activeFile);

  // Load content from IndexedDB when active file changes
  useEffect(() => {
    if (!activeFile) {
      setCurrentContent('');
      return;
    }

    // First check Zustand (for newly created files not yet in IndexedDB)
    const zustandContent = (files as Record<string, string>)[activeFile];
    if (zustandContent !== undefined) {
      setCurrentContent(zustandContent);
      // Also sync to IndexedDB
      saveContent(activeFile, zustandContent).catch(console.error);
      return;
    }

    // Fallback to IndexedDB
    getContent(activeFile).then((content) => {
      setCurrentContent(content || '');
    }).catch(console.error);
  }, [activeFile, files]);

  const handleEditorDidMount = useCallback((editor: MonacoEditorType.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    editor.addCommand(
      (window as any).monaco?.KeyMod?.CtrlCmd | (window as any).monaco?.KeyCode?.KeyS || 49,
      () => {
        window.dispatchEvent(new CustomEvent('save-files'));
      }
    );

    const handleFormat = () => {
      if (!editorRef.current) return;
      const content = editorRef.current.getValue();
      let formatted = content;
      const lang = getFileLanguage(activeFile);

      if (lang === 'html') formatted = formatHTML(content);
      else if (lang === 'css') formatted = formatCSS(content);
      else if (lang === 'javascript') formatted = formatJS(content);

      editorRef.current.setValue(formatted);
      // Save to both Zustand and IndexedDB
      updateFile(activeFile, formatted);
      saveContent(activeFile, formatted).catch(console.error);
    };

    window.addEventListener('format-code', handleFormat);
    return () => {
      window.removeEventListener('format-code', handleFormat);
    };
  }, [activeFile, updateFile]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined && activeFile) {
        // Update Zustand for immediate UI feedback
        updateFile(activeFile, value);
        // Save to IndexedDB for persistence
        saveContent(activeFile, value).catch(console.error);
      }
    },
    [activeFile, updateFile]
  );

  useEffect(() => {
    if (editorRef.current) {
      const editorValue = editorRef.current.getValue();
      if (editorValue !== currentContent) {
        editorRef.current.setValue(currentContent);
      }
    }
  }, [currentContent]);

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        Select a file to start editing
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#111625]">
      <Editor
        height="100%"
        language={language}
        value={currentContent}
        theme={editorOptions.theme || 'vs-dark'}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: editorOptions.fontSize,
          fontFamily: "'Fira Code', 'Courier New', monospace",
          fontLigatures: true,
          wordWrap: editorOptions.wordWrap ? 'on' : 'off',
          tabSize: editorOptions.tabSize,
          minimap: { enabled: editorOptions.minimap },
          lineNumbers: editorOptions.lineNumbers ? 'on' : 'off',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 },
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          folding: true,
          foldingHighlight: true,
          unfoldOnClickAfterEndOfLine: true,
          matchBrackets: 'always',
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          formatOnPaste: true,
          formatOnType: true,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          contextmenu: true,
          multiCursorModifier: 'ctrlCmd',
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'inline',
        }}
        loading={
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
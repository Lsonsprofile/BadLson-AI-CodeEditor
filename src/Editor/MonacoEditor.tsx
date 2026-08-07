// src/Editor/MonacoEditor.tsx
import { useRef, useEffect, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditorType, IDisposable, languages } from 'monaco-editor';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { getFileLanguage } from '../utils/formatter';
import { formatHTML, formatCSS, formatJS } from '../utils/formatter';
import { getContent, getBlob, saveContent } from '../lib/fileStorage';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';

// ─── Previewable extensions (images + videos) ──────────────────────
const PREVIEW_EXTENSIONS = [
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
  // Videos
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv',
];

// ─── Helper: get MIME type from extension ──────────────────────────
function getMimeType(ext: string): string {
  const extLower = ext.toLowerCase();
  if (['png','jpg','jpeg','gif','webp','ico','bmp'].includes(extLower)) {
    return `image/${extLower === 'jpg' ? 'jpeg' : extLower}`;
  }
  if (extLower === 'svg') return 'image/svg+xml';
  if (['mp4','webm','mov','avi','mkv','m4v','ogv'].includes(extLower)) {
    return `video/${extLower === 'mov' ? 'quicktime' : extLower}`;
  }
  return 'application/octet-stream';
}

export default function MonacoEditorComponent() {
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const {
    files,
    activeFile,
    updateFile,
    editorOptions,
  } = useWorkspaceStore();

  const { setEditor, setReady, setContext, setSelection } = useEditorStore();
  const editorInstance = useEditorStore((state) => state.editor);

  const [currentContent, setCurrentContent] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const language = getFileLanguage(activeFile);

  const activeFileRef = useRef(activeFile);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const saveAllFiles = useCallback(async () => {
    const entries = Object.entries(files);
    await Promise.all(
      entries.map(([path, content]) => saveContent(path, content).catch((error) => {
        console.error(`[Monaco] Failed to save file ${path}:`, error);
      }))
    );
  }, [files]);

  useEditorShortcuts({
    editor: editorInstance,
    onSave: saveAllFiles,
    onFormat: () => {
      const content = editorRef.current?.getValue();
      if (content === undefined || !activeFileRef.current) return;

      let formatted = content;
      const lang = getFileLanguage(activeFileRef.current);

      if (lang === 'html') formatted = formatHTML(content);
      else if (lang === 'css') formatted = formatCSS(content);
      else if (lang === 'javascript') formatted = formatJS(content);

      if (formatted !== content && editorRef.current) {
        editorRef.current.setValue(formatted);
      }
      updateFile(activeFileRef.current, formatted);
      saveContent(activeFileRef.current, formatted).catch(console.error);
    },
  });

  useEffect(() => {
    const handleSaveEvent = () => {
      saveAllFiles();
    };

    const handleFormatEvent = () => {
      const content = editorRef.current?.getValue();
      if (content === undefined || !activeFileRef.current) return;

      let formatted = content;
      const lang = getFileLanguage(activeFileRef.current);

      if (lang === 'html') formatted = formatHTML(content);
      else if (lang === 'css') formatted = formatCSS(content);
      else if (lang === 'javascript') formatted = formatJS(content);

      if (formatted !== content && editorRef.current) {
        editorRef.current.setValue(formatted);
      }
      updateFile(activeFileRef.current, formatted);
      saveContent(activeFileRef.current, formatted).catch(console.error);
    };

    window.addEventListener('save-files', handleSaveEvent);
    window.addEventListener('format-code', handleFormatEvent);

    return () => {
      window.removeEventListener('save-files', handleSaveEvent);
      window.removeEventListener('format-code', handleFormatEvent);
    };
  }, [saveAllFiles, updateFile]);

  // ── Preview loader (images + videos) ──────────────────────────────
  useEffect(() => {
    if (!activeFile) {
      setPreviewUrl(null);
      setIsVideo(false);
      setPreviewError(null);
      return;
    }

    const ext = activeFile.split('.').pop()?.toLowerCase() || '';
    const isPreviewable = PREVIEW_EXTENSIONS.includes(ext);

    if (!isPreviewable) {
      setPreviewUrl(null);
      setIsVideo(false);
      setPreviewError(null);
      return;
    }

    const isVideoFile = ['mp4','webm','mov','avi','mkv','m4v','ogv'].includes(ext);
    setIsVideo(isVideoFile);

    let cancelled = false;

    const loadPreview = async () => {
      try {
        console.log(`[Monaco] Loading preview for: ${activeFile} (${ext})`);

        // 1) Check Zustand store (might be a data URL)
        const zustandContent = (files as Record<string, string>)[activeFile];
        if (typeof zustandContent === 'string' && zustandContent.length > 0) {
          console.log(`[Monaco] Found in Zustand (length: ${zustandContent.length})`);
          let url: string;
          if (zustandContent.startsWith('data:')) {
            url = zustandContent;
          } else {
            const mime = getMimeType(ext);
            const blob = new Blob([zustandContent], { type: mime });
            url = URL.createObjectURL(blob);
          }
          if (!cancelled) {
            setPreviewUrl(url);
            console.log(`[Monaco] Preview URL set from Zustand: ${url.substring(0, 30)}...`);
          }
          return;
        }

        // 2) Try IndexedDB content (text) – usually not for videos, but fallback
        const content = await getContent(activeFile);
        if (content && !cancelled) {
          console.log(`[Monaco] Found in getContent (length: ${content.length})`);
          let url: string;
          if (content.startsWith('data:')) {
            url = content;
          } else {
            const mime = getMimeType(ext);
            const blob = new Blob([content], { type: mime });
            url = URL.createObjectURL(blob);
          }
          if (!cancelled) {
            setPreviewUrl(url);
            console.log(`[Monaco] Preview URL set from getContent`);
          }
          return;
        }

        // 3) Try IndexedDB blob
        console.log(`[Monaco] Attempting getBlob for: ${activeFile}`);
        const blob = await getBlob(activeFile);
        if (blob && !cancelled) {
          console.log(`[Monaco] Blob retrieved: size=${blob.size}, type=${blob.type}`);
          if (blob.size === 0) {
            console.warn(`[Monaco] Blob is empty (size 0) for ${activeFile}`);
            setPreviewError('File is empty (0 bytes)');
            return;
          }
          const mime = getMimeType(ext);
          const typedBlob = new Blob([blob], { type: mime });
          const url = URL.createObjectURL(typedBlob);
          if (!cancelled) {
            setPreviewUrl(url);
            console.log(`[Monaco] Preview URL set from blob: ${url.substring(0, 30)}...`);
          }
        } else {
          console.warn(`[Monaco] No blob found for: ${activeFile}`);
          setPreviewError('No binary data found for this file');
        }
      } catch (err) {
        console.error('[Monaco] Failed to load preview:', err);
        setPreviewError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (previewUrl && !previewUrl.startsWith('data:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [activeFile, files, previewUrl]);

  // ── Load text content ──────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!activeFile) {
      setCurrentContent('');
      return;
    }

    // If preview is loaded or error, don't load text
    if (previewUrl !== null || previewError) return;

    const zustandContent = (files as Record<string, string>)[activeFile];
    if (zustandContent !== undefined) {
      setCurrentContent(zustandContent);
      saveContent(activeFile, zustandContent).catch(console.error);
      return;
    }

    getContent(activeFile).then((content) => {
      setCurrentContent(content || '');
    }).catch(console.error);
  }, [activeFile, files, previewUrl, previewError]);

  // ─── Register Mokai Dark theme (unchanged) ──────────────────────
  const defineMokaiTheme = useCallback((monaco: any) => {
    monaco.editor.defineTheme('mokai-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c678dd' },
        { token: 'number', foreground: 'd19a66' },
        { token: 'string', foreground: '98c379' },
        { token: 'function', foreground: '61afef' },
        { token: 'type', foreground: 'e5c07b' },
        { token: 'variable', foreground: 'abb2bf' },
        { token: 'operator', foreground: 'abb2bf' },
        { token: 'delimiter', foreground: 'abb2bf' },
      ],
      colors: {
        'editor.background': '#0a0a0a',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#1e1e1e',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorIndentGuide.background': '#404040',
        'editorIndentGuide.activeBackground': '#707070',
        'editorGutter.background': '#0a0a0a',
        'editorGutter.modifiedBackground': '#0a0a0a',
        'editorGutter.addedBackground': '#0a0a0a',
        'editorGutter.deletedBackground': '#0a0a0a',
      }
    });
    monaco.editor.defineTheme('vs-dark-mokai', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0a0a',
      }
    });
  }, []);

  // ─── Register snippets (unchanged) ──────────────────────────────────
  const registerSnippets = useCallback((monaco: typeof import('monaco-editor')) => {
    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
      completionDisposableRef.current = null;
    }

    const htmlBoilerplate = {
      label: 'boilerplate',
      kind: monaco.languages.CompletionItemKind.Snippet,
      documentation: 'Insert a basic HTML/CSS/JS boilerplate',
      insertText: [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '  <title>${1:Document}</title>',
        '  <style>${2:body { font-family: Arial, sans-serif; }}</style>',
        '</head>',
        '<body>',
        '  <h1>${3:Hello, world!}</h1>',
        '  <script>${4:console.log("Hello World");}</script>',
        '</body>',
        '</html>',
      ].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      filterText: '!',
    };

    const provider = monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: ['!'],
      provideCompletionItems: (model, position, context) => {
        if (context.triggerCharacter !== '!') {
          return { suggestions: [] };
        }

        const range = {
          startLineNumber: position.lineNumber,
          startColumn: position.column - 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        return {
          suggestions: [{
            ...htmlBoilerplate,
            range,
          }],
        };
      },
    });

    completionDisposableRef.current = provider;
  }, []);

  // ─── Apply theme (unchanged) ──────────────────────────────────
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const theme = editorOptions.theme || 'vs-dark';
      try {
        monacoRef.current.editor.setTheme(theme);
      } catch {
        monacoRef.current.editor.setTheme('vs-dark');
      }
    }
  }, [editorOptions.theme]);

  // ─── Editor mount (unchanged) ──────────────────────────────────
  const handleEditorDidMount = useCallback((editor: MonacoEditorType.IStandaloneCodeEditor, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    defineMokaiTheme(monaco);
    registerSnippets(monaco);

    const initialTheme = editorOptions.theme || 'vs-dark';
    monaco.editor.setTheme(initialTheme);

    setEditor(editor);
    setReady(true);

    // ─── AI CONTEXT ───────────────────────────────────────────────────
    const updateContext = () => {
      const model = editor.getModel();
      if (!model) return;

      const selection = editor.getSelection();
      const selectedText = selection ? model.getValueInRange(selection) : '';
      const cursor = editor.getPosition();

      setContext({
        activeFile: activeFileRef.current || '',
        language: model.getLanguageId(),
        selectedText: selectedText || '',
        fullText: model.getValue(),
        cursor: {
          line: cursor?.lineNumber || 1,
          column: cursor?.column || 1,
        },
      });

      if (selection) {
        setSelection({
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn,
        });
      } else {
        setSelection(null);
      }
    };

    const selectionDisposable = editor.onDidChangeCursorSelection(updateContext);
    const positionDisposable = editor.onDidChangeCursorPosition(updateContext);
    const blurDisposable = editor.onDidBlurEditorWidget(() => {
      setContext(null);
      setSelection(null);
    });

    return () => {
      selectionDisposable.dispose();
      positionDisposable.dispose();
      blurDisposable.dispose();
      setEditor(null);
      setReady(false);
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
        completionDisposableRef.current = null;
      }
    };
  }, [activeFile, updateFile, setEditor, setReady, setContext, setSelection, defineMokaiTheme, registerSnippets, editorOptions.theme]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined && activeFile) {
        setCurrentContent(value);
        updateFile(activeFile, value);

        if (saveTimeoutRef.current) {
          window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
          saveContent(activeFile, value).catch(console.error);
          saveTimeoutRef.current = null;
        }, 400);
      }
    },
    [activeFile, updateFile]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        Select a file to start editing
      </div>
    );
  }

  // ─── Preview (image or video) ────────────────────────────────────
  if (previewUrl !== null) {
    if (isVideo) {
      return (
        <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center p-4">
          <video
            src={previewUrl}
            controls
            autoPlay={false}
            className="max-w-full max-h-full rounded-lg shadow-lg"
            onError={(e) => {
              console.error('[Monaco] Video playback error:', e);
              setPreviewUrl(null);
              setPreviewError('Video playback failed – likely unsupported codec or corrupted file');
            }}
          />
        </div>
      );
    }
    return (
      <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center p-4">
        <img
          src={previewUrl}
          alt={activeFile}
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          onError={() => setPreviewUrl(null)}
        />
      </div>
    );
  }

  // ─── Show error (if preview failed) ──────────────────────────────
  if (previewError) {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-center text-slate-400">
          <div className="text-sm font-medium text-red-400 mb-2">⚠️ Preview Error</div>
          <div className="text-xs text-slate-500">{previewError}</div>
          <div className="text-xs text-slate-600 mt-2">
            {activeFile} – try re-importing the file
          </div>
        </div>
      </div>
    );
  }

  // ─── Text editor ──────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0a0a0a]">
      <Editor
        height="100%"
        path={activeFile}
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
          mouseWheelScrollSensitivity: 1,
          smoothScrolling: true,
          scrollbar: {
            alwaysConsumeMouseWheel: true,
            vertical: 'visible',
            horizontal: 'auto',
          },
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
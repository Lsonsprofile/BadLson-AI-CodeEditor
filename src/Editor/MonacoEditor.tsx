// src/Editor/MonacoEditor.tsx
import { useRef, useEffect, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditorType, IDisposable } from 'monaco-editor';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { getFileLanguage } from '../utils/formatter';
import { formatHTML, formatCSS, formatJS } from '../utils/formatter';
import { getContent, getBlob, saveContent } from '../lib/fileStorage';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';

// ─── Previewable extensions (images + videos + audio) ─────────────
const PREVIEW_EXTENSIONS = [
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
  // Videos
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv',
  // Audio
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
];

function getMimeType(ext: string): string {
  const extLower = ext.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'].includes(extLower)) {
    return `image/${extLower === 'jpg' ? 'jpeg' : extLower}`;
  }
  if (extLower === 'svg') return 'image/svg+xml';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'].includes(extLower)) {
    return `video/${extLower === 'mov' ? 'quicktime' : extLower}`;
  }
  if (extLower === 'mp3') return 'audio/mpeg';
  if (extLower === 'm4a') return 'audio/mp4';
  if (['wav', 'ogg', 'flac', 'aac'].includes(extLower)) return `audio/${extLower}`;
  return 'application/octet-stream';
}

export default function MonacoEditorComponent() {
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const { files, activeFile, updateFile, editorOptions } = useWorkspaceStore();
  const { setEditor, setReady, setContext, setSelection } = useEditorStore();
  const editorInstance = useEditorStore((state) => state.editor);

  const [currentContent, setCurrentContent] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isAudio, setIsAudio] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const language = getFileLanguage(activeFile);

  const activeFileRef = useRef(activeFile);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const saveAllFiles = useCallback(async () => {
    const entries = Object.entries(files);
    await Promise.all(
      entries.map(([path, content]) =>
        saveContent(path, content).catch((error) => {
          console.error(`[Monaco] Failed to save file ${path}:`, error);
        })
      )
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

  // ── Preview loader (images + videos + audio ONLY) ────────────────
  useEffect(() => {
    setPreviewUrl(null);
    setPreviewError(null);
    setIsVideo(false);
    setIsAudio(false);

    if (!activeFile) return;

    const ext = activeFile.split('.').pop()?.toLowerCase() || '';
    const isPreviewable = PREVIEW_EXTENSIONS.includes(ext);

    // Text files (css, js, html, …) never use media preview
    if (!isPreviewable) return;

    const isVideoFile = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'].includes(ext);
    const isAudioFile = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext);
    setIsVideo(isVideoFile);
    setIsAudio(isAudioFile);

    let cancelled = false;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      try {
        const mime = getMimeType(ext);

        // 1) Real binary from IndexedDB
        const blob = await getBlob(activeFile);
        if (cancelled) return;
        if (blob && blob.size > 0) {
          const typed = new Blob([blob], {
            type: mime || blob.type || 'application/octet-stream',
          });
          objectUrl = URL.createObjectURL(typed);
          setPreviewUrl(objectUrl);
          setPreviewError(null);
          return;
        }

        // 2) Data URL in store
        const zustandContent = (files as Record<string, string>)[activeFile];
        if (typeof zustandContent === 'string' && zustandContent.startsWith('data:')) {
          setPreviewUrl(zustandContent);
          setPreviewError(null);
          return;
        }

        const content = await getContent(activeFile);
        if (cancelled) return;
        if (content && content.startsWith('data:')) {
          setPreviewUrl(content);
          setPreviewError(null);
          return;
        }

        setPreviewError('No binary data found for this file');
      } catch (err) {
        console.error('[Monaco] Failed to load media preview:', err);
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Failed to load media');
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeFile, files]);

  // ── Load text content (non-media files) ────────────────────────────
  useEffect(() => {
    if (!activeFile) {
      setCurrentContent('');
      return;
    }

    const ext = activeFile.split('.').pop()?.toLowerCase() || '';
    const isPreviewable = PREVIEW_EXTENSIONS.includes(ext);

    // Media files use the preview player, not the text editor
    if (isPreviewable) return;

    const zustandContent = (files as Record<string, string>)[activeFile];
    if (zustandContent !== undefined && zustandContent !== '__BINARY__') {
      setCurrentContent(zustandContent);
      saveContent(activeFile, zustandContent).catch(console.error);
      return;
    }

    getContent(activeFile).then((content) => {
      setCurrentContent(content && content !== '__BINARY__' ? content : '');
    }).catch(console.error);
  }, [activeFile, files]);

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
      },
    });
  }, []);

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
      provideCompletionItems: (_model, position, context) => {
        if (context.triggerCharacter !== '!') {
          return { suggestions: [] };
        }
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: position.column - 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        return { suggestions: [{ ...htmlBoilerplate, range }] };
      },
    });

    completionDisposableRef.current = provider;
  }, []);

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

  const handleEditorDidMount = useCallback(
    (editor: MonacoEditorType.IStandaloneCodeEditor, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      defineMokaiTheme(monaco);
      registerSnippets(monaco);

      const initialTheme = editorOptions.theme || 'vs-dark';
      monaco.editor.setTheme(initialTheme);

      setEditor(editor);
      setReady(true);

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
    },
    [
      updateFile,
      setEditor,
      setReady,
      setContext,
      setSelection,
      defineMokaiTheme,
      registerSnippets,
      editorOptions.theme,
    ]
  );

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

  // ─── Media preview (image / video / audio) ───────────────────────
  if (previewUrl !== null) {
    if (isVideo) {
      return (
        <div className="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-center p-4 gap-3">
          <video
            key={previewUrl}
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            className="max-w-full max-h-[80vh] rounded-lg shadow-lg bg-black"
            onError={() => {
              setPreviewError('Video playback failed – re-import or use MP4 (H.264)');
              setPreviewUrl(null);
            }}
          />
          <p className="text-[11px] text-slate-500">{activeFile}</p>
        </div>
      );
    }
    if (isAudio) {
      return (
        <div className="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-center p-4 gap-4">
          <div className="text-4xl">🎵</div>
          <p className="text-sm text-slate-300">{activeFile}</p>
          <audio
            key={previewUrl}
            src={previewUrl}
            controls
            preload="metadata"
            className="w-full max-w-md"
            onError={() => {
              setPreviewError('Audio playback failed – re-import the file');
              setPreviewUrl(null);
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

  // ─── Media preview error (ONLY for image/video/audio) ────────────
  const activeExt = activeFile.split('.').pop()?.toLowerCase() || '';
  const isMediaFile = PREVIEW_EXTENSIONS.includes(activeExt);
  if (previewError && isMediaFile) {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-center text-slate-400">
          <div className="text-sm font-medium text-red-400 mb-2">Preview Error</div>
          <div className="text-xs text-slate-500">{previewError}</div>
          <div className="text-xs text-slate-600 mt-2">
            {activeFile} – re-import the file (Import → File)
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
        }}
      />
    </div>
  );
}

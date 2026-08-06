// src/Editor/MonacoEditor.tsx
import { useRef, useEffect, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditorType } from 'monaco-editor';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { getFileLanguage } from '../utils/formatter';
import { formatHTML, formatCSS, formatJS } from '../utils/formatter';
import { getContent, getBlob, saveContent } from '../lib/fileStorage';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];

export default function MonacoEditorComponent() {
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);
  const completionDisposableRef = useRef<any>(null); // for cleanup

  const {
    files,
    activeFile,
    updateFile,
    editorOptions,
  } = useWorkspaceStore();

  const { setEditor, setReady, setContext, setSelection } = useEditorStore();

  const [currentContent, setCurrentContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const language = getFileLanguage(activeFile);

  // ── Image viewer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFile) {
      setImageUrl(null);
      return;
    }

    const ext = activeFile.split('.').pop()?.toLowerCase() || '';
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    if (!isImage) {
      setImageUrl(null);
      return;
    }

    let cancelled = false;

    const loadImage = async () => {
      try {
        const zustandContent = (files as Record<string, string>)[activeFile];
        if (typeof zustandContent === 'string') {
          let url: string;
          if (zustandContent.startsWith('data:')) {
            const base64 = zustandContent.split(',')[1] || '';
            const mime = `image/${ext === 'svg' ? 'svg+xml' : ext}`;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });
            url = URL.createObjectURL(blob);
          } else {
            const mime = `image/${ext === 'svg' ? 'svg+xml' : ext}`;
            const blob = new Blob([zustandContent], { type: mime });
            url = URL.createObjectURL(blob);
          }
          if (!cancelled) setImageUrl(url);
          return;
        }

        const content = await getContent(activeFile);
        if (content && !cancelled) {
          let url: string;
          if (content.startsWith('data:')) {
            const base64 = content.split(',')[1] || '';
            const mime = `image/${ext === 'svg' ? 'svg+xml' : ext}`;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });
            url = URL.createObjectURL(blob);
          } else {
            const mime = `image/${ext === 'svg' ? 'svg+xml' : ext}`;
            const blob = new Blob([content], { type: mime });
            url = URL.createObjectURL(blob);
          }
          if (!cancelled) setImageUrl(url);
          return;
        }

        const blob = await getBlob(activeFile);
        if (blob && !cancelled) {
          const mime = `image/${ext === 'svg' ? 'svg+xml' : ext}`;
          const typedBlob = new Blob([blob], { type: mime });
          const url = URL.createObjectURL(typedBlob);
          if (!cancelled) setImageUrl(url);
        }
      } catch (err) {
        console.error('Failed to load image preview:', err);
      }
    };

    loadImage();

    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [activeFile, files]);

  // ── Load text content ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeFile) {
      setCurrentContent('');
      return;
    }

    if (imageUrl !== null) return;

    const zustandContent = (files as Record<string, string>)[activeFile];
    if (zustandContent !== undefined) {
      setCurrentContent(zustandContent);
      saveContent(activeFile, zustandContent).catch(console.error);
      return;
    }

    getContent(activeFile).then((content) => {
      setCurrentContent(content || '');
    }).catch(console.error);
  }, [activeFile, files, imageUrl]);

  // ── Register Mokai Dark theme ──────────────────────────────────────
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

  // ─── Register snippets for multiple languages ──────────────────────
  const registerSnippets = useCallback((monaco: any) => {
    // Dispose previous provider
    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
      completionDisposableRef.current = null;
    }

    // Define snippet definitions per language
    const snippets: Record<string, Array<{ prefix: string; body: string; description: string }>> = {
      html: [
        { prefix: '!', body: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  $0\n</body>\n</html>`, description: 'HTML5 Boilerplate' },
        { prefix: 'div', body: '<div>$0</div>', description: '<div> tag' },
        { prefix: 'section', body: '<section>$0</section>', description: '<section> tag' },
        { prefix: 'link', body: '<link rel="stylesheet" href="$0">', description: 'CSS link' },
        { prefix: 'script', body: '<script src="$0"></script>', description: 'Script tag' },
        { prefix: 'input', body: '<input type="$1" name="$2" $0>', description: 'Input field' },
        { prefix: 'form', body: '<form action="$1" method="$2">\n  $0\n</form>', description: 'Form' },
        { prefix: 'table', body: '<table>\n  <thead>\n    <tr>\n      <th>$1</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td>$0</td>\n    </tr>\n  </tbody>\n</table>', description: 'Table' },
        { prefix: 'ul', body: '<ul>\n  <li>$0</li>\n</ul>', description: 'Unordered list' },
        { prefix: 'ol', body: '<ol>\n  <li>$0</li>\n</ol>', description: 'Ordered list' },
        { prefix: 'img', body: '<img src="$1" alt="$2" $0>', description: 'Image' },
        { prefix: 'a', body: '<a href="$1">$0</a>', description: 'Anchor' },
        { prefix: 'button', body: '<button>$0</button>', description: 'Button' },
      ],
      javascript: [
        { prefix: 'log', body: 'console.log($0);', description: 'Log to console' },
        { prefix: 'fn', body: 'function $1($2) {\n  $0\n}', description: 'Function declaration' },
        { prefix: 'af', body: 'const $1 = () => {\n  $0\n}', description: 'Arrow function' },
        { prefix: 'if', body: 'if ($1) {\n  $0\n}', description: 'If statement' },
        { prefix: 'ifelse', body: 'if ($1) {\n  $0\n} else {\n  $2\n}', description: 'If-else statement' },
        { prefix: 'for', body: 'for (let i = 0; i < $1; i++) {\n  $0\n}', description: 'For loop' },
        { prefix: 'forof', body: 'for (const $1 of $2) {\n  $0\n}', description: 'For-of loop' },
        { prefix: 'while', body: 'while ($1) {\n  $0\n}', description: 'While loop' },
        { prefix: 'switch', body: 'switch ($1) {\n  case $2:\n    $0\n    break;\n  default:\n    break;\n}', description: 'Switch statement' },
        { prefix: 'try', body: 'try {\n  $0\n} catch ($1) {\n  $2\n}', description: 'Try-catch' },
        { prefix: 'class', body: 'class $1 {\n  constructor($2) {\n    $0\n  }\n}', description: 'Class' },
        { prefix: 'export', body: 'export $1 $0;', description: 'Export' },
        { prefix: 'import', body: 'import $1 from \'$2\';$0', description: 'Import' },
      ],
      typescript: [
        { prefix: 'log', body: 'console.log($0);', description: 'Log to console' },
        { prefix: 'fn', body: 'function $1($2: $3): $4 {\n  $0\n}', description: 'Typed function' },
        { prefix: 'af', body: 'const $1 = ($2: $3): $4 => {\n  $0\n}', description: 'Typed arrow function' },
        { prefix: 'if', body: 'if ($1) {\n  $0\n}', description: 'If statement' },
        { prefix: 'for', body: 'for (let i = 0; i < $1; i++) {\n  $0\n}', description: 'For loop' },
        { prefix: 'interface', body: 'interface $1 {\n  $0\n}', description: 'Interface' },
        { prefix: 'type', body: 'type $1 = $2;$0', description: 'Type alias' },
        { prefix: 'class', body: 'class $1 {\n  constructor(private $2: $3) {\n    $0\n  }\n}', description: 'Class with constructor' },
        { prefix: 'import', body: 'import { $1 } from \'$2\';$0', description: 'Named import' },
        { prefix: 'export', body: 'export $1 $0;', description: 'Export' },
        { prefix: 'async', body: 'const $1 = async ($2: $3): Promise<$4> => {\n  $0\n}', description: 'Async arrow function' },
        { prefix: 'try', body: 'try {\n  $0\n} catch ($1) {\n  $2\n}', description: 'Try-catch' },
      ],
      css: [
        { prefix: 'cl', body: '.$1 {\n  $0\n}', description: 'Class selector' },
        { prefix: 'id', body: '#$1 {\n  $0\n}', description: 'ID selector' },
        { prefix: 'flex', body: 'display: flex;\n  flex-direction: $1;\n  justify-content: $2;\n  align-items: $3;$0', description: 'Flexbox' },
        { prefix: 'grid', body: 'display: grid;\n  grid-template-columns: $1;\n  gap: $2;$0', description: 'Grid' },
        { prefix: 'bg', body: 'background: $1;$0', description: 'Background' },
        { prefix: 'color', body: 'color: $1;$0', description: 'Text color' },
        { prefix: 'font', body: 'font-size: $1;\n  font-weight: $2;\n  font-family: $3;$0', description: 'Font' },
        { prefix: 'margin', body: 'margin: $1;$0', description: 'Margin' },
        { prefix: 'padding', body: 'padding: $1;$0', description: 'Padding' },
        { prefix: 'border', body: 'border: $1 solid $2;$0', description: 'Border' },
        { prefix: 'radius', body: 'border-radius: $1;$0', description: 'Border radius' },
        { prefix: 'shadow', body: 'box-shadow: $1 $2 $3 $4 $5;$0', description: 'Box shadow' },
        { prefix: 'media', body: '@media (min-width: $1) {\n  $0\n}', description: 'Media query' },
        { prefix: 'keyframes', body: '@keyframes $1 {\n  0% {\n    $2\n  }\n  100% {\n    $3\n  }\n}', description: 'Keyframes' },
        { prefix: 'anim', body: 'animation: $1 $2 $3;$0', description: 'Animation' },
      ],
    };

    // Register a provider for each language
    const registrations: any[] = [];
    for (const [lang, snippetList] of Object.entries(snippets)) {
      const provider = monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['!', '.', '#', ' ', '(', '['],
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const prefix = word.word;
          // Find matching snippets
          const matches = snippetList.filter(s => s.prefix.startsWith(prefix));
          if (matches.length === 0) return { suggestions: [] };

          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = matches.map(s => ({
            label: s.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            detail: s.description,
            documentation: s.body,
          }));

          return { suggestions };
        }
      });
      registrations.push(provider);
    }

    // Store all disposables in one reference (or just the last one, but we need to keep them all)
    // We'll store an array of disposables
    completionDisposableRef.current = {
      dispose: () => {
        for (const reg of registrations) {
          reg.dispose();
        }
      }
    };
  }, []);

  // ── Apply theme ──────────────────────────────────────────────────
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

  const handleEditorDidMount = useCallback((editor: MonacoEditorType.IStandaloneCodeEditor, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define Mokai theme
    defineMokaiTheme(monaco);
    // Register snippets
    registerSnippets(monaco);

    // Set initial theme
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
        activeFile: activeFile || '',
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

    editor.onDidChangeCursorSelection(updateContext);
    editor.onDidChangeCursorPosition(updateContext);
    editor.onDidBlurEditorWidget(() => {
      setContext(null);
      setSelection(null);
    });

    // ─── Keyboard shortcuts ───────────────────────────────────────────
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
      updateFile(activeFile, formatted);
      saveContent(activeFile, formatted).catch(console.error);
    };

    window.addEventListener('format-code', handleFormat);
    return () => {
      window.removeEventListener('format-code', handleFormat);
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
        updateFile(activeFile, value);
        saveContent(activeFile, value).catch(console.error);
      }
    },
    [activeFile, updateFile]
  );

  useEffect(() => {
    if (editorRef.current && !imageUrl) {
      const editorValue = editorRef.current.getValue();
      if (editorValue !== currentContent) {
        editorRef.current.setValue(currentContent);
      }
    }
  }, [currentContent, imageUrl]);

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        Select a file to start editing
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center p-4">
        <img
          src={imageUrl}
          alt={activeFile}
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          onError={() => setImageUrl(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0a0a0a]">
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
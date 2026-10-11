// Debounce Monaco → Zustand updates so typing does not re-render the whole app
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const monacoPath = path.join(root, 'src/Editor/MonacoEditor.tsx');
if (!fs.existsSync(monacoPath)) {
  console.log('fix-typing-lag: MonacoEditor missing, skip');
  process.exit(0);
}
let s = fs.readFileSync(monacoPath, 'utf8');
if (s.includes('storeSyncTimeoutRef')) {
  console.log('fix-typing-lag: already applied');
  process.exit(0);
}

const old = `  const handleChange = useCallback(
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
  );`;

const neu = `  const storeSyncTimeoutRef = useRef<number | null>(null);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined || !activeFile) return;
      setCurrentContent(value);

      if (storeSyncTimeoutRef.current) {
        window.clearTimeout(storeSyncTimeoutRef.current);
      }
      storeSyncTimeoutRef.current = window.setTimeout(() => {
        storeSyncTimeoutRef.current = null;
        updateFile(activeFile, value);
      }, 280);

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveContent(activeFile, value).catch(console.error);
        saveTimeoutRef.current = null;
      }, 500);
    },
    [activeFile, updateFile]
  );`;

if (!s.includes(old)) {
  console.error('fix-typing-lag: handleChange pattern not found');
  process.exit(0);
}
s = s.replace(old, neu);

s = s.replace(
  'const { files, activeFile, updateFile, editorOptions } = useWorkspaceStore();',
  `const files = useWorkspaceStore((s) => s.files);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const updateFile = useWorkspaceStore((s) => s.updateFile);
  const editorOptions = useWorkspaceStore((s) => s.editorOptions);`
);

fs.writeFileSync(monacoPath, s);
console.log('fix-typing-lag: Monaco debounce applied');

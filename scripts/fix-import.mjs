// Fix file & folder import in FileExplorer
// Run: node scripts/fix-import.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'Explorer', 'FileExplorer.tsx');
let src = fs.readFileSync(target, 'utf8');
let changes = 0;

// 1) Ensure BINARY_MARKER is imported
if (!src.includes('BINARY_MARKER')) {
  if (src.includes("saveBlob,\n} from '../../lib/fileStorage';")) {
    src = src.replace(
      "saveBlob,\n} from '../../lib/fileStorage';",
      "saveBlob,\n  BINARY_MARKER,\n} from '../../lib/fileStorage';"
    );
    changes++;
    console.log('✓ BINARY_MARKER import');
  }
}

// 2) Replace import handlers
const startMarker = '  // ── 1. Import Folder (directory)';
const endMarkers = ['  // ── 3. ZIP Upload', '  const handleZipUpload'];
let start = src.indexOf(startMarker);
let end = -1;
for (const m of endMarkers) {
  const i = src.indexOf(m, start > 0 ? start : 0);
  if (i > start) {
    end = i;
    break;
  }
}

if (start < 0 || end < 0) {
  console.error('Could not find import handlers to replace');
} else {
  const newHandlers = `
  // ── 1. Import Folder (directory) ──────────────────────────────
  const handleFolderImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const fileArray = Array.from(fileList);
      const totalFiles = fileArray.length;

      setImporting(true);
      setImportProgress({ current: 0, total: totalFiles });

      try {
        const binaryExts = new Set(BINARY_EXTENSIONS);
        const folderPaths = new Set<string>();
        let savedCount = 0;
        const BATCH_UPDATE = 30;
        let batchFiles: Record<string, string> = {};

        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];
          const path = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, '/');
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const isBinary = binaryExts.has(ext);

          const parts = path.split('/');
          let folderPath = '';
          for (let j = 0; j < parts.length - 1; j++) {
            folderPath = folderPath ? \`\${folderPath}/\${parts[j]}\` : parts[j];
            folderPaths.add(folderPath);
          }

          try {
            if (isBinary) {
              await saveBlob(path, file);
              batchFiles[path] = BINARY_MARKER;
            } else {
              const content = await file.text();
              await saveContent(path, content);
              batchFiles[path] = content;
            }
            savedCount++;
          } catch (fileErr) {
            console.error(\`[Import Folder] Failed \${path}:\`, fileErr);
          }

          if (savedCount % 10 === 0 || i === fileArray.length - 1) {
            setImportProgress({ current: savedCount, total: totalFiles });
          }

          if (Object.keys(batchFiles).length >= BATCH_UPDATE || i === fileArray.length - 1) {
            const currentFiles = useWorkspaceStore.getState().files;
            const currentFolders = useWorkspaceStore.getState().folders;
            const mergedFolders = Array.from(new Set([...currentFolders, ...folderPaths]));
            useWorkspaceStore.setState({
              files: { ...currentFiles, ...batchFiles },
              folders: mergedFolders,
            });
            batchFiles = {};
          }
        }

        const currentFolders = useWorkspaceStore.getState().folders;
        useWorkspaceStore.setState({
          folders: Array.from(new Set([...currentFolders, ...folderPaths])),
        });

        showToast(\`Imported \${savedCount} file(s) from folder\`, 'success');
      } catch (error) {
        showToast(\`Import failed: \${error instanceof Error ? error.message : 'Unknown error'}\`, 'error');
        console.error(error);
      } finally {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [showToast]
  );

  // ── 2. Import Single / Multiple Files ──────────────────────────
  const handleSingleFileImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesToImport = Array.from(fileList);
      setImporting(true);
      setImportProgress({ current: 0, total: filesToImport.length });

      let savedCount = 0;
      const newFilesPatch: Record<string, string> = {};

      try {
        for (let i = 0; i < filesToImport.length; i++) {
          const file = filesToImport[i];
          const path = file.name;
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const isBinary = BINARY_EXTENSIONS.includes(ext);

          try {
            if (isBinary) {
              await saveBlob(path, file);
              newFilesPatch[path] = BINARY_MARKER;
            } else {
              const content = await file.text();
              await saveContent(path, content);
              newFilesPatch[path] = content;
            }
            savedCount++;
          } catch (fileErr) {
            console.error(\`[Import File] Failed \${path}:\`, fileErr);
            showToast(\`Failed: \${path}\`, 'error');
          }

          setImportProgress({ current: i + 1, total: filesToImport.length });
        }

        if (savedCount > 0) {
          const currentFiles = useWorkspaceStore.getState().files;
          const currentFolders = useWorkspaceStore.getState().folders;
          useWorkspaceStore.setState({
            files: { ...currentFiles, ...newFilesPatch },
            folders: currentFolders,
          });

          const lastPath = Object.keys(newFilesPatch).pop();
          if (lastPath) {
            useWorkspaceStore.getState().openFile(lastPath);
          }

          showToast(
            savedCount === 1
              ? \`Imported "\${Object.keys(newFilesPatch)[0]}"\`
              : \`Imported \${savedCount} files\`,
            'success'
          );
        } else {
          showToast('No files were imported', 'error');
        }
      } catch (error) {
        showToast(\`Import failed: \${error instanceof Error ? error.message : 'Unknown error'}\`, 'error');
        console.error(error);
      } finally {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
        if (singleFileInputRef.current) singleFileInputRef.current.value = '';
      }
    },
    [showToast]
  );

`;

  src = src.slice(0, start) + newHandlers + src.slice(end);
  changes++;
  console.log('✓ Import handlers replaced');
}

// 3) Ensure single file input allows multiple
if (src.includes('ref={singleFileInputRef}') && !src.match(/ref=\{singleFileInputRef\}[\s\S]{0,80}multiple/)) {
  src = src.replace(
    /(<input\s+ref=\{singleFileInputRef\}\s+type="file"\s+accept="\*\/\*")/,
    '$1\n        multiple'
  );
  changes++;
  console.log('✓ multiple files on import input');
}

fs.writeFileSync(target, src);
console.log(changes ? `Done (${changes} change(s)). Restart npm run dev.` : 'No changes needed.');

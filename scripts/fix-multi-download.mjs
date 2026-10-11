// Fix multi-file download + cut/paste into folders
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'components',
  'Explorer',
  'FileExplorer.tsx'
);
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('handleDownloadSelected')) {
  const anchor = '  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);';
  const idx = s.indexOf(anchor);
  if (idx === -1) {
    console.error('Anchor not found');
    process.exit(1);
  }
  const L = [];
  const p = (x) => L.push(x);
  p('  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);');
  p('');
  p('  const resolveSelectedFilePaths = useCallback((): string[] => {');
  p('    const out = new Set<string>();');
  p('    const folderSet = new Set(folders || []);');
  p('    for (const name of selectedFiles) {');
  p('      const looksLikeFolder =');
  p('        folderSet.has(name) ||');
  p('        folderFileMap.has(name) ||');
  p("        fileNames.some((f) => f.startsWith(name + '/'));");
  p('      if (looksLikeFolder && !(name in files)) {');
  p('        for (const f of fileNames) {');
  p("          if (f === name || f.startsWith(name + '/')) out.add(f);");
  p('        }');
  p('        const mapped = folderFileMap.get(name);');
  p('        if (mapped) for (const f of mapped) out.add(f);');
  p('      } else {');
  p('        out.add(name);');
  p('      }');
  p('    }');
  p('    return Array.from(out).filter((p) => p in files || fileNames.includes(p));');
  p('  }, [selectedFiles, folders, folderFileMap, fileNames, files]);');
  p('');
  p('  const handleDownloadSelected = useCallback(async () => {');
  p('    if (selectedFiles.size === 0) return;');
  p('    const paths = resolveSelectedFilePaths();');
  p('    if (paths.length === 0) {');
  p("      showToast('No downloadable files in selection', 'error');");
  p('      return;');
  p('    }');
  p('    try {');
  p('      if (paths.length === 1) {');
  p('        const path = paths[0];');
  p("        const displayName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;");
  p("        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();");
  p('        const isBinary = BINARY_EXTENSIONS.includes(ext);');
  p('        if (isBinary) {');
  p('          const blob = await getBlob(path);');
  p('          if (!blob) { showToast("File not found in storage", "error"); return; }');
  p('          const url = URL.createObjectURL(blob);');
  p("          const a = document.createElement('a'); a.href = url; a.download = displayName;");
  p('          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);');
  p('        } else {');
  p('          const content = (files as Record<string, string>)[path] || (await getContent(path)) || "";');
  p('          const blob = new Blob([content], { type: "text/plain;charset=utf-8" });');
  p('          const url = URL.createObjectURL(blob);');
  p("          const a = document.createElement('a'); a.href = url; a.download = displayName;");
  p('          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);');
  p('        }');
  p('        showToast("Downloaded \\"" + displayName + "\\"", "success");');
  p('        return;');
  p('      }');
  p('      const zip = new JSZip();');
  p('      let added = 0;');
  p('      for (const path of paths) {');
  p('        try {');
  p("          const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();");
  p('          const isBinary = BINARY_EXTENSIONS.includes(ext);');
  p('          if (isBinary) {');
  p('            const blob = await getBlob(path);');
  p('            if (blob && blob.size > 0) { zip.file(path, blob); added++; }');
  p('          } else {');
  p('            const content = (files as Record<string, string>)[path] || (await getContent(path)) || "";');
  p('            zip.file(path, content); added++;');
  p('          }');
  p('        } catch { /* skip */ }');
  p('      }');
  p('      if (added === 0) { showToast("No files could be downloaded", "error"); return; }');
  p('      const blob = await zip.generateAsync({ type: "blob" });');
  p('      const url = URL.createObjectURL(blob);');
  p("      const a = document.createElement('a'); a.href = url;");
  p('      a.download = "badlson-selected-" + added + "-files.zip";');
  p('      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);');
  p('      showToast("Downloaded " + added + " file" + (added > 1 ? "s" : "") + " as ZIP", "success");');
  p('    } catch (err) {');
  p('      console.error(err);');
  p('      showToast("Download failed", "error");');
  p('    }');
  p('  }, [selectedFiles, resolveSelectedFilePaths, files, showToast]);');
  p('');
  s = s.slice(0, idx) + L.join('\n') + s.slice(idx + anchor.length);
  n++;
  console.log('✓ download handlers');
}

const badCopy = `setClipboard((prev) => ({ items: [...prev.items, contextMenu.node!.name], mode: 'copy' }));`;
const goodCopy = `setClipboard({ items: [contextMenu.node.name], mode: 'copy' });`;
if (s.includes(badCopy)) {
  s = s.replace(badCopy, goodCopy);
  n++;
  console.log('✓ handleCopy replace');
}

if (!s.includes('Ensure destination parent folders exist')) {
  const oldB = `        } else {\n          const ext = srcPath.slice(srcPath.lastIndexOf('.') + 1).toLowerCase();\n          const isBinary = BINARY_EXTENSIONS.includes(ext);\n          if (isBinary) {\n            const blob = await getBlob(srcPath);\n            if (blob) {\n              if (existingPaths.has(intended) || fileNames.includes(intended)) {\n                await deleteBlob(intended).catch(() => {});\n              }\n              await saveBlob(intended, blob);\n              updateFile(intended, '');`;
  const newB = `        } else {\n          // Ensure destination parent folders exist in the tree\n          if (targetFolder) {\n            const parts = targetFolder.split('/');\n            let built = '';\n            for (const part of parts) {\n              built = built ? \`\${built}/\${part}\` : part;\n              createFolder(built);\n            }\n          }\n          const ext = srcPath.slice(srcPath.lastIndexOf('.') + 1).toLowerCase();\n          const isBinary = BINARY_EXTENSIONS.includes(ext);\n          if (isBinary) {\n            const blob = await getBlob(srcPath);\n            if (blob) {\n              if (existingPaths.has(intended) || fileNames.includes(intended)) {\n                await deleteBlob(intended).catch(() => {});\n              }\n              await saveBlob(intended, blob);\n              updateFile(intended, '');`;
  if (s.includes(oldB)) {
    s = s.replace(oldB, newB);
    n++;
    console.log('✓ parent folders on paste');
  }
}

if (!s.includes('Download Selected')) {
  const old = `            <button\n              onClick={() => {\n                setClipboard({ items: [...selectedFiles], mode: 'cut' });\n                showToast('Cut selected items (right-click target folder and Paste)', 'info');\n              }}\n              className="text-[10px] text-[#58a6ff] hover:underline"\n            >\n              Cut Selected\n            </button>\n            <button\n              onClick={() => {\n                setClipboard({ items: [...selectedFiles], mode: 'copy' });\n                showToast('Copied selected items to clipboard', 'info');\n              }}\n              className="ml-2 text-[10px] text-[#58a6ff] hover:underline"\n            >\n              Copy Selected\n            </button>`;
  const neu = `            <button\n              onClick={() => {\n                const items = Array.from(selectedFiles);\n                setClipboard({ items, mode: 'cut' });\n                showToast('Cut ' + items.length + ' item(s) — right-click a folder → Paste Here', 'info');\n              }}\n              className="text-[10px] text-[#58a6ff] hover:underline"\n            >\n              Cut Selected\n            </button>\n            <button\n              onClick={() => {\n                const items = Array.from(selectedFiles);\n                setClipboard({ items, mode: 'copy' });\n                showToast('Copied ' + items.length + ' item(s) — right-click a folder → Paste Here', 'info');\n              }}\n              className="ml-2 text-[10px] text-[#58a6ff] hover:underline"\n            >\n              Copy Selected\n            </button>\n            <button\n              onClick={handleDownloadSelected}\n              className="ml-2 text-[10px] text-[#58a6ff] hover:underline"\n            >\n              Download Selected\n            </button>`;
  if (s.includes(old)) {
    s = s.replace(old, neu);
    n++;
    console.log('✓ selection bar');
  }
}

if (!s.includes('title={`Download ${selectedFiles.size} selected`}')) {
  const tOld = `{selectedFiles.size > 0 && (\n            <>\n              <button\n                onClick={handleDeleteSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"\n                title={\`Delete \${selectedFiles.size} selected\`}\n              >\n                <Trash2 className="w-3.5 h-3.5" />\n              </button>`;
  const tNew = `{selectedFiles.size > 0 && (\n            <>\n              <button\n                onClick={handleDownloadSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#58a6ff]"\n                title={\`Download \${selectedFiles.size} selected\`}\n              >\n                <Download className="w-3.5 h-3.5" />\n              </button>\n              <button\n                onClick={handleDeleteSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"\n                title={\`Delete \${selectedFiles.size} selected\`}\n              >\n                <Trash2 className="w-3.5 h-3.5" />\n              </button>`;
  if (s.includes(tOld)) {
    s = s.replace(tOld, tNew);
    n++;
    console.log('✓ toolbar download');
  }
}

{
  const oldC = `      // If it was a cut, clear clipboard after moving\n      if (clipboard.mode === 'cut') setClipboard({ items: [], mode: 'copy' });\n      setContextMenu((prev) => ({ ...prev, node: null }));`;
  const newC = `      // If it was a cut, clear clipboard + selection after moving\n      if (clipboard.mode === 'cut') {\n        setClipboard({ items: [], mode: 'copy' });\n        clearSelection();\n      } else {\n        showToast('Pasted ' + clipboard.items.length + ' item(s)', 'success');\n      }\n      setContextMenu((prev) => ({ ...prev, node: null }));`;
  if (s.includes(oldC)) {
    s = s.replace(oldC, newC);
    n++;
    console.log('✓ clear after cut');
  }
  const oldDep = `[clipboard, fileNames, folders, files, createFolder, updateFile, getAllFilesInNode, showToast, deleteFolderContents, deleteFolder, deleteFile]`;
  const newDep = `[clipboard, fileNames, folders, files, createFolder, updateFile, getAllFilesInNode, showToast, deleteFolderContents, deleteFolder, deleteFile, clearSelection]`;
  if (s.includes(oldDep)) {
    s = s.replace(oldDep, newDep);
    n++;
    console.log('✓ paste deps');
  }
}

fs.writeFileSync(target, s);
console.log(n ? 'Done (' + n + ' updates). Restart: npm run dev' : 'Already up to date');

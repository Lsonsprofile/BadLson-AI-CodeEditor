// Fix multi-file download + cut/paste + paste to root (Render build applies this)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'Explorer', 'FileExplorer.tsx');
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('handleDownloadSelected')) {
  const anchor = '  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);';
  const idx = s.indexOf(anchor);
  if (idx === -1) { console.error('Anchor not found'); process.exit(1); }
  const block = `
  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);

  const resolveSelectedFilePaths = useCallback((): string[] => {
    const out = new Set<string>();
    const folderSet = new Set(folders || []);
    for (const name of selectedFiles) {
      const looksLikeFolder = folderSet.has(name) || folderFileMap.has(name) || fileNames.some((f) => f.startsWith(name + '/'));
      if (looksLikeFolder && !(name in files)) {
        for (const f of fileNames) { if (f === name || f.startsWith(name + '/')) out.add(f); }
        const mapped = folderFileMap.get(name);
        if (mapped) for (const f of mapped) out.add(f);
      } else out.add(name);
    }
    return Array.from(out).filter((p) => p in files || fileNames.includes(p));
  }, [selectedFiles, folders, folderFileMap, fileNames, files]);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    const paths = resolveSelectedFilePaths();
    if (paths.length === 0) { showToast('No downloadable files in selection', 'error'); return; }
    try {
      if (paths.length === 1) {
        const path = paths[0];
        const displayName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
        const isBinary = BINARY_EXTENSIONS.includes(ext);
        if (isBinary) {
          const blob = await getBlob(path);
          if (!blob) { showToast('File not found in storage', 'error'); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = displayName;
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } else {
          const content = (files as Record<string, string>)[path] || (await getContent(path)) || '';
          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = displayName;
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }
        showToast('Downloaded "' + displayName + '"', 'success');
        return;
      }
      const zip = new JSZip();
      let added = 0;
      for (const path of paths) {
        try {
          const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
          if (BINARY_EXTENSIONS.includes(ext)) {
            const blob = await getBlob(path);
            if (blob && blob.size > 0) { zip.file(path, blob); added++; }
          } else {
            const content = (files as Record<string, string>)[path] || (await getContent(path)) || '';
            zip.file(path, content); added++;
          }
        } catch { /* skip */ }
      }
      if (added === 0) { showToast('No files could be downloaded', 'error'); return; }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = 'badlson-selected-' + added + '-files.zip';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast('Downloaded ' + added + ' file' + (added > 1 ? 's' : '') + ' as ZIP', 'success');
    } catch (err) {
      console.error(err);
      showToast('Download failed', 'error');
    }
  }, [selectedFiles, resolveSelectedFilePaths, files, showToast]);
`;
  s = s.slice(0, idx) + block + s.slice(idx + anchor.length);
  n++;
  console.log('✓ download handlers');
}

if (s.includes(`setClipboard((prev) => ({ items: [...prev.items, contextMenu.node!.name], mode: 'copy' }));`)) {
  s = s.replace(`setClipboard((prev) => ({ items: [...prev.items, contextMenu.node!.name], mode: 'copy' }));`, `setClipboard({ items: [contextMenu.node.name], mode: 'copy' });`);
  n++; console.log('✓ handleCopy');
}

if (!s.includes('Ensure destination parent folders exist')) {
  const needle = `        } else {\n          const ext = srcPath.slice(srcPath.lastIndexOf('.') + 1).toLowerCase();`;
  const insert = `        } else {\n          // Ensure destination parent folders exist in the tree\n          if (targetFolder) {\n            const parts = targetFolder.split('/');\n            let built = '';\n            for (const part of parts) {\n              built = built ? built + '/' + part : part;\n              createFolder(built);\n            }\n          }\n          const ext = srcPath.slice(srcPath.lastIndexOf('.') + 1).toLowerCase();`;
  if (s.includes(needle)) { s = s.replace(needle, insert); n++; console.log('✓ parent folders'); }
}

if (!s.includes('Download Selected')) {
  const old = `setClipboard({ items: [...selectedFiles], mode: 'cut' });\n                showToast('Cut selected items (right-click target folder and Paste)', 'info');`;
  const neu = `const items = Array.from(selectedFiles);\n                setClipboard({ items, mode: 'cut' });\n                showToast('Cut ' + items.length + ' item(s) — paste into folder or Paste to Root', 'info');`;
  if (s.includes(old)) s = s.replace(old, neu);
  const old2 = `setClipboard({ items: [...selectedFiles], mode: 'copy' });\n                showToast('Copied selected items to clipboard', 'info');`;
  const neu2 = `const items = Array.from(selectedFiles);\n                setClipboard({ items, mode: 'copy' });\n                showToast('Copied ' + items.length + ' item(s) — paste into folder or Paste to Root', 'info');`;
  if (s.includes(old2)) s = s.replace(old2, neu2);
  const afterCopy = `            >\n              Copy Selected\n            </button>`;
  const withDl = `            >\n              Copy Selected\n            </button>\n            <button\n              onClick={handleDownloadSelected}\n              className="ml-2 text-[10px] text-[#58a6ff] hover:underline"\n            >\n              Download Selected\n            </button>`;
  if (!s.includes('Download Selected') && s.includes(afterCopy)) { s = s.replace(afterCopy, withDl); n++; console.log('✓ selection download'); }
}

if (!s.includes('title={`Download ${selectedFiles.size} selected`}')) {
  const tOld = `onClick={handleDeleteSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"\n                title={\`Delete \${selectedFiles.size} selected\`}`;
  const tNew = `onClick={handleDownloadSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#58a6ff]"\n                title={\`Download \${selectedFiles.size} selected\`}\n              >\n                <Download className="w-3.5 h-3.5" />\n              </button>\n              <button\n                onClick={handleDeleteSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"\n                title={\`Delete \${selectedFiles.size} selected\`}`;
  if (s.includes(tOld)) { s = s.replace(tOld, tNew); n++; console.log('✓ toolbar download'); }
}

{
  const oldC = `if (clipboard.mode === 'cut') setClipboard({ items: [], mode: 'copy' });\n      setContextMenu((prev) => ({ ...prev, node: null }));`;
  const newC = `if (clipboard.mode === 'cut') {\n        setClipboard({ items: [], mode: 'copy' });\n        clearSelection();\n      } else {\n        showToast('Pasted ' + clipboard.items.length + ' item(s)', 'success');\n      }\n      setContextMenu((prev) => ({ ...prev, node: null }));`;
  if (s.includes(oldC)) { s = s.replace(oldC, newC); n++; console.log('✓ clear after cut'); }
  const oldDep = `[clipboard, fileNames, folders, files, createFolder, updateFile, getAllFilesInNode, showToast, deleteFolderContents, deleteFolder, deleteFile]`;
  const newDep = `[clipboard, fileNames, folders, files, createFolder, updateFile, getAllFilesInNode, showToast, deleteFolderContents, deleteFolder, deleteFile, clearSelection]`;
  if (s.includes(oldDep)) { s = s.replace(oldDep, newDep); n++; console.log('✓ paste deps'); }
}

if (!s.includes('Paste to Root')) {
  const stOld = `node: TreeNode | null;\n  }>({ x: 0, y: 0, node: null });`;
  const stNew = `node: TreeNode | null;\n    root?: boolean;\n  }>({ x: 0, y: 0, node: null, root: false });`;
  if (s.includes(stOld)) { s = s.replace(stOld, stNew); n++; console.log('✓ context state'); }

  s = s.replace(/contextMenu\.node\.type === 'file'/g, "contextMenu.node?.type === 'file'");
  s = s.replace(/contextMenu\.node\.type === 'folder'/g, "contextMenu.node?.type === 'folder'");

  const fpOld = `onClick={() => handlePaste(contextMenu.node!.name)}\n                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"\n                >\n                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste Here`;
  const fpNew = `onClick={() => handlePaste(contextMenu.node!.name)}\n                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"\n                >\n                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste Into Folder\n                </button>\n                <button\n                  onClick={() => handlePaste(null)}\n                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"\n                >\n                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste to Root`;
  if (s.includes(fpOld)) { s = s.replace(fpOld, fpNew); n++; console.log('✓ folder paste root'); }

  const cmOld = `{contextMenu.node && (\n        <div\n          ref={contextMenuRef}\n          className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 w-44"`;
  const cmNew = `{(contextMenu.node || contextMenu.root) && (\n        <div\n          ref={contextMenuRef}\n          className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 w-48"`;
  if (s.includes(cmOld)) {
    s = s.replace(cmOld, cmNew);
    // inject root menu body after opening style line
    const after = `style={{ top: contextMenu.y, left: contextMenu.x }}\n        >`;
    const rootBody = `style={{ top: contextMenu.y, left: contextMenu.x }}\n        >\n          {contextMenu.root && !contextMenu.node && (\n            <>\n              {clipboard.items.length > 0 && (\n                <button onClick={() => handlePaste(null)} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition">\n                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste to Root\n                </button>\n              )}\n              <button onClick={() => { setShowNewFile(true); setNewFileTargetFolder(null); setContextMenu((p) => ({ ...p, node: null, root: false })); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition">\n                <FilePlus className="w-3.5 h-3.5" /> New File\n              </button>\n              <button onClick={() => { setShowNewFolder(true); setNewFolderTarget(null); setContextMenu((p) => ({ ...p, node: null, root: false })); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition">\n                <FolderPlus className="w-3.5 h-3.5" /> New Folder\n              </button>\n            </>\n          )}`;
    if (s.includes(after)) { s = s.replace(after, rootBody); n++; console.log('✓ root shell'); }
  }

  if (!s.includes('root: true')) {
    const m = s.match(/<div\s+ref=\{scrollContainerRef\}[^>]*>/);
    if (m && !m[0].includes('onContextMenu')) {
      s = s.replace(m[0], m[0].slice(0, -1) + ` onContextMenu={(e) => {\n          if ((e.target as HTMLElement).closest('[data-tree-item]')) return;\n          e.preventDefault();\n          setContextMenu({ x: e.clientX, y: e.clientY, node: null, root: true });\n        }>`);
      n++; console.log('✓ empty area menu');
    }
  }

  if (!s.includes('data-tree-item')) {
    s = s.replace('className="absolute left-0 right-0 will-change-transform"', 'data-tree-item="true" className="absolute left-0 right-0 will-change-transform"');
    n++; console.log('✓ tree marker');
  }

  const nodeOpen = `      node,\n    });\n  }, []);\n\n  // ── Copy / Paste / Download`;
  const nodeOpenFix = `      node,\n      root: false,\n    });\n  }, []);\n\n  // ── Copy / Paste / Download`;
  if (s.includes(nodeOpen)) { s = s.replace(nodeOpen, nodeOpenFix); n++; console.log('✓ node root:false'); }
}

fs.writeFileSync(target, s);
console.log(n ? 'Done (' + n + ' updates)' : 'Already up to date');

// Apply multi file+folder download to FileExplorer
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'Explorer', 'FileExplorer.tsx');
let s = fs.readFileSync(target, 'utf8');

if (s.includes('handleDownloadSelected') && s.includes('resolveSelectedFilePaths')) {
  console.log('Already applied');
  process.exit(0);
}

const anchor = '  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);';
const idx = s.indexOf(anchor);
if (idx === -1) {
  console.error('Anchor not found');
  process.exit(1);
}

const lines = [];
const L = (x) => lines.push(x);
L('  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);');
L('');
L('  // Expand selection: folders → all files inside; files stay as-is');
L('  const resolveSelectedFilePaths = useCallback((): string[] => {');
L('    const out = new Set<string>();');
L('    const folderSet = new Set(folders || []);');
L('    for (const name of selectedFiles) {');
L('      const isFolder =');
L('        folderSet.has(name) ||');
L('        folderFileMap.has(name) ||');
L("        fileNames.some((f) => f.startsWith(name + '/'));");
L('      if (isFolder && !files[name]) {');
L('        for (const f of fileNames) {');
L("          if (f === name || f.startsWith(name + '/')) out.add(f);");
L('        }');
L('        const mapped = folderFileMap.get(name);');
L('        if (mapped) {');
L('          for (const f of mapped) out.add(f);');
L('        }');
L('      } else {');
L('        out.add(name);');
L('      }');
L('    }');
L('    return Array.from(out).filter((p) => p in files || fileNames.includes(p));');
L('  }, [selectedFiles, folders, folderFileMap, fileNames, files]);');
L('');
L('  const handleDownloadSelected = useCallback(async () => {');
L('    if (selectedFiles.size === 0) return;');
L('    const paths = resolveSelectedFilePaths();');
L('    if (paths.length === 0) {');
L("      showToast('No downloadable files in selection', 'error');");
L('      return;');
L('    }');
L('    try {');
L('      if (paths.length === 1) {');
L('        const path = paths[0];');
L("        const displayName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;");
L("        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();");
L('        const isBinary = BINARY_EXTENSIONS.includes(ext);');
L('        if (isBinary) {');
L('          const blob = await getBlob(path);');
L('          if (!blob) {');
L("            showToast('File not found in storage', 'error');");
L('            return;');
L('          }');
L('          const url = URL.createObjectURL(blob);');
L("          const a = document.createElement('a');");
L('          a.href = url;');
L('          a.download = displayName;');
L('          document.body.appendChild(a);');
L('          a.click();');
L('          a.remove();');
L('          URL.revokeObjectURL(url);');
L('        } else {');
L('          const content =');
L('            (files as Record<string, string>)[path] ||');
L('            (await getContent(path)) ||');
L("            '';");
L("          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });");
L('          const url = URL.createObjectURL(blob);');
L("          const a = document.createElement('a');");
L('          a.href = url;');
L('          a.download = displayName;');
L('          document.body.appendChild(a);');
L('          a.click();');
L('          a.remove();');
L('          URL.revokeObjectURL(url);');
L('        }');
L("        showToast('Downloaded \"' + displayName + '\"', 'success');");
L('        return;');
L('      }');
L('');
L('      const zip = new JSZip();');
L('      let added = 0;');
L('      for (const path of paths) {');
L('        try {');
L("          const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();");
L('          const isBinary = BINARY_EXTENSIONS.includes(ext);');
L('          if (isBinary) {');
L('            const blob = await getBlob(path);');
L('            if (blob && blob.size > 0) {');
L('              zip.file(path, blob);');
L('              added++;');
L('            }');
L('          } else {');
L('            const content =');
L('              (files as Record<string, string>)[path] ||');
L('              (await getContent(path)) ||');
L("              '';");
L('            zip.file(path, content);');
L('            added++;');
L('          }');
L('        } catch {');
L('          /* skip */');
L('        }');
L('      }');
L('      if (added === 0) {');
L("        showToast('No files could be downloaded', 'error');");
L('        return;');
L('      }');
L("      const blob = await zip.generateAsync({ type: 'blob' });");
L('      const url = URL.createObjectURL(blob);');
L("      const a = document.createElement('a');");
L('      a.href = url;');
L("      a.download = 'badlson-selected-' + added + '-files.zip';");
L('      document.body.appendChild(a);');
L('      a.click();');
L('      a.remove();');
L('      URL.revokeObjectURL(url);');
L("      showToast('Downloaded ' + added + ' file' + (added > 1 ? 's' : '') + ' as ZIP', 'success');");
L('    } catch (err) {');
L('      console.error(err);');
L("      showToast('Download failed', 'error');");
L('    }');
L('  }, [selectedFiles, resolveSelectedFilePaths, files, showToast]);');
L('');

const insert = lines.join('\n');
s = s.slice(0, idx) + insert + s.slice(idx + anchor.length);

const tOld = `{selectedFiles.size > 0 && (\n            <>\n              <button\n                onClick={handleDeleteSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"\n                title={\`Delete \${selectedFiles.size} selected\`}\n              >\n                <Trash2 className="w-3.5 h-3.5" />\n              </button>`;

const tNew = `{selectedFiles.size > 0 && (\n            <>\n              <button\n                onClick={handleDownloadSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#58a6ff]"\n                title={\`Download \${selectedFiles.size} selected\`}\n              >\n                <Download className="w-3.5 h-3.5" />\n              </button>\n              <button\n                onClick={handleDeleteSelected}\n                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"\n                title={\`Delete \${selectedFiles.size} selected\`}\n              >\n                <Trash2 className="w-3.5 h-3.5" />\n              </button>`;

if (!s.includes('title={`Download ${selectedFiles.size} selected`}')) {
  if (s.includes(tOld)) {
    s = s.replace(tOld, tNew);
    console.log('✓ toolbar');
  } else {
    console.log('· toolbar pattern skip');
  }
}

const bOld = `<button\n            onClick={handleDeleteSelected}\n            className="flex items-center gap-1 px-2 py-1 bg-[#f85149]/20 text-[#f85149] rounded text-[10px] hover:bg-[#f85149]/30 transition"\n          >\n            <Trash2 className="w-3 h-3" /> Delete Selected\n          </button>`;

const bNew = `<button\n            onClick={handleDownloadSelected}\n            className="flex items-center gap-1 px-2 py-1 bg-[#1f6feb]/20 text-[#58a6ff] rounded text-[10px] hover:bg-[#1f6feb]/30 transition"\n          >\n            <Download className="w-3 h-3" /> Download Selected\n          </button>\n          <button\n            onClick={handleDeleteSelected}\n            className="flex items-center gap-1 px-2 py-1 bg-[#f85149]/20 text-[#f85149] rounded text-[10px] hover:bg-[#f85149]/30 transition"\n          >\n            <Trash2 className="w-3 h-3" /> Delete Selected\n          </button>`;

if (!s.includes('Download Selected')) {
  if (s.includes(bOld)) {
    s = s.replace(bOld, bNew);
    console.log('✓ selection bar');
  } else {
    console.log('· bar pattern skip');
  }
}

fs.writeFileSync(target, s);
console.log('Done. Multi file/folder download ready. Restart: npm run dev');

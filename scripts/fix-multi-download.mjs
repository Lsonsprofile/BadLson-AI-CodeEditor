// Add multi-select download to FileExplorer (idempotent)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'Explorer', 'FileExplorer.tsx');
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('handleDownloadSelected')) {
  const anchor = '  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);';
  const idx = s.indexOf(anchor);
  if (idx === -1) {
    console.error('Could not find handleDeleteSelected end');
    process.exit(1);
  }
  const insert = [
    '  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);',
    '',
    '  // ── Download selected files (single file or ZIP for multiple) ──',
    '  const handleDownloadSelected = useCallback(async () => {',
    '    if (selectedFiles.size === 0) return;',
    '    const paths = Array.from(selectedFiles);',
    '    try {',
    '      if (paths.length === 1) {',
    '        const path = paths[0];',
    "        const displayName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;",
    "        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();",
    '        const isBinary = BINARY_EXTENSIONS.includes(ext);',
    '        if (isBinary) {',
    '          const blob = await getBlob(path);',
    '          if (!blob) {',
    "            showToast('File not found in storage', 'error');",
    '            return;',
    '          }',
    '          const url = URL.createObjectURL(blob);',
    "          const a = document.createElement('a');",
    '          a.href = url;',
    '          a.download = displayName;',
    '          a.click();',
    '          URL.revokeObjectURL(url);',
    '        } else {',
    '          const content =',
    '            (files as Record<string, string>)[path] ||',
    '            (await getContent(path)) ||',
    "            '';",
    "          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });",
    '          const url = URL.createObjectURL(blob);',
    "          const a = document.createElement('a');",
    '          a.href = url;',
    '          a.download = displayName;',
    '          a.click();',
    '          URL.revokeObjectURL(url);',
    '        }',
    "        showToast('Downloaded \"' + displayName + '\"', 'success');",
    '        return;',
    '      }',
    '',
    '      const zip = new JSZip();',
    '      let added = 0;',
    '      for (const path of paths) {',
    '        try {',
    "          const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();",
    '          const isBinary = BINARY_EXTENSIONS.includes(ext);',
    '          if (isBinary) {',
    '            const blob = await getBlob(path);',
    '            if (blob && blob.size > 0) {',
    '              zip.file(path, blob);',
    '              added++;',
    '            }',
    '          } else {',
    '            const content =',
    '              (files as Record<string, string>)[path] ||',
    '              (await getContent(path)) ||',
    "              '';",
    '            zip.file(path, content);',
    '            added++;',
    '          }',
    '        } catch {',
    '          /* skip */',
    '        }',
    '      }',
    '      if (added === 0) {',
    "        showToast('No files could be downloaded', 'error');",
    '        return;',
    '      }',
    "      const blob = await zip.generateAsync({ type: 'blob' });",
    '      const url = URL.createObjectURL(blob);',
    "      const a = document.createElement('a');",
    '      a.href = url;',
    "      a.download = 'selected-files-' + added + '.zip';",
    '      a.click();',
    '      URL.revokeObjectURL(url);',
    "      showToast('Downloaded ' + added + ' file' + (added > 1 ? 's' : '') + ' as ZIP', 'success');",
    '    } catch {',
    "      showToast('Download failed', 'error');",
    '    }',
    '  }, [selectedFiles, files, showToast]);',
    '',
  ].join('\n');
  s = s.slice(0, idx) + insert + s.slice(idx + anchor.length);
  n++;
  console.log('✓ handleDownloadSelected');
} else {
  console.log('· handleDownloadSelected already present');
}

if (!s.includes('title={`Download ${selectedFiles.size} selected`}')) {
  const m = `{selectedFiles.size > 0 && (\n            <>\n              <button\n                onClick={handleDeleteSelected}`;
  if (s.includes(m)) {
    s = s.replace(
      m,
      `{selectedFiles.size > 0 && (\n            <>\n              <button\n                onClick={handleDownloadSelected}\n                className="p-1 hover:bg-white/5 rounded transition text-indigo-400"\n                title={\`Download \${selectedFiles.size} selected\`}\n              >\n                <Download className="w-3.5 h-3.5" />\n              </button>\n              <button\n                onClick={handleDeleteSelected}`
    );
    n++;
    console.log('✓ toolbar download button');
  } else {
    console.log('· toolbar pattern not found');
  }
} else {
  console.log('· toolbar download already present');
}

fs.writeFileSync(target, s);
console.log(n ? 'Done (' + n + '). Restart frontend.' : 'No changes needed');

// Fix video/audio playback in MonacoEditor
// Run: node scripts/fix-video-playback.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'Editor', 'MonacoEditor.tsx');
let src = fs.readFileSync(target, 'utf8');

if (src.includes('VIDEO_EXTS') && src.includes("mediaType === 'video'")) {
  console.log('Already fixed');
  process.exit(0);
}

// 1) Prefer getBlob for media
const oldBlock = `        // 1) Check Zustand store (might be a data URL)\n        const zustandContent = (files as Record<string, string>)[activeFile];\n        if (typeof zustandContent === 'string' && zustandContent.length > 0) {\n          console.log(\\[Monaco] Found in Zustand (length: \\${zustandContent.length})\\`);\n          let url: string;\n          if (zustandContent.startsWith('data:')) {\n            url = zustandContent;\n          } else {\n            const mime = getMimeType(ext);\n            const blob = new Blob([zustandContent], { type: mime });\n            url = URL.createObjectURL(blob);\n          }\n          if (!cancelled) {\n            setPreviewUrl(url);\n            console.log(\\[Monaco] Preview URL set from Zustand: \\${url.substring(0, 30)}...\\`);\n          }\n          return;\n        }`;

// Simpler approach: rewrite key broken pattern - creating Blob from zustand non-data string
const broken = `const blob = new Blob([zustandContent], { type: mime });`;
const fixed = `// Don't treat empty/binary markers as media bytes\n            if (!zustandContent.startsWith('data:') && zustandContent.length < 100) {\n              /* fall through to getBlob */\n            } else {\n            const blob = new Blob([zustandContent], { type: mime });`;

// More reliable: inject getBlob-first right at start of loadPreview try block
const anchor = `console.log(\\[Monaco] Loading preview for: \\${activeFile} (\\${ext})\\`);`;
const inject = `console.log(\\[Monaco] Loading preview for: \\${activeFile} (\\${ext})\\`);\n\n        // Prefer IndexedDB blob (real binary) first\n        const blobFirst = await getBlob(activeFile);\n        if (blobFirst && blobFirst.size > 0 && !cancelled) {\n          const mime = getMimeType(ext);\n          const typedBlob = new Blob([blobFirst], { type: mime || blobFirst.type || 'application/octet-stream' });\n          const url = URL.createObjectURL(typedBlob);\n          setPreviewUrl(url);\n          setPreviewError(null);\n          console.log(\\[Monaco] Media from blob: \\${blobFirst.size} bytes\\`);\n          return;\n        }`;

if (src.includes('blobFirst')) {
  console.log('blob-first already present');
} else if (src.includes('[Monaco] Loading preview for:')) {
  // Find and inject after first console.log in loadPreview
  src = src.replace(
    /console\.log\(`\[Monaco\] Loading preview for: \$\{activeFile\} \(\$\{ext\}\)`\);/,
    `console.log(\\[Monaco] Loading preview for: \\${activeFile} (\\${ext})\\`);\n\n        // Prefer IndexedDB blob (real binary) first\n        const blobFirst = await getBlob(activeFile);\n        if (blobFirst && blobFirst.size > 0 && !cancelled) {\n          const mimeEarly = getMimeType(ext);\n          const typedEarly = new Blob([blobFirst], { type: mimeEarly || blobFirst.type || 'application/octet-stream' });\n          const urlEarly = URL.createObjectURL(typedEarly);\n          setPreviewUrl(urlEarly);\n          setPreviewError(null);\n          console.log(\\[Monaco] Media from blob: \\${blobFirst.size} bytes\\`);\n          return;\n        }`
  );
  console.log('Injected blob-first load');
} else {
  console.warn('Could not find loadPreview log line');
}

// Skip empty zustand content for media
src = src.replace(
  "if (typeof zustandContent === 'string' && zustandContent.length > 0)",
  "if (typeof zustandContent === 'string' && zustandContent.length > 0 && zustandContent.startsWith('data:'))"
);

fs.writeFileSync(target, src);
console.log('Done. Restart npm run dev and RE-IMPORT your video file.');

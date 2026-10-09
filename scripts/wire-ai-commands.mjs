// Wire @fix / @create / @bug into backend/services/aiService.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'backend', 'services', 'aiService.mjs');
let src = fs.readFileSync(target, 'utf8');
let n = 0;

// 1) detectMode @commands
if (!src.includes("@fix")) {
  const anchor = 'function detectMode(userMessage, context = {}) {\n  const msg = userMessage.toLowerCase().trim();';
  const inject = `function detectMode(userMessage, context = {}) {\n  const msg = userMessage.toLowerCase().trim();\n\n  // Explicit @commands (highest priority)\n  if (/(^|\\s)@fix\\b/.test(msg)) {\n    console.log('[detectMode] → fix (@fix)');\n    return 'fix';\n  }\n  if (/(^|\\s)@create\\b/.test(msg)) {\n    console.log('[detectMode] → create (@create)');\n    return 'create';\n  }\n  if (/(^|\\s)@bug\\b/.test(msg)) {\n    console.log('[detectMode] → bug (@bug)');\n    return 'bug';\n  }`;
  if (src.includes(anchor)) {
    src = src.replace(anchor, inject);
    n++;
    console.log('✓ detectMode @commands');
  }
}

// 2) MODE_PROMPTS entries
if (!src.includes("MODE: @fix")) {
  const end = '  general: GENERAL_PERSONALITY,\n  generic: BASE_SYSTEM,\n};';
  const extra = `  general: GENERAL_PERSONALITY,\n  generic: BASE_SYSTEM,\n\n  fix: \`\${BASE_SYSTEM}\n\nMODE: @fix — CODE ONLY (DO NOT APPLY)\nUser used @fix. Show corrected code in chat ONLY.\n1. Use normal language fences (\\`\\`\\`html, \\`\\`\\`css) — NEVER \\`\\`\\`edit:path blocks.\n2. Explain briefly. Do not say you applied files.\`,\n\n  create: \`\${BASE_SYSTEM}\n\nMODE: @create — CREATE / WRITE FILES\nUser used @create. Write files into the project.\n1. ALWAYS use \\`\\`\\`edit:filename.ext with FULL file contents.\n2. Complete runnable files.\n3. **File Completed:** filename.ext\`,\n\n  bug: \`\${BASE_SYSTEM}\n\nMODE: @bug — SURGICAL BUG FIX\nUser used @bug. Fix ONLY the described bug.\n1. Minimum necessary changes; keep the rest identical.\n2. Full file via \\`\\`\\`edit:path.\n3. Brief cause + change. No drive-by refactors.\`,\n};`;
  if (src.includes(end)) {
    src = src.replace(end, extra);
    n++;
    console.log('✓ MODE_PROMPTS fix/create/bug');
  } else {
    console.warn('MODE_PROMPTS end not found — check manually');
  }
}

fs.writeFileSync(target, src);
console.log(n ? `Done (${n} updates). Restart backend.` : 'Already wired.');

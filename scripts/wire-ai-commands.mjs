// Wire @fix / @create / @bug into backend/services/aiService.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'backend', 'services', 'aiService.mjs');
let src = fs.readFileSync(target, 'utf8');
let n = 0;

if (!src.includes("return 'fix'") || !src.includes('@fix')) {
  const anchor =
    'function detectMode(userMessage, context = {}) {\n  const msg = userMessage.toLowerCase().trim();\n\n  // ── SUPER AGGRESSIVE GENERAL PATTERNS';
  const inject = `function detectMode(userMessage, context = {}) {
  const msg = userMessage.toLowerCase().trim();

  // Explicit @commands (highest priority)
  if (/(^|\\s)@fix\\b/.test(msg)) {
    console.log('[detectMode] → fix (@fix)');
    return 'fix';
  }
  if (/(^|\\s)@create\\b/.test(msg)) {
    console.log('[detectMode] → create (@create)');
    return 'create';
  }
  if (/(^|\\s)@bug\\b/.test(msg)) {
    console.log('[detectMode] → bug (@bug)');
    return 'bug';
  }

  // ── SUPER AGGRESSIVE GENERAL PATTERNS`;
  if (src.includes(anchor)) {
    src = src.replace(anchor, inject);
    n++;
    console.log('✓ detectMode @commands');
  } else if (src.includes('@fix')) {
    console.log('· detectMode already has @fix');
  } else {
    console.warn('detectMode anchor not found');
  }
} else {
  console.log('· detectMode already wired');
}

if (!src.includes('MODE: @fix')) {
  const end = '  general: GENERAL_PERSONALITY,\n  generic: BASE_SYSTEM,\n};';
  const extra = `  general: GENERAL_PERSONALITY,
  generic: BASE_SYSTEM,

  fix: \\`\${BASE_SYSTEM}

MODE: @fix — CODE ONLY (DO NOT APPLY)
User used @fix. Show corrected code in chat ONLY.
1. Use normal language fences — NEVER edit:path blocks.
2. Explain briefly. Do not say you applied files.\\`,

  create: \\`\${BASE_SYSTEM}

MODE: @create — CREATE / WRITE FILES
User used @create. Write files into the project.
1. ALWAYS use edit:filename.ext with FULL file contents.
2. Complete runnable files.\\`,

  bug: \\`\${BASE_SYSTEM}

MODE: @bug — SURGICAL BUG FIX
User used @bug. Fix ONLY the described bug.
1. Minimum necessary changes.
2. Full file via edit:path.
3. No drive-by refactors.\\`,
};`;
  if (src.includes(end)) {
    src = src.replace(end, extra);
    n++;
    console.log('✓ MODE_PROMPTS fix/create/bug');
  } else {
    console.warn('MODE_PROMPTS end not found');
  }
} else {
  console.log('· MODE_PROMPTS already has @fix');
}

fs.writeFileSync(target, src);
console.log(n ? `Done (${n} updates). Restart backend.` : 'Already wired.');

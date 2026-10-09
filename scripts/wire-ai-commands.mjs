import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const aiPath = path.join(dir, '..', 'backend', 'services', 'aiService.mjs');
let s = fs.readFileSync(aiPath, 'utf8');

if (!s.includes("return 'fix'")) {
  const needle = 'function detectMode(userMessage, context = {}) {\n  const msg = userMessage.toLowerCase().trim();\n';
  const insert = `function detectMode(userMessage, context = {}) {
  const msg = userMessage.toLowerCase().trim();

  if (/(^|\\s)@fix\\b/.test(msg)) { console.log('[detectMode] → fix'); return 'fix'; }
  if (/(^|\\s)@create\\b/.test(msg)) { console.log('[detectMode] → create'); return 'create'; }
  if (/(^|\\s)@bug\\b/.test(msg)) { console.log('[detectMode] → bug'); return 'bug'; }

`;
  if (s.includes(needle)) {
    s = s.replace(needle, insert);
    console.log('✓ detectMode');
  } else console.warn('detectMode needle missing');
} else console.log('· detectMode ok');

if (!s.includes('MODE: @fix')) {
  const needle = '  generic: BASE_SYSTEM,\n};';
  const insert = `  generic: BASE_SYSTEM,

  fix: \\`\${BASE_SYSTEM}\\n\\nMODE: @fix — CODE ONLY. Show code in chat. NEVER use edit:path blocks.\\`,
  create: \\`\${BASE_SYSTEM}\\n\\nMODE: @create — Write files with edit:filename full contents.\\`,
  bug: \\`\${BASE_SYSTEM}\\n\\nMODE: @bug — Surgical fix only. Minimal changes. Use edit:path.\\`,
};`;
  if (s.includes(needle)) {
    s = s.replace(needle, insert);
    console.log('✓ MODE_PROMPTS');
  } else console.warn('MODE_PROMPTS needle missing');
} else console.log('· MODE_PROMPTS ok');

fs.writeFileSync(aiPath, s);
console.log('aiService commands ready');

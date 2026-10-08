// Run once after pull: node scripts/wire-ai-prompts.mjs
// Wires backend/services/aiService.mjs to use systemPrompts.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'backend', 'services', 'aiService.mjs');
let src = fs.readFileSync(target, 'utf8');

if (src.includes("from './systemPrompts.mjs'")) {
  console.log('Already wired to systemPrompts.mjs');
  process.exit(0);
}

const start = src.indexOf('// ─── PERSONALITY & SYSTEM PROMPTS');
const start2 = src.indexOf('const GENERAL_PERSONALITY');
const s = start >= 0 ? start : start2;
const endMarker = 'generic: BASE_SYSTEM,\n};';
const e = src.indexOf(endMarker);

if (s < 0 || e < 0) {
  console.error('Could not find prompt block to replace');
  process.exit(1);
}

src = src.slice(0, s) + src.slice(e + endMarker.length);

if (!src.includes("from './systemPrompts.mjs'")) {
  src = src.replace(
    "import { fileURLToPath } from 'url';\n",
    "import { fileURLToPath } from 'url';\nimport {\n  GENERAL_PERSONALITY,\n  BASE_SYSTEM,\n  MODE_PROMPTS,\n} from './systemPrompts.mjs';\n"
  );
}

fs.writeFileSync(target, src);
console.log('Wired aiService.mjs -> systemPrompts.mjs');
console.log('Restart the backend: npm run server:dev');

// Remove accidental API key fragment checks from aiService (safe length-only validation)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'services', 'aiService.mjs');
if (!fs.existsSync(target)) {
  console.log('sanitize-ai-keys: aiService.mjs not found, skip');
  process.exit(0);
}
let s = fs.readFileSync(target, 'utf8');
const before = s;
const pairs = [
  ["OPENROUTER_API_KEY !== 'sk' && OPENROUTER_API_KEY.length > 10", 'OPENROUTER_API_KEY.length > 10'],
  ["OPENROUTER_API_KEY === 'sk' || OPENROUTER_API_KEY.length < 10", 'OPENROUTER_API_KEY.length < 10'],
  ["GROQ_API_KEY !== 'gsk_Qr3N' && GROQ_API_KEY.length > 10", 'GROQ_API_KEY.length > 10'],
  ["GROQ_API_KEY === 'gsk_Qr3N' || GROQ_API_KEY.length < 10", 'GROQ_API_KEY.length < 10'],
  ["GEMINI_API_KEY !== 'AQ.Ab' && GEMINI_API_KEY.length > 10", 'GEMINI_API_KEY.length > 10'],
];
let n = 0;
for (const [a, b] of pairs) {
  if (s.includes(a)) {
    s = s.split(a).join(b);
    n++;
  }
}
if (s !== before) {
  fs.writeFileSync(target, s);
  console.log('sanitize-ai-keys: cleaned', n, 'patterns');
} else {
  console.log('sanitize-ai-keys: already clean');
}

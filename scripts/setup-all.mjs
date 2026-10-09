// One-shot local setup after git pull
// Usage: node scripts/setup-all.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(script) {
  const full = path.join(__dirname, script);
  if (!require('fs').existsSync(full) && !import.meta.url) {
    /* skip */
  }
  console.log('\n>>', script);
  const r = spawnSync(process.execPath, [full], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.warn('Script reported non-zero (may be ok):', script);
  }
}

import fs from 'fs';

function runIfExists(script) {
  const full = path.join(__dirname, script);
  if (!fs.existsSync(full)) {
    console.log('skip (missing):', script);
    return;
  }
  console.log('\n>>', script);
  const r = spawnSync(process.execPath, [full], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) console.warn('Non-zero exit:', script, r.status);
}

console.log('BadLson setup — applying local patches...');
runIfExists('wire-ai-prompts.mjs');
runIfExists('fix-chat-show-code.mjs');
runIfExists('fix-video-playback.mjs');
runIfExists('fix-import.mjs');
console.log('\n✓ Setup complete. Restart backend + frontend:');
console.log('  npm run server:dev');
console.log('  npm run dev');

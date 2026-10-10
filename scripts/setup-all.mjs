// One-shot local setup after git pull
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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
runIfExists('wire-ai-commands.mjs');
runIfExists('wire-file-context.mjs');
runIfExists('fix-chat-clear-button.mjs');
runIfExists('fix-chat-folders.mjs');
runIfExists('fix-chat-show-code.mjs');
runIfExists('fix-video-playback.mjs');
runIfExists('fix-import.mjs');
runIfExists('fix-file-panel-design.mjs');
console.log('\nSetup complete. Restart backend + frontend:');
console.log('  npm run server:dev');
console.log('  npm run dev');

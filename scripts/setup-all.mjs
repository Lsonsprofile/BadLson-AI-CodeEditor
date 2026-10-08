// One-shot local setup after git pull
// Usage: node scripts/setup-all.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(script) {
  console.log('\n>>', script);
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('Failed:', script);
    process.exit(r.status || 1);
  }
}

console.log('BadLson setup — applying remaining local patches...');
run('wire-ai-prompts.mjs');
run('fix-chat-show-code.mjs');
console.log('\n✓ Setup complete. Restart backend + frontend:');
console.log('  npm run server:dev');
console.log('  npm run dev');

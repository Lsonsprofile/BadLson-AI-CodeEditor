// Cross-platform backend starter (works on Windows + Mac/Linux)
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const serverFile = path.join(root, 'backend', 'server.mjs');

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SKIP_AUTH: process.env.SKIP_AUTH || 'true',
};

const watch = process.argv.includes('--watch');
const args = watch ? ['--watch', serverFile] : [serverFile];

console.log('Starting backend...');
console.log('  NODE_ENV =', env.NODE_ENV);
console.log('  SKIP_AUTH =', env.SKIP_AUTH);
console.log('  file =', serverFile);

const child = spawn(process.execPath, args, {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

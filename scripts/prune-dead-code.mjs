// Remove dead code from disk at build time (safe: only files not imported by App/ChatPanel)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'src/ai',
  'src/store/ai',
  'src/components/ui',
  'src/components/AI/ChatHeader.tsx',
  'src/components/AI/ChatInput.tsx',
  'src/components/AI/ChatMessages.tsx',
  'src/components/AI/Message.tsx',
  'src/components/AI/EditStatusBar.tsx',
  'src/hooks/useAI.ts',
  'src/hooks/useChat.ts',
  'src/hooks/useEditorAIContext.ts',
  'src/hooks/useAutoScroll.ts',
  'src/hooks/useEditorFormatting.ts',
  'src/hooks/useEditorPersistence.ts',
  'src/hooks/use-mobile.ts',
];

function rm(p) {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) return false;
  fs.rmSync(full, { recursive: true, force: true });
  return true;
}

let n = 0;
for (const t of targets) {
  if (rm(t)) {
    console.log('pruned', t);
    n++;
  }
}
console.log(n ? `prune-dead-code: removed ${n} paths` : 'prune-dead-code: nothing to remove');

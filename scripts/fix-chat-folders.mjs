// Ensure ChatPanel sends folders to the AI backend
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'AI', 'ChatPanel.tsx');
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('folders, activeFile') && !s.includes('files, folders,')) {
  if (s.includes('files, activeFile, openFiles, updateFile, openFile')) {
    s = s.replace(
      'files, activeFile, openFiles, updateFile, openFile',
      'files, folders, activeFile, openFiles, updateFile, openFile'
    );
    n++;
    console.log('✓ folders from store');
  }
} else console.log('· folders already in store destructure');

if (!s.includes('folders: folders')) {
  if (s.includes('projectFiles,')) {
    s = s.replace(
      'projectFiles,\n            chatHistory:',
      'projectFiles,\n            folders: folders || [],\n            chatHistory:'
    );
    if (!s.includes('folders: folders')) {
      s = s.replace(
        'projectFiles,\n          chatHistory:',
        'projectFiles,\n          folders: folders || [],\n          chatHistory:'
      );
    }
    if (s.includes('folders: folders')) {
      n++;
      console.log('✓ folders in request body');
    } else console.warn('could not inject folders into body');
  }
} else console.log('· folders already in body');

fs.writeFileSync(target, s);
console.log(n ? `Done (${n}). Restart frontend.` : 'Already OK');

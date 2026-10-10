// Add Clear history button to ChatPanel (idempotent)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'AI', 'ChatPanel.tsx');
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('Trash2')) {
  if (s.includes('Circle, Wrench,')) {
    s = s.replace('Circle, Wrench,', 'Circle, Wrench, Trash2,');
    n++;
  } else if (s.includes('Circle,')) {
    s = s.replace('Circle,', 'Circle, Trash2,');
    n++;
  }
}

if (!s.includes('clearChat')) {
  const a = 'addChatMessage,\n    setIsAiTyping,';
  const b = 'addChatMessage,\n    setIsAiTyping,\n    clearChat,';
  if (s.includes(a)) {
    s = s.replace(a, b);
    n++;
  }
}

if (!s.includes('Clear chat history')) {
  const needle = `<div className="relative" ref={dropdownRef}>`;
  const insert = `{chatHistory.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear chat history?')) clearChat();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/10 text-[11px] text-slate-400 hover:text-rose-300 transition"
              title="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        <div className="relative" ref={dropdownRef}>`;
  if (s.includes(needle)) {
    s = s.replace(needle, insert);
    n++;
  }
}

fs.writeFileSync(target, s);
console.log(n ? `Done (${n}). Restart frontend.` : 'Clear button already present');

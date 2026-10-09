// scripts/fix-file-panel-design.mjs
// Improves FileExplorer visual design without changing logic
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'Explorer', 'FileExplorer.tsx');
let c = fs.readFileSync(target, 'utf8');
let n = 0;

function rep(a, b, label) {
  if (c.includes(a)) {
    c = c.split(a).join(b);
    n++;
    console.log('✓', label);
  } else {
    console.log('· skip', label);
  }
}

// Panel shell
rep(
  'className="h-full flex flex-col bg-[#0d1117] min-w-0"',
  'className="h-full flex flex-col bg-[#0a0c10] min-w-0"',
  'panel bg'
);

// Toolbar header
rep(
  `<div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <span className="text-[11px] font-semibold text-[#c9d1d9] tracking-wide">
          EXPLORER
        </span>`,
  `<div className="flex items-center justify-between px-3 py-2.5 bg-[#0d1017] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <span className="text-[11px] font-semibold text-slate-200 tracking-wider uppercase">
            Files
          </span>
        </div>`,
  'toolbar header'
);

// Folder row
rep(
  'className="group flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded-sm transition-colors cursor-pointer select-none text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"',
  'className="group flex items-center gap-1.5 w-full px-2 py-1 text-[12px] rounded-md transition-all cursor-pointer select-none text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"',
  'folder row'
);

// Active file row variants
const fileVariants = [
  `className={\`group flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded-sm transition-colors cursor-pointer select-none \${
              isActive
                ? 'bg-[#1f6feb]/20 text-[#58a6ff]'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]'
            }\`}`,
  `className={\`group flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded-sm transition-colors cursor-pointer select-none \${
              isActive
                ? 'bg-[#1f6feb]/20 text-indigo-400'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
            }\`}`,
];
const fileNew = `className={\`group flex items-center gap-1.5 w-full px-2 py-1 text-[12px] rounded-md transition-all cursor-pointer select-none \${
              isActive
                ? 'bg-indigo-500/15 text-white border-l-2 border-indigo-400'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border-l-2 border-transparent'
            }\`}`;
for (const v of fileVariants) {
  if (c.includes(v)) {
    c = c.replace(v, fileNew);
    n++;
    console.log('✓ file row');
    break;
  }
}

// Toolbar buttons
rep('className="p-1 hover:bg-[#30363d] rounded transition"', 'className="p-1.5 hover:bg-white/5 rounded-lg transition"', 'toolbar btn');
rep(
  "className={`p-1 rounded transition ${isSearchOpen ? 'bg-[#30363d] text-[#c9d1d9]' : 'hover:bg-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'}`}",
  "className={`p-1.5 rounded-lg transition ${isSearchOpen ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}",
  'search btn'
);

// Soft color harmonization (safe globals — visual only)
const colorMap = [
  ['bg-[#161b22]', 'bg-[#0d1017]'],
  ['border-[#21262d]', 'border-white/5'],
  ['border-[#30363d]', 'border-white/10'],
  ['bg-[#0d1117]', 'bg-[#0a0c10]'],
  ['text-[#c9d1d9]', 'text-slate-200'],
  ['text-[#8b949e]', 'text-slate-500'],
  ['text-[#484f58]', 'text-slate-600'],
  ['text-[#f85149]', 'text-rose-400'],
  ['text-[#58a6ff]', 'text-indigo-400'],
  ['text-[#e3b341]', 'text-amber-400'],
  ['hover:bg-[#21262d]', 'hover:bg-white/[0.04]'],
  ['hover:bg-[#30363d]', 'hover:bg-white/5'],
  ['bg-[#1f6feb]/10', 'bg-indigo-500/10'],
  ['bg-[#1f6feb]/20', 'bg-indigo-500/15'],
];
for (const [a, b] of colorMap) {
  if (c.includes(a)) {
    c = c.split(a).join(b);
    n++;
  }
}

// Empty state icon
rep(
  `            <div className="text-[11px] text-slate-600 mb-4">
              {debouncedSearch
                ? \`No results for "\${debouncedSearch}"\`
                : 'No files or folders yet'}
            </div>`,
  `            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-3 mx-auto">
              <Folder className="w-5 h-5 text-slate-500" />
            </div>
            <div className="text-[12px] text-slate-500 mb-4">
              {debouncedSearch
                ? \`No results for "\${debouncedSearch}"\`
                : 'No files or folders yet'}
            </div>`,
  'empty state'
);

fs.writeFileSync(target, c);
console.log(`\nDone — ${n} visual updates. Restart: npm run dev`);

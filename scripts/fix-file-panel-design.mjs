// Modern File Explorer visuals — logic unchanged
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'components', 'Explorer', 'FileExplorer.tsx');
let c = fs.readFileSync(target, 'utf8');
let n = 0;
function rep(a, b, label) {
  if (c.includes(a)) { c = c.split(a).join(b); n++; console.log('✓', label); }
  else console.log('· skip', label);
}

rep(
  'className="h-full flex flex-col bg-[#0d1117] min-w-0"',
  'className="h-full flex flex-col bg-[#0a0c10] min-w-0"',
  'panel bg'
);
rep(
  'className="h-full flex flex-col bg-[#0a0c10] min-w-0"',
  'className="h-full flex flex-col bg-[#0a0c10] min-w-0"',
  'panel bg keep'
);

// Toolbar title
if (c.includes('EXPLORER')) {
  c = c.replace(
    /<div className="flex items-center justify-between px-3 py-2[^"]* shrink-0">\s*<span className="text-\[11px\] font-semibold[^>]*>\s*EXPLORER\s*<\/span>\s*<div className="flex items-center gap-0\.5">/,
    `<div className="flex items-center justify-between px-3 py-2.5 bg-[#0d1017] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-200 tracking-wider uppercase truncate">
            Files
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">`
  );
  n++;
  console.log('✓ toolbar Files');
} else if (c.includes('tracking-wider uppercase')) {
  console.log('· toolbar already modern');
}

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
                ? 'bg-indigo-500/15 text-indigo-400'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
            }\`}`,
];
const fileNew = `className={\`group flex items-center gap-1.5 w-full px-2 py-1 text-[12px] rounded-md transition-all cursor-pointer select-none \${
              isActive
                ? 'bg-indigo-500/15 text-white border-l-2 border-indigo-400'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border-l-2 border-transparent'
            }\`}`;
for (const v of fileVariants) {
  if (c.includes(v)) { c = c.replace(v, fileNew); n++; console.log('✓ file row'); break; }
}
// regex fallback
if (!c.includes('border-indigo-400')) {
  c = c.replace(
    /className=\{`group flex items-center gap-1\.5 w-full px-2 py-0\.5[^`]+`\}/,
    fileNew
  );
  if (c.includes('border-indigo-400')) { n++; console.log('✓ file row regex'); }
}

rep('className="p-1 hover:bg-[#30363d] rounded transition"', 'className="p-1.5 hover:bg-white/5 rounded-lg transition"', 'toolbar btn');
rep(
  "className={`p-1 rounded transition ${isSearchOpen ? 'bg-[#30363d] text-[#c9d1d9]' : 'hover:bg-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'}`}",
  "className={`p-1.5 rounded-lg transition ${isSearchOpen ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}",
  'search btn'
);

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
  if (c.includes(a)) { c = c.split(a).join(b); n++; }
}

fs.writeFileSync(target, c);
console.log(`\nDone — ${n} visual updates. Restart: npm run dev`);

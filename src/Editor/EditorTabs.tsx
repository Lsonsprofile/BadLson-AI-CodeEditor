// src/Editor/EditorTabs.tsx
import { X, FileText } from 'lucide-react';
// ✅ Fixed: From src/Editor/ go up 2 levels to reach src/
import { useWorkspaceStore } from '../store/workspaceStore';
import { getFileLanguage } from '../utils/formatter';

const langColors: Record<string, string> = {
  html: 'text-orange-400',
  css: 'text-blue-400',
  javascript: 'text-yellow-400',
  typescript: 'text-blue-400',
  json: 'text-green-400',
  markdown: 'text-white',
  plaintext: 'text-slate-400',
};

export default function EditorTabs() {
  const { openFiles, activeFile, setActiveFile, closeFile } = useWorkspaceStore();

  if (openFiles.length === 0) return null;

  return (
    <div className="flex items-center bg-[#0e121f] border-b border-[#1e293b] overflow-x-auto no-scrollbar">
      {openFiles.map((filename: string) => {
        const lang = getFileLanguage(filename);
        const isActive = activeFile === filename;

        return (
          <button
            key={filename}
            onClick={() => setActiveFile(filename)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-[#1e293b] transition-all min-w-0 max-w-[160px] ${
              isActive
                ? 'bg-[#111625] text-slate-200 border-t-2 border-t-indigo-500'
                : 'bg-[#0e121f] text-slate-500 hover:text-slate-300 hover:bg-[#141b2d]'
            }`}
          >
            <FileText className={`w-3 h-3 shrink-0 ${langColors[lang] || 'text-slate-400'}`} />
            <span className="truncate">{filename}</span>
            <span
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                closeFile(filename);
              }}
              className={`ml-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition ${
                isActive ? 'hover:bg-slate-700' : 'hover:bg-slate-800'
              }`}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
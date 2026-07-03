import { useState } from 'react';
import { FileCode, Layout, Type, Braces, Image, Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function FileTabs() {
  const { files, activeFile, openFile, setActiveFile, closeFile, updateFile } = useWorkspaceStore();
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.html')) return <Layout className="w-3.5 h-3.5 text-orange-400" />;
    if (filename.endsWith('.css')) return <Type className="w-3.5 h-3.5 text-blue-400" />;
    if (filename.endsWith('.js')) return <Braces className="w-3.5 h-3.5 text-yellow-400" />;
    if (filename.endsWith('.json')) return <FileCode className="w-3.5 h-3.5 text-green-400" />;
    if (filename.match(/\.(jpg|jpeg|png|gif|svg)$/)) return <Image className="w-3.5 h-3.5 text-purple-400" />;
    return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
  };

  const handleCreateFile = () => {
    if (newFileName.trim()) {
      updateFile(newFileName.trim(), '');
      openFile(newFileName.trim());
      setNewFileName('');
      setShowNewFile(false);
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#0e121f] border-b border-[#1e293b]">
      {Object.keys(files).map((filename) => {
        const isActive = activeFile === filename;

        return (
          <button
            key={filename}
            onClick={() => {
              setActiveFile(filename);
              openFile(filename);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all ${
              isActive
                ? 'bg-[#1e293b] text-slate-200'
                : 'text-slate-500 hover:text-slate-400 hover:bg-[#161d30]'
            }`}
          >
            {getFileIcon(filename)}
            <span className="hidden sm:inline">{filename}</span>
            {isActive && (
              <X
                className="w-3 h-3 ml-1 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(filename);
                }}
              />
            )}
          </button>
        );
      })}

      {showNewFile ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile();
              if (e.key === 'Escape') setShowNewFile(false);
            }}
            placeholder="filename.ext"
            className="w-24 bg-[#161d30] border border-[#1e293b] rounded px-1.5 py-0.5 text-[10px] text-slate-200 outline-none focus:border-indigo-500"
            autoFocus
          />
        </div>
      ) : (
        <button
          onClick={() => setShowNewFile(true)}
          className="p-1 text-slate-500 hover:text-slate-300 hover:bg-[#161d30] rounded transition"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

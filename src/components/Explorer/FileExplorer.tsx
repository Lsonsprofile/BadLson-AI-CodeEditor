import { useState } from 'react';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  Trash2,
  Edit3,
  MoreVertical,
  Image,
  FileCode,
  Braces,
  Type,
  Layout,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface TreeItemProps {
  name: string;
  isFolder?: boolean;
  children?: React.ReactNode;
  depth?: number;
  onSelect?: (name: string) => void;
  isActive?: boolean;
  onDelete?: (name: string) => void;
  onRename?: (name: string) => void;
}

function TreeItem({ name, isFolder = false, children, depth = 0, onSelect, isActive, onDelete, onRename }: TreeItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getIcon = () => {
    if (isFolder) return <Folder className="w-3.5 h-3.5 text-yellow-500/70" />;
    if (name.endsWith('.html')) return <Layout className="w-3.5 h-3.5 text-orange-400" />;
    if (name.endsWith('.css')) return <Type className="w-3.5 h-3.5 text-blue-400" />;
    if (name.endsWith('.js')) return <Braces className="w-3.5 h-3.5 text-yellow-400" />;
    if (name.endsWith('.json')) return <FileCode className="w-3.5 h-3.5 text-green-400" />;
    if (name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) return <Image className="w-3.5 h-3.5 text-purple-400" />;
    return <FileText className="w-3.5 h-3.5 text-slate-400" />;
  };

  if (isFolder) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[#1a2035] rounded-sm transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {getIcon()}
          <span className="truncate font-medium">{name}</span>
        </button>
        {isOpen && children}
      </div>
    );
  }

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect?.(name)}
        className={`flex items-center gap-2 w-full px-2 py-1 text-[11px] rounded-sm transition-colors ${
          isActive
            ? 'bg-[#252d47] text-indigo-300 border-r-2 border-indigo-500'
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2035]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        {getIcon()}
        <span className="truncate">{name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
          }}
          className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded transition"
        >
          <MoreVertical className="w-3 h-3" />
        </button>
      </button>

      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
          <div className="absolute right-0 top-6 z-50 bg-[#1a2035] border border-[#1e293b] rounded-md shadow-xl py-1 w-28">
            <button
              onClick={() => {
                onRename?.(name);
                setIsMenuOpen(false);
              }}
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-[#252d47] transition"
            >
              <Edit3 className="w-3 h-3" /> Rename
            </button>
            <button
              onClick={() => {
                onDelete?.(name);
                setIsMenuOpen(false);
              }}
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] text-red-400 hover:bg-[#252d47] transition"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function FileExplorer() {
  const { files, activeFile, openFile, closeFile, updateFile } = useWorkspaceStore();
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fileNames = Object.keys(files);

  const handleCreateFile = () => {
    if (newFileName.trim()) {
      updateFile(newFileName.trim(), '');
      openFile(newFileName.trim());
      setNewFileName('');
      setShowNewFile(false);
    }
  };

  const handleRename = (oldName: string) => {
    setRenamingFile(oldName);
    setRenameValue(oldName);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== renamingFile && renamingFile) {
      const content = files[renamingFile];
      updateFile(renameValue.trim(), content);
      const newFiles = { ...files };
      delete newFiles[renamingFile];
      useWorkspaceStore.setState({ files: newFiles });

      if (activeFile === renamingFile) {
        useWorkspaceStore.setState({ activeFile: renameValue.trim() });
      }
    }
    setRenamingFile(null);
    setRenameValue('');
  };

  const handleDelete = (name: string) => {
    const newFiles = { ...files };
    delete newFiles[name];
    useWorkspaceStore.setState({ files: newFiles });
    closeFile(name);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">
        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Files</span>
        <button
          onClick={() => setShowNewFile(true)}
          className="p-1 hover:bg-[#1a2035] rounded transition"
        >
          <Plus className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {showNewFile && (
        <div className="px-2 py-1.5">
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile();
              if (e.key === 'Escape') setShowNewFile(false);
            }}
            placeholder="filename.ext"
            className="w-full bg-[#161d30] border border-[#1e293b] rounded px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-indigo-500"
            autoFocus
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-1 py-1">
        <TreeItem name="Project Root" isFolder depth={0}>
          <>
            {fileNames.map((name) =>
              renamingFile === name ? (
                <div key={name} className="px-2 py-0.5" style={{ paddingLeft: '32px' }}>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit();
                      if (e.key === 'Escape') setRenamingFile(null);
                    }}
                    onBlur={handleRenameSubmit}
                    className="w-full bg-[#161d30] border border-indigo-500/50 rounded px-2 py-0.5 text-[10px] text-slate-200 outline-none"
                    autoFocus
                  />
                </div>
              ) : (
                <TreeItem
                  key={name}
                  name={name}
                  onSelect={openFile}
                  isActive={activeFile === name}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  depth={1}
                />
              )
            )}
          </>
        </TreeItem>
      </div>

      <div className="px-3 py-1.5 border-t border-[#1e293b] bg-[#0e121f]">
        <span className="text-[10px] text-slate-500">
          {fileNames.length} file{fileNames.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

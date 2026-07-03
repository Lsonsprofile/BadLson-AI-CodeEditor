import { useState } from 'react';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  Search,
  Settings,
  User,
  HardDrive,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface TreeItemProps {
  name: string;
  isFolder?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  depth?: number;
  onSelect?: (name: string) => void;
  isActive?: boolean;
}

function TreeItem({ name, isFolder = false, defaultOpen = true, children, depth = 0, onSelect, isActive }: TreeItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (isFolder) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[#1a2035] rounded-sm transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Folder className="w-3.5 h-3.5 text-yellow-500/70" />
          <span className="truncate">{name}</span>
        </button>
        {isOpen && children}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect?.(name)}
      className={`flex items-center gap-2 w-full px-2 py-1 text-[11px] rounded-sm transition-colors ${
        isActive
          ? 'bg-[#252d47] text-indigo-300 border-r-2 border-indigo-500'
          : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2035]'
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <FileText className="w-3.5 h-3.5 opacity-60" />
      <span className="truncate">{name}</span>
    </button>
  );
}

export default function Sidebar() {
  const { files, activeFile, openFile, sidebarVisible } = useWorkspaceStore();

  if (!sidebarVisible) return null;

  const fileNames = Object.keys(files);

  return (
    <aside className="w-56 bg-[#0f1322] border-r border-[#1e293b] flex flex-col shrink-0">
      <div className="panel-header">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Explorer</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="p-1 hover:bg-[#1a2035] rounded transition">
            <Plus className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      <div className="px-2 py-1.5">
        <div className="flex items-center bg-[#161d30] rounded-md px-2 py-1 border border-[#1e293b]">
          <Search className="w-3 h-3 text-slate-600 mr-1.5" />
          <input
            type="text"
            placeholder="Search files..."
            className="bg-transparent text-[10px] text-slate-300 placeholder-slate-600 outline-none w-full"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        <TreeItem name="MY PROJECT" isFolder defaultOpen>
          <>
            {fileNames.map((name) => (
              <TreeItem
                key={name}
                name={name}
                onSelect={openFile}
                isActive={activeFile === name}
                depth={1}
              />
            ))}
          </>
        </TreeItem>
      </div>

      <div className="border-t border-[#1e293b] p-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1a2035] cursor-pointer transition">
          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] text-slate-400">Local Storage</span>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-settings'))}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-[#1a2035] cursor-pointer transition text-left"
        >
          <Settings className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] text-slate-400">Settings</span>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-account'))}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-[#1a2035] cursor-pointer transition text-left"
        >
          <User className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] text-slate-400">Account</span>
        </button>
      </div>
    </aside>
  );
}

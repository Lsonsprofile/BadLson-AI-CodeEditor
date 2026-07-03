// src/components/Explorer/FileExplorer.tsx
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Folder,
  ChevronRight,
  ChevronDown,
  FileText,
  Trash2,
  Edit3,
  Image,
  FileCode,
  Braces,
  Type,
  Layout,
  Settings,
  User,
  HardDrive,
  Search,
  X,
  FolderOpen,
  CheckSquare,
  Square,
  FolderPlus,
  FilePlus,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

// ─── Types ───────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  displayName: string;
  type: 'folder' | 'file';
  children: TreeNode[];
}

// ─── Build folder tree from flat paths ───────────────────────────────

function buildFolderTree(filePaths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const sorted = [...filePaths].sort((a, b) => a.localeCompare(b));

  for (const fullPath of sorted) {
    const parts = fullPath.split('/');
    let currentLevel = root;
    let builtPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      builtPath = builtPath ? `${builtPath}/${part}` : part;

      if (isLast) {
        currentLevel.push({
          name: fullPath,
          displayName: part,
          type: 'file',
          children: [],
        });
      } else {
        let folder = folderMap.get(builtPath);
        if (!folder) {
          folder = {
            name: builtPath,
            displayName: part,
            type: 'folder',
            children: [],
          };
          folderMap.set(builtPath, folder);
          currentLevel.push(folder);
        }
        currentLevel = folder.children;
      }
    }
  }

  const sortLevel = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.displayName.localeCompare(b.displayName);
      return a.type === 'folder' ? -1 : 1;
    });
    nodes.forEach(n => { if (n.children.length) sortLevel(n.children); });
  };
  sortLevel(root);
  return root;
}

function getFileIcon(name: string) {
  if (name.endsWith('.html') || name.endsWith('.htm')) return <Layout className="w-3.5 h-3.5 text-[#ff7b72] shrink-0" />;
  if (name.endsWith('.css')) return <Type className="w-3.5 h-3.5 text-[#79c0ff] shrink-0" />;
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return <Braces className="w-3.5 h-3.5 text-[#d2a8ff] shrink-0" />;
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return <FileCode className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />;
  if (name.endsWith('.json')) return <FileCode className="w-3.5 h-3.5 text-[#7ee787] shrink-0" />;
  if (name.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff)$/i)) return <Image className="w-3.5 h-3.5 text-[#d2a8ff] shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />;
}

// ─── TreeItem ────────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  isActive,
  isOpen,
  isSelected,
  onToggle,
  onSelect,
  onDelete,
  onRename,
  onToggleSelect,
  onContextMenu,
  renamingFile,
  renameValue,
  setRenameValue,
  handleRenameSubmit,
  setRenamingFile,
}: {
  node: TreeNode;
  depth: number;
  isActive: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDelete: (node: TreeNode) => void;
  onRename: (node: TreeNode) => void;
  onToggleSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  renamingFile: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  handleRenameSubmit: () => void;
  setRenamingFile: (v: string | null) => void;
}) {
  const isFolder = node.type === 'folder';
  const paddingLeft = depth * 14 + (isFolder ? 6 : 22);

  if (renamingFile === node.name) {
    return (
      <div className="px-2 py-0.5" style={{ paddingLeft }}>
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit();
            if (e.key === 'Escape') setRenamingFile(null);
          }}
          onBlur={handleRenameSubmit}
          className="w-full bg-[#0d1117] border border-[#58a6ff] rounded px-2 py-0.5 text-[11px] text-[#c9d1d9] outline-none"
          autoFocus
        />
      </div>
    );
  }

  if (isFolder) {
    return (
      <div>
        <div
          onContextMenu={(e) => onContextMenu(e, node)}
          className="group flex items-center gap-1.5 w-full px-2 py-1 text-[11px] rounded-sm transition-colors cursor-pointer select-none text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
          style={{ paddingLeft }}
        >
          {/* Checkbox for multi-select */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(node.name); }}
            className="shrink-0 text-[#8b949e] hover:text-[#c9d1d9]"
          >
            {isSelected ? <CheckSquare className="w-3 h-3 text-[#58a6ff]" /> : <Square className="w-3 h-3" />}
          </button>

          {/* Expand/collapse */}
          <button onClick={() => onToggle(node.name)} className="shrink-0">
            {isOpen
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
          </button>

          {/* Folder icon */}
          <button onClick={() => onToggle(node.name)} className="shrink-0">
            {isOpen
              ? <FolderOpen className="w-3.5 h-3.5 text-[#e3b341]" />
              : <Folder className="w-3.5 h-3.5 text-[#e3b341]" />
            }
          </button>

          {/* Name */}
          <span onClick={() => onToggle(node.name)} className="truncate font-medium flex-1">{node.displayName}</span>
          <span className="text-[9px] text-[#484f58] shrink-0">{node.children.length} items</span>

          {/* DELETE BUTTON - visible on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            className="shrink-0 p-0.5 hover:bg-[#30363d] rounded opacity-0 group-hover:opacity-100 transition text-[#f85149]"
            title={`Delete folder "${node.displayName}" and all contents`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        {isOpen && node.children.map(child => (
          <TreeItem
            key={child.name}
            node={child}
            depth={depth + 1}
            isActive={isActive}
            isOpen={false}
            isSelected={isSelected}
            onToggle={onToggle}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
            onToggleSelect={onToggleSelect}
            onContextMenu={onContextMenu}
            renamingFile={renamingFile}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleRenameSubmit={handleRenameSubmit}
            setRenamingFile={setRenamingFile}
          />
        ))}
      </div>
    );
  }

  // FILE
  return (
    <div
      onContextMenu={(e) => onContextMenu(e, node)}
      className={`group flex items-center gap-1.5 w-full px-2 py-1 text-[11px] rounded-sm transition-colors cursor-pointer select-none ${
        isActive
          ? 'bg-[#1f6feb]/20 text-[#58a6ff]'
          : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]'
      }`}
      style={{ paddingLeft }}
    >
      {/* Checkbox for multi-select */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(node.name); }}
        className="shrink-0"
      >
        {isSelected ? <CheckSquare className="w-3 h-3 text-[#58a6ff]" /> : <Square className="w-3 h-3" />}
      </button>

      {/* File icon */}
      <span onClick={() => onSelect(node.name)} className="shrink-0">
        {getFileIcon(node.name)}
      </span>

      {/* Name */}
      <span onClick={() => onSelect(node.name)} className="truncate flex-1">{node.displayName}</span>

      {/* DELETE BUTTON - visible on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(node); }}
        className="shrink-0 p-0.5 hover:bg-[#30363d] rounded opacity-0 group-hover:opacity-100 transition text-[#f85149]"
        title={`Delete ${node.displayName}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Main FileExplorer ───────────────────────────────────────────────

export default function FileExplorer() {
  const { files, activeFile, openFile, closeFile, updateFile } = useWorkspaceStore();

  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileTargetFolder, setNewFileTargetFolder] = useState<string | null>(null);
  
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderTarget, setNewFolderTarget] = useState<string | null>(null);

  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['']));

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode | null }>({ x: 0, y: 0, node: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const fileNames = Object.keys(files);

  // Build tree
  const folderTree = useMemo(() => buildFolderTree(fileNames), [fileNames]);

  // Filter for search
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return folderTree;
    const q = searchQuery.toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.type === 'folder') {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0 || node.displayName.toLowerCase().includes(q)) {
            result.push({ ...node, children: filteredChildren });
          }
        } else if (node.displayName.toLowerCase().includes(q)) {
          result.push(node);
        }
      }
      return result;
    };
    return filterNodes(folderTree);
  }, [folderTree, searchQuery]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, node: null }));
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    toast.style.borderColor = type === 'error' ? '#f85149' : type === 'info' ? '#58a6ff' : '#238636';
    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0', 'pointer-events-none');
    }, 2500);
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const isFolderOpen = useCallback((path: string) => openFolders.has(path), [openFolders]);

  // Toggle selection (checkbox)
  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Select all visible
  const selectAll = useCallback(() => {
    const allNames: string[] = [];
    const collect = (nodes: TreeNode[]) => {
      nodes.forEach(n => {
        if (n.type === 'file') allNames.push(n.name);
        else collect(n.children);
      });
    };
    collect(filteredTree);
    setSelectedFiles(new Set(allNames));
  }, [filteredTree]);

  // Clear selection
  const clearSelection = useCallback(() => setSelectedFiles(new Set()), []);

  const getAllFilesInNode = useCallback((node: TreeNode): string[] => {
    if (node.type === 'file') return [node.name];
    return node.children.flatMap(getAllFilesInNode);
  }, []);

  const handleDelete = useCallback((node: TreeNode) => {
    const targets = node.type === 'folder' ? getAllFilesInNode(node) : [node.name];
    const count = targets.length;
    const itemType = node.type === 'folder'
      ? `folder "${node.displayName}" and ${count} file${count > 1 ? 's' : ''}`
      : `"${node.displayName}"`;

    if (!window.confirm(`Delete ${itemType}?`)) return;

    const newFiles = { ...files };
    targets.forEach(f => {
      delete newFiles[f];
      closeFile(f);
    });
    useWorkspaceStore.setState({ files: newFiles });
    showToast(`🗑️ Deleted ${node.type === 'folder' ? 'folder' : 'file'}`, 'info');
    clearSelection();
    setContextMenu(prev => ({ ...prev, node: null }));
  }, [files, closeFile, showToast, clearSelection, getAllFilesInNode]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedFiles.size === 0) return;
    if (!window.confirm(`Delete ${selectedFiles.size} selected file${selectedFiles.size > 1 ? 's' : ''}?`)) return;

    const newFiles = { ...files };
    selectedFiles.forEach(f => {
      delete newFiles[f];
      closeFile(f);
    });
    useWorkspaceStore.setState({ files: newFiles });
    showToast(`🗑️ Deleted ${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''}`, 'info');
    clearSelection();
  }, [files, selectedFiles, closeFile, showToast, clearSelection]);

  const handleRename = useCallback((node: TreeNode) => {
    setRenamingFile(node.name);
    setRenameValue(node.name);
    setContextMenu(prev => ({ ...prev, node: null }));
  }, []);

  const handleRenameSubmit = useCallback(() => {
    if (!renamingFile || !renameValue.trim() || renameValue === renamingFile) {
      setRenamingFile(null);
      setRenameValue('');
      return;
    }
    if (fileNames.some(f => f === renameValue.trim())) {
      showToast(`⚠️ "${renameValue.trim()}" already exists`, 'error');
      setRenamingFile(null);
      setRenameValue('');
      return;
    }
    const content = files[renamingFile];
    updateFile(renameValue.trim(), content);
    const newFiles = { ...files };
    delete newFiles[renamingFile];
    useWorkspaceStore.setState({ files: newFiles });
    if (activeFile === renamingFile) {
      useWorkspaceStore.setState({ activeFile: renameValue.trim() });
    }
    showToast(`✅ Renamed`, 'success');
    setRenamingFile(null);
    setRenameValue('');
  }, [renamingFile, renameValue, files, fileNames, activeFile, updateFile, showToast]);

  // ─── Create File ───────────────────────────────────────────────────

  const startCreateFile = useCallback((targetFolder: string | null = null) => {
    setNewFileTargetFolder(targetFolder);
    setShowNewFile(true);
    setShowNewFolder(false);
    setContextMenu(prev => ({ ...prev, node: null }));
  }, []);

  const handleCreateFile = useCallback(() => {
    if (!newFileName.trim()) return;
    
    let name = newFileName.trim();
    // If target folder specified, prepend it
    if (newFileTargetFolder) {
      name = `${newFileTargetFolder}/${name}`;
    }

    if (name in files) {
      showToast(`⚠️ "${name}" already exists`, 'error');
      return;
    }

    updateFile(name, '');
    openFile(name);
    setNewFileName('');
    setShowNewFile(false);
    setNewFileTargetFolder(null);
    showToast(`✅ "${name}" created`, 'success');

    // Auto-expand parent folders
    const parts = name.split('/');
    let path = '';
    setOpenFolders(prev => {
      const next = new Set(prev);
      for (let i = 0; i < parts.length - 1; i++) {
        path = path ? `${path}/${parts[i]}` : parts[i];
        next.add(path);
      }
      return next;
    });
  }, [newFileName, newFileTargetFolder, files, updateFile, openFile, showToast]);

  // ─── Create Folder ─────────────────────────────────────────────────

  const startCreateFolder = useCallback((targetFolder: string | null = null) => {
    setNewFolderTarget(targetFolder);
    setShowNewFolder(true);
    setShowNewFile(false);
    setContextMenu(prev => ({ ...prev, node: null }));
  }, []);

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return;

    let folderPath = newFolderName.trim();
    // If target folder specified, prepend it
    if (newFolderTarget) {
      folderPath = `${newFolderTarget}/${folderPath}`;
    }

    // Create a placeholder file inside the folder to make it exist
    const placeholderFile = `${folderPath}/.gitkeep`;
    
    if (placeholderFile in files) {
      showToast(`⚠️ Folder "${folderPath}" already exists`, 'error');
      return;
    }

    updateFile(placeholderFile, '');
    setNewFolderName('');
    setShowNewFolder(false);
    setNewFolderTarget(null);
    showToast(`✅ Folder "${folderPath}" created`, 'success');

    // Auto-expand the new folder
    setOpenFolders(prev => {
      const next = new Set(prev);
      next.add(folderPath);
      return next;
    });
  }, [newFolderName, newFolderTarget, files, updateFile, showToast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(window.innerWidth - 180, e.clientX),
      y: Math.min(window.innerHeight - 200, e.clientY),
      node,
    });
  }, []);

  const toggleSettings = useCallback(() => window.dispatchEvent(new CustomEvent('toggle-settings')), []);
  const toggleAccount = useCallback(() => window.dispatchEvent(new CustomEvent('toggle-account')), []);

  const isFileSelected = useCallback((name: string) => selectedFiles.has(name), [selectedFiles]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-[#0d1117] min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <span className="text-[11px] font-semibold text-[#c9d1d9] tracking-wide">EXPLORER</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1 rounded transition ${isSearchOpen ? 'bg-[#30363d] text-[#c9d1d9]' : 'hover:bg-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'}`}
            title="Search files"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {selectedFiles.size > 0 && (
            <>
              <button onClick={handleDeleteSelected} className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]" title={`Delete ${selectedFiles.size} selected`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={clearSelection} className="p-1 hover:bg-[#30363d] rounded transition text-[#8b949e]" title="Clear selection">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button onClick={() => startCreateFile()} className="p-1 hover:bg-[#30363d] rounded transition" title="New File">
            <FilePlus className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
          </button>
          <button onClick={() => startCreateFolder()} className="p-1 hover:bg-[#30363d] rounded transition" title="New Folder">
            <FolderPlus className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
          </button>
        </div>
      </div>

      {/* Search */}
      {isSearchOpen && (
        <div className="px-3 py-2 border-b border-[#21262d] shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#484f58]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-7 pr-7 py-1.5 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58]"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#c9d1d9]">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Multi-select toolbar */}
      {selectedFiles.size > 0 && (
        <div className="px-3 py-2 bg-[#1f6feb]/10 border-b border-[#30363d] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-[10px] text-[#58a6ff] hover:underline">Select All</button>
            <span className="text-[10px] text-[#58a6ff]">|</span>
            <button onClick={clearSelection} className="text-[10px] text-[#8b949e] hover:text-[#c9d1d9]">Clear</button>
          </div>
          <span className="text-[10px] text-[#58a6ff] font-medium">{selectedFiles.size} selected</span>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 px-2 py-1 bg-[#f85149]/20 text-[#f85149] rounded text-[10px] hover:bg-[#f85149]/30 transition"
          >
            <Trash2 className="w-3 h-3" /> Delete Selected
          </button>
        </div>
      )}

      {/* Project name */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[#21262d] shrink-0">
        <ChevronDown className="w-3 h-3 text-[#8b949e]" />
        <span className="text-[11px] font-bold text-[#c9d1d9]">AI CODE WORKSPACE</span>
        <span className="text-[9px] text-[#484f58] ml-auto">{fileNames.length} files</span>
      </div>

      {/* New file input */}
      {showNewFile && (
        <div className="px-3 py-1.5 border-b border-[#21262d] shrink-0">
          <div className="text-[10px] text-[#8b949e] mb-1">
            {newFileTargetFolder ? `New file in "${newFileTargetFolder}/"` : 'New file in root'}
          </div>
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile();
              if (e.key === 'Escape') { setShowNewFile(false); setNewFileTargetFolder(null); }
            }}
            placeholder="filename.js"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58]"
            autoFocus
          />
        </div>
      )}

      {/* New folder input */}
      {showNewFolder && (
        <div className="px-3 py-1.5 border-b border-[#21262d] shrink-0">
          <div className="text-[10px] text-[#8b949e] mb-1">
            {newFolderTarget ? `New folder in "${newFolderTarget}/"` : 'New folder in root'}
          </div>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderTarget(null); }
            }}
            placeholder="folder-name"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58]"
            autoFocus
          />
        </div>
      )}

      {/* ═══ SCROLLABLE FILE TREE ═══ */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar">
        {filteredTree.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="text-[11px] text-[#484f58] mb-4">
              {searchQuery ? `No results for "${searchQuery}"` : 'No files or folders yet'}
            </div>
            {!searchQuery && (
              <div className="flex flex-col gap-2 items-center">
                <button
                  onClick={() => startCreateFolder()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md text-[11px] text-[#c9d1d9] transition border border-[#30363d]"
                >
                  <FolderPlus className="w-4 h-4 text-[#e3b341]" /> Create Folder
                </button>
                <button
                  onClick={() => startCreateFile()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md text-[11px] text-[#c9d1d9] transition border border-[#30363d]"
                >
                  <FilePlus className="w-4 h-4 text-[#58a6ff]" /> Create File
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredTree.map(node => (
            <TreeItem
              key={node.name}
              node={node}
              depth={0}
              isActive={activeFile === node.name}
              isOpen={isFolderOpen(node.name)}
              isSelected={isFileSelected(node.name)}
              onToggle={toggleFolder}
              onSelect={openFile}
              onDelete={handleDelete}
              onRename={handleRename}
              onToggleSelect={toggleSelect}
              onContextMenu={handleContextMenu}
              renamingFile={renamingFile}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              handleRenameSubmit={handleRenameSubmit}
              setRenamingFile={setRenamingFile}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#21262d] bg-[#161b22] shrink-0">
        <div className="flex items-center border-b border-[#21262d]">
          <button onClick={toggleSettings} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition">
            <Settings className="w-3 h-3" /> Settings
          </button>
          <div className="w-px h-4 bg-[#30363d]" />
          <button onClick={toggleAccount} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition">
            <User className="w-3 h-3" /> Account
          </button>
        </div>
        <div className="px-3 py-1.5 flex items-center gap-1.5">
          <HardDrive className="w-3 h-3 text-[#484f58]" />
          <span className="text-[10px] text-[#484f58]">
            {fileNames.length} file{fileNames.length !== 1 ? 's' : ''}
            {selectedFiles.size > 0 && ` · ${selectedFiles.size} selected`}
          </span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu.node && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 w-44"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.node.type === 'file' && (
            <button
              onClick={() => { openFile(contextMenu.node!.name); setContextMenu(prev => ({ ...prev, node: null })); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
            >
              <FileText className="w-3.5 h-3.5" /> Open
            </button>
          )}

          {contextMenu.node.type === 'folder' && (
            <>
              <button
                onClick={() => startCreateFile(contextMenu.node!.name)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <FilePlus className="w-3.5 h-3.5 text-[#58a6ff]" /> New File
              </button>
              <button
                onClick={() => startCreateFolder(contextMenu.node!.name)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#e3b341]" /> New Folder
              </button>
              <div className="h-px bg-[#30363d] my-1" />
            </>
          )}

          <button
            onClick={() => handleRename(contextMenu.node!)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
          >
            <Edit3 className="w-3.5 h-3.5" /> Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.node!)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#f85149] hover:bg-[#21262d] transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete{contextMenu.node.type === 'folder' ? ' Folder' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
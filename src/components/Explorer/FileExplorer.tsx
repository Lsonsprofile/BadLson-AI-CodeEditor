import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
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
  Upload,
  FileArchive,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  getContent,
  getBlob,
  deleteContent,
  deleteBlob,
  deleteFolderContents,
  saveContent,
  saveBlob,
} from '../../lib/fileStorage';

// Type declaration for non-standard input attributes
declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

interface TreeNode {
  name: string;
  displayName: string;
  type: 'folder' | 'file';
  children: TreeNode[];
  childCount: number;
  depth: number;
  fileType?: 'text' | 'image' | 'binary';
}

// ────────────────────────────────────────────────────────────────
// FIX #4: O(n²) → O(n) by using Sets for path lookups
// ────────────────────────────────────────────────────────────────
function buildFolderTree(
  filePaths: string[],
  folderPaths: string[],
  fileMeta: Record<string, { type?: 'text' | 'image' | 'binary' }>
): TreeNode[] {
  if (filePaths.length === 0 && folderPaths.length === 0) return [];

  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();
  const seen = new Set<string>();

  const folderSet = new Set(folderPaths);
  const fileSet = new Set(filePaths);
  const allPaths = [...folderPaths, ...filePaths];

  for (const fullPath of allPaths) {
    if (seen.has(fullPath)) continue;
    seen.add(fullPath);

    const isFolderOnly = folderSet.has(fullPath) && !fileSet.has(fullPath);
    const parts = fullPath.split('/');
    let currentLevel = root;
    let builtPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      builtPath = builtPath ? `${builtPath}/${part}` : part;

      if (isLast && !isFolderOnly) {
        currentLevel.push({
          name: fullPath,
          displayName: part,
          type: 'file',
          children: [],
          childCount: 0,
          depth: i,
          fileType: fileMeta[fullPath]?.type || 'text',
        });
      } else {
        let folder = folderMap.get(builtPath);
        if (!folder) {
          folder = {
            name: builtPath,
            displayName: part,
            type: 'folder',
            children: [],
            childCount: 0,
            depth: i,
          };
          folderMap.set(builtPath, folder);
          currentLevel.push(folder);
        }
        currentLevel = folder.children;
      }
    }
  }

  const processNode = (node: TreeNode): number => {
    if (node.type === 'file') {
      node.childCount = 0;
      return 1;
    }
    let count = 0;
    node.children.sort((a, b) => {
      if (a.type === b.type) return a.displayName.localeCompare(b.displayName);
      return a.type === 'folder' ? -1 : 1;
    });
    for (const child of node.children) {
      count += processNode(child);
    }
    node.childCount = count;
    return count + 1;
  };

  root.sort((a, b) => {
    if (a.type === b.type) return a.displayName.localeCompare(b.displayName);
    return a.type === 'folder' ? -1 : 1;
  });

  for (const node of root) processNode(node);
  return root;
}

function getFileIcon(name: string, fileType?: string) {
  if (fileType === 'image') return <Image className="w-3.5 h-3.5 text-[#d2a8ff] shrink-0" />;
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'html':
    case 'htm': return <Layout className="w-3.5 h-3.5 text-[#ff7b72] shrink-0" />;
    case 'css': return <Type className="w-3.5 h-3.5 text-[#79c0ff] shrink-0" />;
    case 'js':
    case 'mjs':
    case 'cjs': return <Braces className="w-3.5 h-3.5 text-[#d2a8ff] shrink-0" />;
    case 'ts':
    case 'tsx': return <FileCode className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />;
    case 'json': return <FileCode className="w-3.5 h-3.5 text-[#7ee787] shrink-0" />;
    default: return <FileText className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />;
  }
}

// ────────────────────────────────────────────────────────────────
// SCROLL PERF: Iterative flatten instead of recursive
// ────────────────────────────────────────────────────────────────
function getVisibleNodesIterative(nodes: TreeNode[], openFolders: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  const stack: TreeNode[] = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    if (node.type === 'folder' && openFolders.has(node.name) && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// FIX #11: Build a Map<folderPath, filePath[]> for O(1) lookups
// ────────────────────────────────────────────────────────────────
function buildFolderFileMap(filePaths: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const path of filePaths) {
    const parts = path.split('/');
    let folderPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      folderPath = folderPath ? `${folderPath}/${parts[i]}` : parts[i];
      const arr = map.get(folderPath);
      if (arr) arr.push(path);
      else map.set(folderPath, [path]);
    }
  }
  return map;
}

// ────────────────────────────────────────────────────────────────
// SCROLL PERF: Memoized TreeItem — only re-renders when props change
// ────────────────────────────────────────────────────────────────
const TreeItem = memo(({
  node,
  isActive,
  isOpen,
  isSelected,
  onToggle,
  onSelect,
  onDelete,
  onContextMenu,
  onToggleSelect,
  style,
}: {
  node: TreeNode;
  isActive: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDelete: (node: TreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onToggleSelect: (name: string) => void;
  style: React.CSSProperties;
}) => {
  const isFolder = node.type === 'folder';
  const paddingLeft = node.depth * 14 + (isFolder ? 6 : 22);

  const handleToggle = useCallback(() => onToggle(node.name), [onToggle, node.name]);
  const handleSelect = useCallback(() => onSelect(node.name), [onSelect, node.name]);
  const handleDelete = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onDelete(node); }, [onDelete, node]);
  const handleContextMenu = useCallback((e: React.MouseEvent) => onContextMenu(e, node), [onContextMenu, node]);
  const handleToggleSelect = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onToggleSelect(node.name); }, [onToggleSelect, node.name]);

  return (
    <div style={{ ...style, paddingLeft }} className="absolute left-0 right-0 will-change-transform">
      {isFolder ? (
        <div
          onContextMenu={handleContextMenu}
          className="group flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded-sm transition-colors cursor-pointer select-none text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
        >
          <button onClick={handleToggleSelect} className="shrink-0 text-[#8b949e] hover:text-[#c9d1d9]">
            {isSelected ? <CheckSquare className="w-3 h-3 text-[#58a6ff]" /> : <Square className="w-3 h-3" />}
          </button>

          <button onClick={handleToggle} className="shrink-0">
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          <button onClick={handleToggle} className="shrink-0">
            {isOpen
              ? <FolderOpen className="w-3.5 h-3.5 text-[#e3b341]" />
              : <Folder className="w-3.5 h-3.5 text-[#e3b341]" />
            }
          </button>

          <span onClick={handleToggle} className="truncate font-medium flex-1">{node.displayName}</span>
          <span className="text-[9px] text-[#484f58] shrink-0">{node.childCount} items</span>

          <button onClick={handleDelete} className="shrink-0 p-0.5 hover:bg-[#30363d] rounded opacity-0 group-hover:opacity-100 transition text-[#f85149]">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div
          onContextMenu={handleContextMenu}
          className={`group flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded-sm transition-colors cursor-pointer select-none ${
            isActive
              ? 'bg-[#1f6feb]/20 text-[#58a6ff]'
              : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]'
          }`}
        >
          <button onClick={handleToggleSelect} className="shrink-0">
            {isSelected ? <CheckSquare className="w-3 h-3 text-[#58a6ff]" /> : <Square className="w-3 h-3" />}
          </button>

          <span onClick={handleSelect} className="shrink-0">
            {getFileIcon(node.name, node.fileType)}
          </span>

          <span onClick={handleSelect} className="truncate flex-1">{node.displayName}</span>

          <button onClick={handleDelete} className="shrink-0 p-0.5 hover:bg-[#30363d] rounded opacity-0 group-hover:opacity-100 transition text-[#f85149]">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
});

TreeItem.displayName = 'TreeItem';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function FileExplorer() {
  const { files, folders, activeFile, openFile, closeFile, createFolder, deleteFolder, updateFile, deleteFile } = useWorkspaceStore();

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
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode | null }>({ x: 0, y: 0, node: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ────────────────────────────────────────────────────────────────
  // SCROLL PERF: Use ref + rAF instead of state for scroll position
  // ────────────────────────────────────────────────────────────────
  const scrollTopRef = useRef(0);
  const [, forceRender] = useState(0);

  const containerHeightRef = useRef(600);

  // ────────────────────────────────────────────────────────────────
  // FIX #3: Memoize fileNames to avoid new array every render
  // ────────────────────────────────────────────────────────────────
  const fileNames = useMemo(() => Object.keys(files), [files]);

  const debouncedSearch = useDebounce(searchQuery, 150);

  // ────────────────────────────────────────────────────────────────
  // FIX #1: Replace useState + useEffect + startTransition with useMemo
  // FIX #2: Remove useTransition entirely
  // ────────────────────────────────────────────────────────────────
  const folderTree = useMemo(() => {
    return buildFolderTree(
      fileNames,
      folders,
      files as Record<string, { type?: 'text' | 'image' | 'binary' }>
    );
  }, [fileNames, folders, files]);

  // ────────────────────────────────────────────────────────────────
  // FIX #11: O(1) folder→files map for fast deletion lookups
  // ────────────────────────────────────────────────────────────────
  const folderFileMap = useMemo(() => buildFolderFileMap(fileNames), [fileNames]);

  // ────────────────────────────────────────────────────────────────
  // FIX #12: Search without mutating memoized tree nodes
  // Create a lightweight mask instead of mutating the tree
  // ────────────────────────────────────────────────────────────────
  const filteredTree = useMemo(() => {
    if (!debouncedSearch.trim()) return folderTree;
    const q = debouncedSearch.toLowerCase();

    const filterNodes = (nodes: readonly TreeNode[]): TreeNode[] => {
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
  }, [folderTree, debouncedSearch]);

  // ────────────────────────────────────────────────────────────────
  // SCROLL PERF: Memoize visible nodes so they don't rebuild on scroll
  // ────────────────────────────────────────────────────────────────
  const visibleNodes = useMemo(() => {
    return getVisibleNodesIterative(filteredTree, openFolders);
  }, [filteredTree, openFolders]);

  const ITEM_HEIGHT = 24;
  const OVERSCAN = 5;
  const totalHeight = visibleNodes.length * ITEM_HEIGHT;

  // ────────────────────────────────────────────────────────────────
  // SCROLL PERF: rAF throttled scroll handler — no React state updates
  // ────────────────────────────────────────────────────────────────
  const rafIdRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    scrollTopRef.current = container.scrollTop;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      forceRender(n => n + 1);
    });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [handleScroll]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeightRef.current = entry.contentRect.height;
        forceRender(n => n + 1);
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

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

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

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

  const clearSelection = useCallback(() => setSelectedFiles(new Set()), []);

  // ────────────────────────────────────────────────────────────────
  // FIX #11: O(1) folder file lookup instead of recursive tree walk
  // ────────────────────────────────────────────────────────────────
  const getAllFilesInNode = useCallback((node: TreeNode): string[] => {
    if (node.type === 'file') return [node.name];
    const direct = folderFileMap.get(node.name);
    if (direct) return [...direct];
    return node.children.flatMap(getAllFilesInNode);
  }, [folderFileMap]);

  const handleDelete = useCallback(async (node: TreeNode) => {
    if (node.type === 'folder') {
      const childFiles = getAllFilesInNode(node);
      const count = childFiles.length;
      if (!window.confirm(`Delete folder "${node.displayName}" and ${count} file${count > 1 ? 's' : ''}?`)) return;

      await deleteFolderContents(node.name);
      deleteFolder(node.name);
      showToast(`Deleted folder "${node.displayName}"`, 'info');
    } else {
      if (!window.confirm(`Delete "${node.displayName}"?`)) return;
      const meta = (files as Record<string, { type?: string }>)[node.name];
      if (meta?.type === 'image') {
        await deleteBlob(node.name);
      } else {
        await deleteContent(node.name);
      }
      deleteFile(node.name);
      closeFile(node.name);
      showToast(`Deleted "${node.displayName}"`, 'info');
    }
    clearSelection();
    setContextMenu(prev => ({ ...prev, node: null }));
  }, [files, closeFile, showToast, clearSelection, getAllFilesInNode, deleteFolder, deleteFile]);

  // ────────────────────────────────────────────────────────────────
  // FIX #8: Parallelize deleteSelected with Promise.all
  // ────────────────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    if (!window.confirm(`Delete ${selectedFiles.size} selected file${selectedFiles.size > 1 ? 's' : ''}?`)) return;

    await Promise.all(
      [...selectedFiles].map(async (path) => {
        const meta = (files as Record<string, { type?: string }>)[path];
        if (meta?.type === 'image') {
          await deleteBlob(path);
        } else {
          await deleteContent(path);
        }
        deleteFile(path);
        closeFile(path);
      })
    );

    showToast(`Deleted ${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''}`, 'info');
    clearSelection();
  }, [files, selectedFiles, closeFile, showToast, clearSelection, deleteFile]);

  const handleRename = useCallback((node: TreeNode) => {
    setRenamingFile(node.name);
    setRenameValue(node.name);
    setContextMenu(prev => ({ ...prev, node: null }));
  }, []);

  // ────────────────────────────────────────────────────────────────
  // FIX #5: Preserve binary blobs on rename using getBlob()
  // getBlob returns Promise<Blob | null> — proper type, no casting needed
  // ────────────────────────────────────────────────────────────────
  const handleRenameSubmit = useCallback(async () => {
    if (!renamingFile || !renameValue.trim() || renameValue === renamingFile) {
      setRenamingFile(null);
      setRenameValue('');
      return;
    }
    const newName = renameValue.trim();
    if (fileNames.some(f => f === newName)) {
      showToast(`"${newName}" already exists`, 'error');
      setRenamingFile(null);
      setRenameValue('');
      return;
    }

    const meta = (files as Record<string, { type?: string }>)[renamingFile];

    if (meta?.type === 'image') {
      const blob = await getBlob(renamingFile);
      if (blob) {
        await saveBlob(newName, blob);
        await deleteBlob(renamingFile);
      }
      const storedRef = (files as Record<string, string>)[renamingFile] || '';
      updateFile(newName, storedRef);
    } else {
      const oldContent = (files as Record<string, string>)[renamingFile] || await getContent(renamingFile) || '';
      updateFile(newName, oldContent);
      await saveContent(newName, oldContent);
      await deleteContent(renamingFile);
    }

    deleteFile(renamingFile);

    if (activeFile === renamingFile) {
      useWorkspaceStore.setState({ activeFile: newName });
    }

    showToast(`Renamed to "${newName}"`, 'success');
    setRenamingFile(null);
    setRenameValue('');
  }, [renamingFile, renameValue, files, fileNames, activeFile, updateFile, showToast, deleteFile]);

  const startCreateFile = useCallback((targetFolder: string | null = null) => {
    setNewFileTargetFolder(targetFolder);
    setShowNewFile(true);
    setShowNewFolder(false);
    setContextMenu(prev => ({ ...prev, node: null }));
  }, []);

  // ────────────────────────────────────────────────────────────────
  // FIX #6: Persist new file to IndexedDB immediately
  // ────────────────────────────────────────────────────────────────
  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) return;

    let name = newFileName.trim();
    if (newFileTargetFolder) {
      name = `${newFileTargetFolder}/${name}`;
    }

    if (name in files) {
      showToast(`"${name}" already exists`, 'error');
      return;
    }

    updateFile(name, '');
    await saveContent(name, '');
    openFile(name);
    setNewFileName('');
    setShowNewFile(false);
    setNewFileTargetFolder(null);
    showToast(`"${name}" created`, 'success');

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

  const startCreateFolder = useCallback((targetFolder: string | null = null) => {
    setNewFolderTarget(targetFolder);
    setShowNewFolder(true);
    setShowNewFile(false);
    setContextMenu(prev => ({ ...prev, node: null }));
  }, []);

  // ────────────────────────────────────────────────────────────────
  // FIX #7: Folder creation — persist if storage API available
  // NOTE: saveFolder() does NOT exist in fileStorage.ts.
  // Folders are only tracked in Zustand state. To persist them across
  // refreshes, add a 'folders' objectStore to IndexedDB in fileStorage.ts
  // and export saveFolder/getFolders/deleteFolder functions.
  // ────────────────────────────────────────────────────────────────
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    let folderPath = newFolderName.trim();
    if (newFolderTarget) {
      folderPath = `${newFolderTarget}/${folderPath}`;
    }

    createFolder(folderPath);
    setNewFolderName('');
    setShowNewFolder(false);
    setNewFolderTarget(null);
    showToast(`Folder "${folderPath}" created`, 'success');

    setOpenFolders(prev => {
      const next = new Set(prev);
      next.add(folderPath);
      return next;
    });
  }, [newFolderName, newFolderTarget, createFolder, showToast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(window.innerWidth - 180, e.clientX),
      y: Math.min(window.innerHeight - 200, e.clientY),
      node,
    });
  }, []);

  // ─── UPDATED: SMART FOLDER UPLOAD (with concurrency & retry) ─────
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const fileArray = Array.from(fileList);
    const totalFiles = fileArray.length;
    console.log(`[Upload] Selected ${totalFiles} files`);

    const DIRECT_LIMIT = 500;
    const BATCH_SIZE = 500;
    const CONCURRENCY = 3;
    const MAX_RETRIES = 3;
    const useBatch = totalFiles > DIRECT_LIMIT;

    if (totalFiles > 5000) {
      if (!window.confirm(
        `You selected ${totalFiles.toLocaleString()} files.\\n\\n` +
        `This will be uploaded in batches of ${BATCH_SIZE} (${Math.ceil(totalFiles / BATCH_SIZE)} batches) to the server.\\n` +
        `It may take several minutes. Continue?`
      )) {
        e.target.value = '';
        return;
      }
    }

    setImporting(true);
    setImportProgress({ current: 0, total: totalFiles });

    try {
      if (!useBatch) {
        const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp']);
        const folderPaths = new Set<string>();
        let savedCount = 0;
        const BATCH_UPDATE = 50;
        let batchFiles: Record<string, string> = {};

        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];
          const path = (file as any).webkitRelativePath || file.name;
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const isImage = imageExts.has(ext);

          const parts = path.split('/');
          let folderPath = '';
          for (let j = 0; j < parts.length - 1; j++) {
            folderPath = folderPath ? `${folderPath}/${parts[j]}` : parts[j];
            folderPaths.add(folderPath);
          }

          if (isImage) {
            await saveBlob(path, file);
            batchFiles[path] = '';
          } else {
            const content = await file.text();
            await saveContent(path, content);
            batchFiles[path] = content;
          }

          savedCount++;

          // FIX #9: Throttle progress updates (every 25 files)
          if (savedCount % 25 === 0 || savedCount === totalFiles) {
            setImportProgress({ current: savedCount, total: totalFiles });
          }

          if (savedCount % BATCH_UPDATE === 0 || savedCount === totalFiles) {
            const currentFiles = useWorkspaceStore.getState().files;
            const currentFolders = useWorkspaceStore.getState().folders;
            const mergedFiles = { ...currentFiles, ...batchFiles };
            const mergedFolders = [...currentFolders];
            for (const folder of folderPaths) {
              if (!mergedFolders.includes(folder)) {
                mergedFolders.push(folder);
              }
            }
            useWorkspaceStore.setState({
              files: mergedFiles,
              folders: mergedFolders,
            });
            batchFiles = {};
            await new Promise(r => setTimeout(r, 0));
          }
        }

        setImportProgress({ current: savedCount, total: totalFiles });
        showToast(`Successfully uploaded ${savedCount} files`, 'success');
        return;
      }

      const API_BASE = 'http://localhost:5002/api';
      const batches: File[][] = [];
      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
        batches.push(fileArray.slice(i, i + BATCH_SIZE));
      }

      let uploadedCount = 0;
      const allFileData: any[] = [];
      const folderPaths = new Set<string>();

      const uploadBatchWithRetry = async (batch: File[], batchIndex: number, attempt = 1): Promise<any[]> => {
        const formData = new FormData();
        batch.forEach(file => formData.append('files', file));
        formData.append('batchNumber', String(batchIndex + 1));
        formData.append('totalBatches', String(batches.length));

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);

          const response = await fetch(`${API_BASE}/upload/folder-batch`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Batch ${batchIndex + 1} failed (${response.status}): ${errorText || response.statusText}`);
          }

          const result = await response.json();
          if (!result.success) {
            throw new Error(`Batch ${batchIndex + 1} returned success: false`);
          }

          return result.files || [];
        } catch (error) {
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.warn(`[Upload] Batch ${batchIndex + 1} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
            await new Promise(r => setTimeout(r, delay));
            return uploadBatchWithRetry(batch, batchIndex, attempt + 1);
          }
          throw error;
        }
      };

      const processQueue = async () => {
        let batchIndex = 0;
        const running: Promise<void>[] = [];

        const runBatch = async (index: number) => {
          const batch = batches[index];
          const files = await uploadBatchWithRetry(batch, index);
          allFileData.push(...files);

          files.forEach((fileData: any) => {
            const path = fileData.filename;
            const parts = path.split('/');
            let folderPath = '';
            for (let j = 0; j < parts.length - 1; j++) {
              folderPath = folderPath ? `${folderPath}/${parts[j]}` : parts[j];
              folderPaths.add(folderPath);
            }
          });

          uploadedCount += batch.length;

          if (uploadedCount % 25 === 0 || uploadedCount === totalFiles) {
            setImportProgress({ current: uploadedCount, total: totalFiles });
          }
        };

        while (batchIndex < batches.length || running.length > 0) {
          while (running.length < CONCURRENCY && batchIndex < batches.length) {
            const currentIndex = batchIndex++;
            const promise = runBatch(currentIndex).finally(() => {
              const idx = running.indexOf(promise as any);
              if (idx > -1) running.splice(idx, 1);
            });
            running.push(promise as any);
          }

          if (running.length > 0) {
            await Promise.race(running);
          }
        }
      };

      await processQueue();

      setImportProgress({ current: uploadedCount, total: totalFiles });

      const zustandFiles: Record<string, string> = {};
      for (const fileData of allFileData) {
        zustandFiles[fileData.filename] = fileData.content || '';
      }

      const currentFiles = useWorkspaceStore.getState().files;
      const currentFolders = useWorkspaceStore.getState().folders;
      useWorkspaceStore.setState({
        files: { ...currentFiles, ...zustandFiles },
        folders: [...new Set([...currentFolders, ...folderPaths])],
      });

      showToast(`Uploaded ${uploadedCount} files in ${batches.length} batches`, 'success');
    } catch (error) {
      console.error('[Upload] Error:', error);
      showToast(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [showToast]);

  const handleZipUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file.name.endsWith('.zip')) {
      showToast('Please select a .zip file', 'error');
      e.target.value = '';
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: 1 });

    try {
      const formData = new FormData();
      formData.append('zip', file);
      const response = await fetch('http://localhost:5002/api/upload/zip', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'ZIP upload failed');
      }
      const result = await response.json();
      if (result.success && result.files) {
        const entries = Object.entries(result.files);
        const total = entries.length;
        setImportProgress({ current: 0, total });

        const zustandFiles: Record<string, string> = {};
        const folderPaths = new Set<string>();

        for (let i = 0; i < entries.length; i++) {
          const [path, content] = entries[i];
          zustandFiles[path] = content as string;
          const parts = path.split('/');
          let folderPath = '';
          for (let j = 0; j < parts.length - 1; j++) {
            folderPath = folderPath ? `${folderPath}/${parts[j]}` : parts[j];
            folderPaths.add(folderPath);
          }
          if (i % 25 === 0) {
            setImportProgress({ current: i, total });
            await new Promise(r => setTimeout(r, 0));
          }
        }

        setImportProgress({ current: total, total });

        const currentFiles = useWorkspaceStore.getState().files;
        const currentFolders = useWorkspaceStore.getState().folders;
        useWorkspaceStore.setState({
          files: { ...currentFiles, ...zustandFiles },
          folders: [...currentFolders, ...folderPaths],
        });

        showToast(`Extracted ${total} files from ZIP`, 'success');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('[Upload] ZIP error:', error);
      showToast(`ZIP upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  }, [showToast]);

  const toggleSettings = useCallback(() => window.dispatchEvent(new CustomEvent('toggle-settings')), []);
  const toggleAccount = useCallback(() => window.dispatchEvent(new CustomEvent('toggle-account')), []);

  const isFileSelected = useCallback((name: string) => selectedFiles.has(name), [selectedFiles]);

  // ────────────────────────────────────────────────────────────────
  // SCROLL PERF: Compute slice from refs, not state
  // ────────────────────────────────────────────────────────────────
  const scrollTop = scrollTopRef.current;
  const containerHeight = containerHeightRef.current;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(visibleNodes.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
  const visibleSlice = visibleNodes.slice(startIndex, endIndex);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] min-w-0">
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

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="Import Folder"
            disabled={importing}
          >
            <Upload className={`w-3.5 h-3.5 ${importing ? 'text-[#58a6ff] animate-pulse' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`} />
          </button>

          <button
            onClick={() => zipInputRef.current?.click()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="Upload ZIP"
            disabled={importing}
          >
            <FileArchive className={`w-3.5 h-3.5 ${importing ? 'text-[#58a6ff] animate-pulse' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`} />
          </button>

          <button onClick={() => startCreateFile()} className="p-1 hover:bg-[#30363d] rounded transition" title="New File">
            <FilePlus className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
          </button>
          <button onClick={() => startCreateFolder()} className="p-1 hover:bg-[#30363d] rounded transition" title="New Folder">
            <FolderPlus className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleImport}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleZipUpload}
      />

      {importing && (
        <div className="px-3 py-2 bg-[#1f6feb]/10 border-b border-[#30363d] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-[#58a6ff]">
              {importProgress.total === 0 ? 'Processing...' : `Importing ${importProgress.current} / ${importProgress.total}`}
            </span>
          </div>
          <div className="w-full h-1 bg-[#21262d] rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-[#58a6ff] transition-all"
              style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

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

      <div className="px-3 py-2 flex items-center gap-2 border-b border-[#21262d] shrink-0">
        <ChevronDown className="w-3 h-3 text-[#8b949e]" />
        <span className="text-[11px] font-bold text-[#c9d1d9]">AI CODE WORKSPACE</span>
        <span className="text-[9px] text-[#484f58] ml-auto">
          {`${fileNames.length} files`}
        </span>
      </div>

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
              if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); setNewFileTargetFolder(null); }
            }}
            placeholder="filename.js"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58]"
            autoFocus
          />
        </div>
      )}

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
              if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); setNewFolderTarget(null); }
            }}
            placeholder="folder-name"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58]"
            autoFocus
          />
        </div>
      )}

      {renamingFile && (
        <div className="px-3 py-1.5 border-b border-[#21262d] shrink-0">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setRenamingFile(null); setRenameValue(''); }
            }}
            onBlur={handleRenameSubmit}
            className="w-full bg-[#0d1117] border border-[#58a6ff] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none"
            autoFocus
          />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar relative"
        style={{ contain: 'strict' }}
      >
        {filteredTree.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="text-[11px] text-[#484f58] mb-4">
              {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No files or folders yet'}
            </div>
            {!debouncedSearch && (
              <div className="flex flex-col gap-2 items-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md text-[11px] text-[#c9d1d9] transition border border-[#30363d]"
                >
                  <Upload className="w-4 h-4 text-[#58a6ff]" /> Import Folder
                </button>
                <button
                  onClick={() => zipInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md text-[11px] text-[#c9d1d9] transition border border-[#30363d]"
                >
                  <FileArchive className="w-4 h-4 text-[#e3b341]" /> Upload ZIP
                </button>
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
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleSlice.map((node, idx) => (
              <TreeItem
                key={node.name}
                node={node}
                isActive={activeFile === node.name}
                isOpen={isFolderOpen(node.name)}
                isSelected={isFileSelected(node.name)}
                onToggle={toggleFolder}
                onSelect={openFile}
                onDelete={handleDelete}
                onContextMenu={handleContextMenu}
                onToggleSelect={toggleSelect}
                style={{ height: ITEM_HEIGHT, top: (startIndex + idx) * ITEM_HEIGHT }}
              />
            ))}
          </div>
        )}
      </div>

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
                onClick={() => { setNewFileTargetFolder(contextMenu.node!.name); setShowNewFile(true); setContextMenu(prev => ({ ...prev, node: null })); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <FilePlus className="w-3.5 h-3.5 text-[#58a6ff]" /> New File
              </button>
              <button
                onClick={() => { setNewFolderTarget(contextMenu.node!.name); setShowNewFolder(true); setContextMenu(prev => ({ ...prev, node: null })); }}
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



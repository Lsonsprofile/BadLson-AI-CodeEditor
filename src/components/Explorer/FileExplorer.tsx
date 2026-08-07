// src/components/Explorer/FileExplorer.tsx
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
  Copy,
  ClipboardPaste,
  Download,
  Film,
  Music,
  Book,
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
import JSZip from 'jszip';

// ─── Extensions ─────────────────────────────────────────────────────
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
const DOCUMENT_EXTENSIONS = ['pdf', 'epub', 'mobi'];
const BINARY_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
];

// ─── Type declarations ──────────────────────────────────────────────
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
  fileType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'binary';
}

// ────────────────────────────────────────────────────────────────
// Build folder tree – now detects more file types
// ────────────────────────────────────────────────────────────────
function buildFolderTree(
  filePaths: string[],
  folderPaths: string[]
): TreeNode[] {
  if (filePaths.length === 0 && folderPaths.length === 0) return [];

  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();
  const seen = new Set<string>();

  const folderSet = new Set(folderPaths);
  const fileSet = new Set(filePaths);
  const allPaths = [...folderPaths, ...filePaths];

  const getFileTypeFromExt = (name: string): 'text' | 'image' | 'video' | 'audio' | 'document' | 'binary' => {
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
    if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
    if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
    return 'text';
  };

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
          fileType: getFileTypeFromExt(part),
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

// ────────────────────────────────────────────────────────────────
// File icon – now supports audio, PDF, EPUB, etc.
// ────────────────────────────────────────────────────────────────
function getFileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return <Image className="w-3.5 h-3.5 text-[#d2a8ff] shrink-0" />;
  }
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return <Film className="w-3.5 h-3.5 text-[#ff7b72] shrink-0" />;
  }
  if (AUDIO_EXTENSIONS.includes(ext)) {
    return <Music className="w-3.5 h-3.5 text-[#7ee787] shrink-0" />;
  }
  if (ext === 'pdf') {
    return <FileText className="w-3.5 h-3.5 text-[#f85149] shrink-0" />;
  }
  if (ext === 'epub' || ext === 'mobi') {
    return <Book className="w-3.5 h-3.5 text-[#e3b341] shrink-0" />;
  }
  if (ext === 'html' || ext === 'htm') {
    return <Layout className="w-3.5 h-3.5 text-[#e34c26] shrink-0" />;
  }
  if (ext === 'css') {
    return <Type className="w-3.5 h-3.5 text-[#264de4] shrink-0" />;
  }
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    return <Braces className="w-3.5 h-3.5 text-[#f7df1e] shrink-0" />;
  }
  if (ext === 'ts' || ext === 'tsx') {
    return <FileCode className="w-3.5 h-3.5 text-[#007acc] shrink-0" />;
  }
  if (ext === 'json') {
    return <FileCode className="w-3.5 h-3.5 text-[#f5b041] shrink-0" />;
  }
  return <FileText className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />;
}

// ────────────────────────────────────────────────────────────────
// Scroll helpers (unchanged)
// ────────────────────────────────────────────────────────────────
function getVisibleNodesIterative(
  nodes: TreeNode[],
  openFolders: Set<string>
): TreeNode[] {
  const result: TreeNode[] = [];
  const stack: TreeNode[] = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    if (
      node.type === 'folder' &&
      openFolders.has(node.name) &&
      node.children.length > 0
    ) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  return result;
}

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
// Memoized TreeItem (unchanged)
// ────────────────────────────────────────────────────────────────
const TreeItem = memo(
  ({
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

    const handleToggle = useCallback(
      () => onToggle(node.name),
      [onToggle, node.name]
    );
    const handleSelect = useCallback(
      () => onSelect(node.name),
      [onSelect, node.name]
    );
    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete(node);
      },
      [onDelete, node]
    );
    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => onContextMenu(e, node),
      [onContextMenu, node]
    );
    const handleToggleSelect = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleSelect(node.name);
      },
      [onToggleSelect, node.name]
    );

    return (
      <div
        style={{ ...style, paddingLeft }}
        className="absolute left-0 right-0 will-change-transform"
      >
        {isFolder ? (
          <div
            onContextMenu={handleContextMenu}
            className="group flex items-center gap-1.5 w-full px-2 py-0.5 text-[11px] rounded-sm transition-colors cursor-pointer select-none text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
          >
            <button
              onClick={handleToggleSelect}
              className="shrink-0 text-[#8b949e] hover:text-[#c9d1d9]"
            >
              {isSelected ? (
                <CheckSquare className="w-3 h-3 text-[#58a6ff]" />
              ) : (
                <Square className="w-3 h-3" />
              )}
            </button>

            <button onClick={handleToggle} className="shrink-0">
              {isOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>

            <button onClick={handleToggle} className="shrink-0">
              {isOpen ? (
                <FolderOpen className="w-3.5 h-3.5 text-[#e3b341]" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-[#e3b341]" />
              )}
            </button>

            <span
              onClick={handleToggle}
              className="truncate font-medium flex-1"
            >
              {node.displayName}
            </span>
            <span className="text-[9px] text-[#484f58] shrink-0">
              {node.childCount} items
            </span>

            <button
              onClick={handleDelete}
              className="shrink-0 p-0.5 hover:bg-[#30363d] rounded opacity-0 group-hover:opacity-100 transition text-[#f85149]"
            >
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
            <button
              onClick={handleToggleSelect}
              className="shrink-0"
            >
              {isSelected ? (
                <CheckSquare className="w-3 h-3 text-[#58a6ff]" />
              ) : (
                <Square className="w-3 h-3" />
              )}
            </button>

            <span onClick={handleSelect} className="shrink-0">
              {getFileIcon(node.name)}
            </span>

            <span onClick={handleSelect} className="truncate flex-1">
              {node.displayName}
            </span>

            <button
              onClick={handleDelete}
              className="shrink-0 p-0.5 hover:bg-[#30363d] rounded opacity-0 group-hover:opacity-100 transition text-[#f85149]"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }
);

TreeItem.displayName = 'TreeItem';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ────────────────────────────────────────────────────────────────
// Main FileExplorer component
// ────────────────────────────────────────────────────────────────
export default function FileExplorer() {
  const {
    files,
    folders,
    activeFile,
    openFile,
    closeFile,
    createFolder,
    deleteFolder,
    updateFile,
    deleteFile,
  } = useWorkspaceStore();

  // ── Clipboard state (supports copy or cut/move)
  const [clipboard, setClipboard] = useState<{ items: string[]; mode: 'copy' | 'cut' }>({ items: [], mode: 'copy' });

  // ── UI states ─────────────────────────────────────────────────
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

  // ── Undo stack (stores recent deletes/moves for undo)
  type UndoItem = { path: string; isBinary: boolean; content?: string; blob?: Blob };
  type UndoAction = { kind: 'delete' | 'move'; items: Array<UndoItem & { dest?: string }> };
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode | null;
  }>({ x: 0, y: 0, node: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null); // 👈 for single file import
  const zipInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollTopRef = useRef(0);
  const [, forceRender] = useState(0);
  const containerHeightRef = useRef(600);

  // ── Derived data ──────────────────────────────────────────────
  const fileNames = useMemo(() => Object.keys(files), [files]);
  const debouncedSearch = useDebounce(searchQuery, 150);

  const folderTree = useMemo(
    () => buildFolderTree(fileNames, folders),
    [fileNames, folders]
  );

  const folderFileMap = useMemo(() => buildFolderFileMap(fileNames), [fileNames]);

  const filteredTree = useMemo(() => {
    if (!debouncedSearch.trim()) return folderTree;
    const q = debouncedSearch.toLowerCase();

    const filterNodes = (nodes: readonly TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.type === 'folder') {
          const filteredChildren = filterNodes(node.children);
          if (
            filteredChildren.length > 0 ||
            node.displayName.toLowerCase().includes(q)
          ) {
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

  const visibleNodes = useMemo(
    () => getVisibleNodesIterative(filteredTree, openFolders),
    [filteredTree, openFolders]
  );

  const ITEM_HEIGHT = 24;
  const OVERSCAN = 5;
  const totalHeight = visibleNodes.length * ITEM_HEIGHT;

  // ── Scroll handling (unchanged) ──────────────────────────────
  const rafIdRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    scrollTopRef.current = container.scrollTop;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      forceRender((n) => n + 1);
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
        forceRender((n) => n + 1);
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu((prev) => ({ ...prev, node: null }));
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toastMsg');
      if (!toast || !toastMsg) return;
      toastMsg.textContent = message;
      toast.classList.remove('opacity-0', 'pointer-events-none');
      toast.classList.add('opacity-100');
      toast.style.borderColor =
        type === 'error' ? '#f85149' : type === 'info' ? '#58a6ff' : '#238636';
      setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
      }, 2500);
    },
    []
  );

  // ── Tree actions (unchanged) ──────────────────────────────────
  const toggleFolder = useCallback((path: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const isFolderOpen = useCallback(
    (path: string) => openFolders.has(path),
    [openFolders]
  );

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allNames: string[] = [];
    const collect = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        if (n.type === 'file') allNames.push(n.name);
        else collect(n.children);
      });
    };
    collect(filteredTree);
    setSelectedFiles(new Set(allNames));
  }, [filteredTree]);

  const clearSelection = useCallback(() => setSelectedFiles(new Set()), []);

  const getAllFilesInNode = useCallback(
    (node: TreeNode): string[] => {
      if (node.type === 'file') return [node.name];
      const direct = folderFileMap.get(node.name);
      if (direct) return [...direct];
      return node.children.flatMap(getAllFilesInNode);
    },
    [folderFileMap]
  );

  // ── Delete (handles video too) ─────────────────────────────────
  const handleDelete = useCallback(
    async (node: TreeNode) => {
      // capture data for undo
      if (node.type === 'folder') {
        const childFiles = getAllFilesInNode(node);
        const count = childFiles.length;
        if (
          !window.confirm(
            `Delete folder "${node.displayName}" and ${count} file${count > 1 ? 's' : ''}?`
          )
        )
          return;

        const items: UndoItem[] = [];
        for (const file of childFiles) {
          const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
          const isBinary = BINARY_EXTENSIONS.includes(ext);
          if (isBinary) {
            const blob = await getBlob(file);
            if (blob) items.push({ path: file, isBinary: true, blob });
          } else {
            const content = (files as Record<string, string>)[file] || (await getContent(file)) || '';
            items.push({ path: file, isBinary: false, content });
          }
        }

        await deleteFolderContents(node.name);
        deleteFolder(node.name);
        setUndoStack((s) => [...s, { kind: 'delete', items }]);
        showToast(`Deleted folder "${node.displayName}" (undo available)`, 'info');
      } else {
        if (!window.confirm(`Delete "${node.displayName}"?`)) return;
        const ext = node.name.slice(node.name.lastIndexOf('.') + 1).toLowerCase();
        const isBinary = BINARY_EXTENSIONS.includes(ext);
        if (isBinary) {
          const blob = await getBlob(node.name);
          if (blob) setUndoStack((s) => [...s, { kind: 'delete', items: [{ path: node.name, isBinary: true, blob }] }]);
          await deleteBlob(node.name);
        } else {
          const content = (files as Record<string, string>)[node.name] || (await getContent(node.name)) || '';
          setUndoStack((s) => [...s, { kind: 'delete', items: [{ path: node.name, isBinary: false, content }] }]);
          await deleteContent(node.name);
        }
        deleteFile(node.name);
        closeFile(node.name);
        showToast(`Deleted "${node.displayName}" (undo available)`, 'info');
      }
      clearSelection();
      setContextMenu((prev) => ({ ...prev, node: null }));
    },
    [
      closeFile,
      showToast,
      clearSelection,
      getAllFilesInNode,
      deleteFolder,
      deleteFile,
    ]
  );

  const handleDeleteSelected = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedFiles.size} selected file${selectedFiles.size > 1 ? 's' : ''}?`
      )
    )
      return;
    const items: UndoItem[] = [];
    for (const path of selectedFiles) {
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
      const isBinary = BINARY_EXTENSIONS.includes(ext);
      if (isBinary) {
        const blob = await getBlob(path);
        if (blob) items.push({ path, isBinary: true, blob });
        await deleteBlob(path);
      } else {
        const content = (files as Record<string, string>)[path] || (await getContent(path)) || '';
        items.push({ path, isBinary: false, content });
        await deleteContent(path);
      }
      deleteFile(path);
      closeFile(path);
    }

    setUndoStack((s) => [...s, { kind: 'delete', items }]);
    showToast(`Deleted ${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''} (undo available)`, 'info');
    clearSelection();
  }, [selectedFiles, closeFile, showToast, clearSelection, deleteFile]);

  // ── Rename (handles video too) ─────────────────────────────────
  const handleRename = useCallback((node: TreeNode) => {
    setRenamingFile(node.name);
    setRenameValue(node.name);
    setContextMenu((prev) => ({ ...prev, node: null }));
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingFile || !renameValue.trim() || renameValue === renamingFile) {
      setRenamingFile(null);
      setRenameValue('');
      return;
    }
    const newName = renameValue.trim();
    if (fileNames.some((f) => f === newName)) {
      showToast(`"${newName}" already exists`, 'error');
      setRenamingFile(null);
      setRenameValue('');
      return;
    }

    const ext = renamingFile.slice(renamingFile.lastIndexOf('.') + 1).toLowerCase();
    const isBinary = BINARY_EXTENSIONS.includes(ext);

    if (isBinary) {
      const blob = await getBlob(renamingFile);
      if (blob) {
        await saveBlob(newName, blob);
        await deleteBlob(renamingFile);
      }
      const storedRef = (files as Record<string, string>)[renamingFile] || '';
      updateFile(newName, storedRef);
    } else {
      const oldContent =
        (files as Record<string, string>)[renamingFile] ||
        (await getContent(renamingFile)) ||
        '';
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
  }, [
    renamingFile,
    renameValue,
    files,
    fileNames,
    activeFile,
    updateFile,
    showToast,
    deleteFile,
  ]);

  // ── Create file / folder ─────────────────────────────────────
  const startCreateFile = useCallback((targetFolder: string | null = null) => {
    setNewFileTargetFolder(targetFolder);
    setShowNewFile(true);
    setShowNewFolder(false);
    setContextMenu((prev) => ({ ...prev, node: null }));
  }, []);

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
    setOpenFolders((prev) => {
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
    setContextMenu((prev) => ({ ...prev, node: null }));
  }, []);

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

    setOpenFolders((prev) => {
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

  // ── Copy / Paste / Download ──────────────────────────────────
  const handleCopy = useCallback(() => {
    if (contextMenu.node) {
      setClipboard((prev) => ({ items: [...prev.items, contextMenu.node!.name], mode: 'copy' }));
      showToast('Copied to clipboard', 'info');
      setContextMenu((prev) => ({ ...prev, node: null }));
    }
  }, [contextMenu.node, showToast]);

  const handleCut = useCallback(() => {
    if (contextMenu.node) {
      setClipboard({ items: [contextMenu.node.name], mode: 'cut' });
      showToast('Cut to clipboard (use Paste on a folder)', 'info');
      setContextMenu((prev) => ({ ...prev, node: null }));
    }
  }, [contextMenu.node, showToast]);

  const getUniquePath = (path: string, existingPaths: Set<string>): string => {
    const dotIndex = path.lastIndexOf('.');
    const base = dotIndex > 0 ? path.slice(0, dotIndex) : path;
    const ext = dotIndex > 0 ? path.slice(dotIndex) : '';
    let counter = 1;
    let newPath = `${base} (${counter})${ext}`;
    while (existingPaths.has(newPath) || fileNames.includes(newPath)) {
      counter++;
      newPath = `${base} (${counter})${ext}`;
    }
    return newPath;
  };

  const handlePaste = useCallback(
    async (targetFolder: string | null = null) => {
      if (!clipboard.items || clipboard.items.length === 0) return;
      const existingPaths = new Set(fileNames);

      // First pass: detect conflicts
      const conflicts: Array<{ srcPath: string; intended: string; isFolder: boolean; conflictingPaths?: string[] }> = [];
      for (const srcPath of clipboard.items) {
        const baseName = srcPath.split('/').pop() || srcPath;
        const intended = targetFolder ? `${targetFolder}/${baseName}` : baseName;
        const isFolder = folders.includes(srcPath);

        // Prevent moving a folder into itself or its descendant
        if (clipboard.mode === 'cut' && isFolder && targetFolder && (targetFolder === srcPath || targetFolder.startsWith(srcPath + '/'))) {
          conflicts.push({ srcPath, intended, isFolder, conflictingPaths: ['invalid-destination'] });
          continue;
        }

        if (isFolder) {
          const childFiles = getAllFilesInNode({
            name: srcPath,
            displayName: srcPath.split('/').pop() || srcPath,
            type: 'folder',
            children: [],
            childCount: 0,
            depth: 0,
          } as TreeNode);
          const conflictingPaths: string[] = [];
          for (const childFile of childFiles) {
            const relative = childFile.slice(srcPath.length + 1);
            const newChildPath = `${intended}/${relative}`;
            if (existingPaths.has(newChildPath) || fileNames.includes(newChildPath)) {
              conflictingPaths.push(newChildPath);
            }
          }
          if (conflictingPaths.length > 0) conflicts.push({ srcPath, intended, isFolder, conflictingPaths });
        } else {
          if (existingPaths.has(intended) || fileNames.includes(intended)) conflicts.push({ srcPath, intended, isFolder, conflictingPaths: [intended] });
        }
      }

      let overwriteAll = false;
      let promptEach = true;
      if (conflicts.length > 0) {
        overwriteAll = window.confirm(`Found ${conflicts.length} conflicting item(s). Click OK to overwrite all, Cancel to confirm each.`);
        promptEach = !overwriteAll;
      }

      const skipped: string[] = [];
      const movedItems: Array<UndoItem & { dest: string }> = [];
      const deleteLater: string[] = [];

      // Second pass: perform operations, honoring overwriteAll/promptEach
      for (const srcPath of clipboard.items) {
        const baseName = srcPath.split('/').pop() || srcPath;
        const intended = targetFolder ? `${targetFolder}/${baseName}` : baseName;
        const isFolder = folders.includes(srcPath);

        const conflictEntry = conflicts.find((c) => c.srcPath === srcPath);
        if (conflictEntry) {
          if (!overwriteAll) {
            const userOk = window.confirm(`Conflict for "${srcPath}" at "${conflictEntry.intended}". Overwrite? OK = Yes, Cancel = No`);
            if (!userOk) {
              skipped.push(srcPath);
              continue;
            }
          }
          // else proceed to overwrite
        }

        if (isFolder) {
          const childFiles = getAllFilesInNode({
            name: srcPath,
            displayName: srcPath.split('/').pop() || srcPath,
            type: 'folder',
            children: [],
            childCount: 0,
            depth: 0,
          } as TreeNode);

          // create destination folder
          createFolder(intended);

          for (const childFile of childFiles) {
            const relative = childFile.slice(srcPath.length + 1);
            const newChildPath = `${intended}/${relative}`;
            const ext = childFile.slice(childFile.lastIndexOf('.') + 1).toLowerCase();
            const isBinary = BINARY_EXTENSIONS.includes(ext);
            if (isBinary) {
              const blob = await getBlob(childFile);
                if (blob) {
                // overwrite by deleting first if exists
                if (existingPaths.has(newChildPath) || fileNames.includes(newChildPath)) {
                  await deleteBlob(newChildPath).catch(() => {});
                }
                // save destination
                await saveBlob(newChildPath, blob);
                updateFile(newChildPath, '');
                // record moved item original content for undo (blob)
                if (clipboard.mode === 'cut') movedItems.push({ path: childFile, dest: newChildPath, isBinary: true, blob });
              }
              // defer deleting original until after all copies succeed
              if (clipboard.mode === 'cut') deleteLater.push(childFile);
            } else {
              const content =
                (files as Record<string, string>)[childFile] ||
                (await getContent(childFile)) ||
                '';
              if (existingPaths.has(newChildPath) || fileNames.includes(newChildPath)) {
                await deleteContent(newChildPath).catch(() => {});
              }
              updateFile(newChildPath, content);
              await saveContent(newChildPath, content);
              if (clipboard.mode === 'cut') movedItems.push({ path: childFile, dest: newChildPath, isBinary: false, content });
              // defer deleting original until after all copies succeed
              if (clipboard.mode === 'cut') deleteLater.push(childFile);
            }
            existingPaths.add(newChildPath);
          }

          // After copying children, if cut -> delete originals for this folder
          if (clipboard.mode === 'cut') {
            // delete original files saved in deleteLater that belong to this folder
            const toDelete = deleteLater.filter((p) => p.startsWith(srcPath + '/') || p === srcPath);
            for (const d of toDelete) {
              const ext = d.slice(d.lastIndexOf('.') + 1).toLowerCase();
              const isB = BINARY_EXTENSIONS.includes(ext);
              if (isB) await deleteBlob(d).catch(() => {});
              else await deleteContent(d).catch(() => {});
              deleteFile(d);
            }
            // clear those entries from deleteLater
            for (const d of toDelete) {
              const idx = deleteLater.indexOf(d);
              if (idx >= 0) deleteLater.splice(idx, 1);
            }
            // remove folder DB entries and folder state
            await deleteFolderContents(srcPath);
            deleteFolder(srcPath);
          }

          showToast(`${clipboard.mode === 'cut' ? 'Moved' : 'Copied'} folder "${srcPath}" to "${intended}"`, 'success');
        } else {
          const ext = srcPath.slice(srcPath.lastIndexOf('.') + 1).toLowerCase();
          const isBinary = BINARY_EXTENSIONS.includes(ext);
          if (isBinary) {
            const blob = await getBlob(srcPath);
            if (blob) {
              if (existingPaths.has(intended) || fileNames.includes(intended)) {
                await deleteBlob(intended).catch(() => {});
              }
              await saveBlob(intended, blob);
              updateFile(intended, '');
              if (clipboard.mode === 'cut') movedItems.push({ path: srcPath, dest: intended, isBinary: true, blob });
            }
            // defer deletion until after copies
            if (clipboard.mode === 'cut') deleteLater.push(srcPath);
          } else {
            const content =
              (files as Record<string, string>)[srcPath] ||
              (await getContent(srcPath)) ||
              '';
            if (existingPaths.has(intended) || fileNames.includes(intended)) {
              await deleteContent(intended).catch(() => {});
            }
            updateFile(intended, content);
            await saveContent(intended, content);
            if (clipboard.mode === 'cut') movedItems.push({ path: srcPath, dest: intended, isBinary: false, content });
            if (clipboard.mode === 'cut') deleteLater.push(srcPath);
          }
          existingPaths.add(intended);
        }
      }

      if (skipped.length > 0) {
        showToast(`Skipped ${skipped.length} item(s) due to user choice or invalid destination`, 'info');
      }
      // Delete any deferred originals (single files or leftovers)
      if (clipboard.mode === 'cut' && deleteLater.length > 0) {
        for (const d of deleteLater) {
          const ext = d.slice(d.lastIndexOf('.') + 1).toLowerCase();
          const isB = BINARY_EXTENSIONS.includes(ext);
          try {
            if (isB) await deleteBlob(d);
            else await deleteContent(d);
          } catch (e) {
            // ignore errors
          }
          deleteFile(d);
        }
        // clear deleteLater
        deleteLater.length = 0;
      }
      // Push undo action for moved items
      if (movedItems.length > 0) {
        setUndoStack((s) => [...s, { kind: 'move', items: movedItems }]);
      }

      // If it was a cut, clear clipboard after moving
      if (clipboard.mode === 'cut') setClipboard({ items: [], mode: 'copy' });
      setContextMenu((prev) => ({ ...prev, node: null }));
    },
    [clipboard, fileNames, folders, files, createFolder, updateFile, getAllFilesInNode, showToast, deleteFolderContents, deleteFolder, deleteFile]
  );

  const handleDownload = useCallback(
    async (node: TreeNode) => {
      if (node.type !== 'file') return;
      const path = node.name;
      const ext = path.split('.').pop()?.toLowerCase() || '';
      const isBinary = BINARY_EXTENSIONS.includes(ext);
      try {
        if (isBinary) {
          const blob = await getBlob(path);
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = node.displayName;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`Downloaded "${node.displayName}"`, 'success');
          } else {
            showToast('File not found in storage', 'error');
          }
        } else {
          const content =
            (files as Record<string, string>)[path] ||
            (await getContent(path)) ||
            '';
          const blob = new Blob([content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = node.displayName;
          a.click();
          URL.revokeObjectURL(url);
          showToast(`Downloaded "${node.displayName}"`, 'success');
        }
      } catch (err) {
        showToast('Download failed', 'error');
      }
      setContextMenu((prev) => ({ ...prev, node: null }));
    },
    [files, showToast]
  );

  // ── Folder download (ZIP) – supports videos ────────────────────
  const handleDownloadFolder = useCallback(
    async (node: TreeNode) => {
      if (node.type !== 'folder') return;

      const folderPath = node.name;
      const childFiles = fileNames.filter((path) => path.startsWith(folderPath + '/') || path === folderPath);
      const filesInFolder = childFiles.filter((p) => p !== folderPath);

      if (filesInFolder.length === 0) {
        showToast('Folder is empty', 'info');
        return;
      }

      const zip = new JSZip();
      let failedFiles: string[] = [];
      let addedCount = 0;

      const addFileToZip = async (filePath: string) => {
        try {
          const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
          const isBinary = BINARY_EXTENSIONS.includes(ext);

          if (isBinary) {
            const blob = await getBlob(filePath);
            if (blob && blob.size > 0) {
              zip.file(filePath, blob);
              console.log(`[Download Folder] Added binary: ${filePath}`);
            } else {
              const content = (files as Record<string, string>)[filePath];
              if (content && content.startsWith('data:')) {
                const response = await fetch(content);
                const fallbackBlob = await response.blob();
                if (fallbackBlob.size > 0) {
                  zip.file(filePath, fallbackBlob);
                  console.log(`[Download Folder] Added binary (fallback): ${filePath}`);
                  return;
                }
              }
              failedFiles.push(filePath);
              console.warn(`[Download Folder] Binary not found: ${filePath}`);
            }
          } else {
            const content =
              (files as Record<string, string>)[filePath] ||
              (await getContent(filePath)) ||
              '';
            zip.file(filePath, content);
            console.log(`[Download Folder] Added text: ${filePath} (${content.length} chars)`);
          }
          addedCount++;
        } catch (error) {
          failedFiles.push(filePath);
          console.error(`[Download Folder] Error adding ${filePath}:`, error);
        }
      };

      const BATCH_SIZE = 20;
      for (let i = 0; i < filesInFolder.length; i += BATCH_SIZE) {
        const batch = filesInFolder.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(addFileToZip));
      }

      if (failedFiles.length > 0) {
        showToast(`${failedFiles.length} file(s) could not be added to ZIP`, 'error');
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${node.displayName}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      if (failedFiles.length === 0) {
        showToast(`Downloaded folder "${node.displayName}" as ZIP (${addedCount} files)`, 'success');
      } else {
        showToast(`Downloaded folder with ${failedFiles.length} missing files`, 'info');
      }
      setContextMenu((prev) => ({ ...prev, node: null }));
    },
    [fileNames, files, showToast]
  );

  // ─── IMPORT HANDLERS (TWO) ──────────────────────────────────────
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

  // ── 1. Import Folder (directory) ──────────────────────────────
  const handleFolderImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      const fileArray = Array.from(fileList);
      const totalFiles = fileArray.length;

      setImporting(true);
      setImportProgress({ current: 0, total: totalFiles });

      try {
        const binaryExts = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
        const folderPaths = new Set<string>();
        let savedCount = 0;
        const BATCH_UPDATE = 50;
        let batchFiles: Record<string, string> = {};

        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];
          const path = (file as any).webkitRelativePath || file.name;
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const isBinary = binaryExts.has(ext);

          const parts = path.split('/');
          let folderPath = '';
          for (let j = 0; j < parts.length - 1; j++) {
            folderPath = folderPath ? `${folderPath}/${parts[j]}` : parts[j];
            folderPaths.add(folderPath);
          }

          if (isBinary) {
            await saveBlob(path, file);
            batchFiles[path] = '';
            console.log(`[Import Folder] Saved binary: ${path} (${file.size} bytes)`);
          } else {
            const content = await file.text();
            await saveContent(path, content);
            batchFiles[path] = content;
            console.log(`[Import Folder] Saved text: ${path} (${content.length} chars)`);
          }

          savedCount++;
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
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        setImportProgress({ current: savedCount, total: totalFiles });
        showToast(`Successfully imported ${savedCount} files from folder`, 'success');
      } catch (error) {
        showToast(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        console.error(error);
      } finally {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [showToast]
  );

  // ── 2. Import Single File ──────────────────────────────────────
  const handleSingleFileImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const file = fileList[0];
      const path = file.name;

      setImporting(true);
      setImportProgress({ current: 0, total: 1 });

      try {
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const isBinary = BINARY_EXTENSIONS.includes(ext);

        // Determine parent folder (if any)
        const parts = path.split('/');
        let folderPath = '';
        if (parts.length > 1) {
          for (let j = 0; j < parts.length - 1; j++) {
            folderPath = folderPath ? `${folderPath}/${parts[j]}` : parts[j];
          }
        }

        if (isBinary) {
          await saveBlob(path, file);
          console.log(`[Import File] Saved binary: ${path} (${file.size} bytes)`);
        } else {
          const content = await file.text();
          await saveContent(path, content);
          console.log(`[Import File] Saved text: ${path} (${content.length} chars)`);
        }

        // Update store
        const currentFiles = useWorkspaceStore.getState().files;
        const currentFolders = useWorkspaceStore.getState().folders;
        const newFiles = { ...currentFiles, [path]: isBinary ? '' : await file.text() };
        const newFolders = [...currentFolders];
        if (folderPath && !newFolders.includes(folderPath)) {
          newFolders.push(folderPath);
        }
        useWorkspaceStore.setState({
          files: newFiles,
          folders: newFolders,
        });

        setImportProgress({ current: 1, total: 1 });
        showToast(`Imported "${path}"`, 'success');
      } catch (error) {
        showToast(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        console.error(error);
      } finally {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
        if (singleFileInputRef.current) singleFileInputRef.current.value = '';
      }
    },
    [showToast]
  );

  // ── 3. ZIP Upload (unchanged) ──────────────────────────────────
  const handleZipUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const response = await fetch(`${API_BASE}/upload/zip`, {
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
              await new Promise((r) => setTimeout(r, 0));
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
        showToast(
          `ZIP upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setImporting(false);
        setImportProgress({ current: 0, total: 0 });
        if (zipInputRef.current) zipInputRef.current.value = '';
      }
    },
    [showToast, API_BASE]
  );

  const toggleSettings = useCallback(
    () => window.dispatchEvent(new CustomEvent('toggle-settings')),
    []
  );
  const toggleAccount = useCallback(
    () => window.dispatchEvent(new CustomEvent('toggle-account')),
    []
  );

  const isFileSelected = useCallback(
    (name: string) => selectedFiles.has(name),
    [selectedFiles]
  );

  const handleUndo = useCallback(async () => {
    const stack = [...undoStack];
    if (stack.length === 0) return;
    const action = stack.pop()!;
    setUndoStack(stack);

    if (action.kind === 'delete') {
      // restore deleted items
      for (const item of action.items) {
        // ensure folders exist
        const parts = item.path.split('/');
        if (parts.length > 1) {
          let path = '';
          for (let i = 0; i < parts.length - 1; i++) {
            path = path ? `${path}/${parts[i]}` : parts[i];
            createFolder(path);
          }
        }

        if (item.isBinary && item.blob) {
          await saveBlob(item.path, item.blob);
          updateFile(item.path, '');
        } else {
          await saveContent(item.path, item.content || '');
          updateFile(item.path, item.content || '');
        }
      }
      showToast('Undo: restored deleted items', 'success');
    } else if (action.kind === 'move') {
      // move items back: restore original path from saved content, delete dest
      for (const it of action.items) {
        // ensure original folder exists
        const parts = it.path.split('/');
        if (parts.length > 1) {
          let p = '';
          for (let i = 0; i < parts.length - 1; i++) {
            p = p ? `${p}/${parts[i]}` : parts[i];
            createFolder(p);
          }
        }

        if (it.isBinary && it.blob) {
          await saveBlob(it.path, it.blob);
          updateFile(it.path, '');
          // remove destination if present
          if (it.dest) await deleteBlob(it.dest).catch(() => {});
        } else {
          await saveContent(it.path, it.content || '');
          updateFile(it.path, it.content || '');
          if (it.dest) await deleteContent(it.dest).catch(() => {});
        }
        // remove from store dest entry if present
        if (it.dest) deleteFile(it.dest);
      }
      showToast('Undo: moved items restored to original location', 'success');
    }
  }, [undoStack, createFolder, saveBlob, saveContent, updateFile, deleteBlob, deleteContent, deleteFile, showToast]);

  // Virtual scroll slice
  const scrollTop = scrollTopRef.current;
  const containerHeight = containerHeightRef.current;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    visibleNodes.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );
  const visibleSlice = visibleNodes.slice(startIndex, endIndex);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#0d1117] min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <span className="text-[11px] font-semibold text-[#c9d1d9] tracking-wide">
          EXPLORER
        </span>
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
              <button
                onClick={handleDeleteSelected}
                className="p-1 hover:bg-[#30363d] rounded transition text-[#f85149]"
                title={`Delete ${selectedFiles.size} selected`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clearSelection}
                className="p-1 hover:bg-[#30363d] rounded transition text-[#8b949e]"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Import Folder (directory) */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="Import Folder"
            disabled={importing}
          >
            <Upload
              className={`w-3.5 h-3.5 ${importing ? 'text-[#58a6ff] animate-pulse' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
            />
          </button>

          {/* Import File (single) */}
          <button
            onClick={() => singleFileInputRef.current?.click()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="Import File"
            disabled={importing}
          >
            <FilePlus
              className={`w-3.5 h-3.5 ${importing ? 'text-[#58a6ff] animate-pulse' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
            />
          </button>

          <button
            onClick={() => zipInputRef.current?.click()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="Upload ZIP"
            disabled={importing}
          >
            <FileArchive
              className={`w-3.5 h-3.5 ${importing ? 'text-[#58a6ff] animate-pulse' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
            />
          </button>

          <button
            onClick={() => startCreateFile()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
          </button>
          <button
            onClick={() => startCreateFolder()}
            className="p-1 hover:bg-[#30363d] rounded transition"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
          </button>

          {clipboard.items.length > 0 && (
            <button
              onClick={() => handlePaste()}
              className="p-1 hover:bg-[#30363d] rounded transition"
              title={`Paste ${clipboard.items.length} item(s)`}
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-[#8b949e] hover:text-[#c9d1d9]" />
            </button>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        accept="*/*"
        className="hidden"
        onChange={handleFolderImport}
      />
      <input
        ref={singleFileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={handleSingleFileImport}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleZipUpload}
      />

      {/* Import progress */}
      {importing && (
        <div className="px-3 py-2 bg-[#1f6feb]/10 border-b border-[#30363d] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-[#58a6ff]">
              {importProgress.total === 0
                ? 'Processing...'
                : `Importing ${importProgress.current} / ${importProgress.total}`}
            </span>
          </div>
          <div className="w-full h-1 bg-[#21262d] rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-[#58a6ff] transition-all"
              style={{
                width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Search bar */}
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
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#c9d1d9]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selection bar */}
      {selectedFiles.size > 0 && (
        <div className="px-3 py-2 bg-[#1f6feb]/10 border-b border-[#30363d] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-[10px] text-[#58a6ff] hover:underline"
            >
              Select All
            </button>
            <span className="text-[10px] text-[#58a6ff]">|</span>
            <button
              onClick={clearSelection}
              className="text-[10px] text-[#8b949e] hover:text-[#c9d1d9]"
            >
              Clear
            </button>
            <span className="text-[10px] text-[#58a6ff]">|</span>
            <button
              onClick={() => {
                setClipboard({ items: [...selectedFiles], mode: 'cut' });
                showToast('Cut selected items (right-click target folder and Paste)', 'info');
              }}
              className="text-[10px] text-[#58a6ff] hover:underline"
            >
              Cut Selected
            </button>
            <button
              onClick={() => {
                setClipboard({ items: [...selectedFiles], mode: 'copy' });
                showToast('Copied selected items to clipboard', 'info');
              }}
              className="ml-2 text-[10px] text-[#58a6ff] hover:underline"
            >
              Copy Selected
            </button>
          </div>
          <span className="text-[10px] text-[#58a6ff] font-medium">
            {selectedFiles.size} selected
          </span>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 px-2 py-1 bg-[#f85149]/20 text-[#f85149] rounded text-[10px] hover:bg-[#f85149]/30 transition"
          >
            <Trash2 className="w-3 h-3" /> Delete Selected
          </button>
        </div>
      )}

      {/* Workspace header */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[#21262d] shrink-0">
        <ChevronDown className="w-3 h-3 text-[#8b949e]" />
        <span className="text-[11px] font-bold text-[#c9d1d9]">
          AI CODE WORKSPACE
        </span>
        <span className="text-[9px] text-[#484f58] ml-auto">
          {`${fileNames.length} files`}
        </span>
      </div>

      {/* New file input */}
      {showNewFile && (
        <div className="px-3 py-1.5 border-b border-[#21262d] shrink-0">
          <div className="text-[10px] text-[#8b949e] mb-1">
            {newFileTargetFolder
              ? `New file in "${newFileTargetFolder}/"`
              : 'New file in root'}
          </div>
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile();
              if (e.key === 'Escape') {
                setShowNewFile(false);
                setNewFileName('');
                setNewFileTargetFolder(null);
              }
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
            {newFolderTarget
              ? `New folder in "${newFolderTarget}/"`
              : 'New folder in root'}
          </div>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setShowNewFolder(false);
                setNewFolderName('');
                setNewFolderTarget(null);
              }
            }}
            placeholder="folder-name"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58]"
            autoFocus
          />
        </div>
      )}

      {/* Rename input */}
      {renamingFile && (
        <div className="px-3 py-1.5 border-b border-[#21262d] shrink-0">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') {
                setRenamingFile(null);
                setRenameValue('');
              }
            }}
            onBlur={handleRenameSubmit}
            className="w-full bg-[#0d1117] border border-[#58a6ff] rounded px-2 py-1 text-[11px] text-[#c9d1d9] outline-none"
            autoFocus
          />
        </div>
      )}

      {/* File tree */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar relative"
        style={{ contain: 'strict' }}
      >
        {filteredTree.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="text-[11px] text-[#484f58] mb-4">
              {debouncedSearch
                ? `No results for "${debouncedSearch}"`
                : 'No files or folders yet'}
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
                  onClick={() => singleFileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md text-[11px] text-[#c9d1d9] transition border border-[#30363d]"
                >
                  <FilePlus className="w-4 h-4 text-[#58a6ff]" /> Import File
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
                style={{
                  height: ITEM_HEIGHT,
                  top: (startIndex + idx) * ITEM_HEIGHT,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#21262d] bg-[#161b22] shrink-0">
        <div className="flex items-center border-b border-[#21262d]">
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] text-[#58a6ff] hover:text-[#c9d1d9] hover:bg-[#21262d] transition"
              title={`Undo (${undoStack.length})`}
            >
              <X className="w-3 h-3" /> Undo
            </button>
          )}
          <button
            onClick={toggleSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition"
          >
            <Settings className="w-3 h-3" /> Settings
          </button>
          <div className="w-px h-4 bg-[#30363d]" />
          <button
            onClick={toggleAccount}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition"
          >
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

      {/* Context menu */}
      {contextMenu.node && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 w-44"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.node.type === 'file' && (
            <>
              <button
                onClick={() => {
                  openFile(contextMenu.node!.name);
                  setContextMenu((prev) => ({ ...prev, node: null }));
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <FileText className="w-3.5 h-3.5" /> Open
              </button>
              <button
                onClick={() => handleDownload(contextMenu.node!)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button
                onClick={() => handleCopy()}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <button
                onClick={() => handleCut()}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <Copy className="w-3.5 h-3.5" /> Cut
              </button>
              {clipboard.items.length > 0 && (
                <button
                  onClick={() => {
                    // paste into parent folder of this file
                    const parts = contextMenu.node!.name.split('/');
                    const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
                    handlePaste(parent);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste Here
                </button>
              )}
            </>
          )}

          {contextMenu.node.type === 'folder' && (
            <>
              <button
                onClick={() => {
                  setNewFileTargetFolder(contextMenu.node!.name);
                  setShowNewFile(true);
                  setContextMenu((prev) => ({ ...prev, node: null }));
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <FilePlus className="w-3.5 h-3.5 text-[#58a6ff]" /> New File
              </button>
              <button
                onClick={() => {
                  setNewFolderTarget(contextMenu.node!.name);
                  setShowNewFolder(true);
                  setContextMenu((prev) => ({ ...prev, node: null }));
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#e3b341]" /> New Folder
              </button>
              <div className="h-px bg-[#30363d] my-1" />
              {clipboard.items.length > 0 && (
                <button
                  onClick={() => handlePaste(contextMenu.node!.name)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste Here
                </button>
              )}
              <button
                onClick={() => handleCopy()}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <button
                onClick={() => handleCut()}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <Copy className="w-3.5 h-3.5" /> Cut
              </button>
              <button
                onClick={() => handleDownloadFolder(contextMenu.node!)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
              >
                <Download className="w-3.5 h-3.5" /> Download as ZIP
              </button>
            </>
          )}

          <button
            onClick={() => handleRename(contextMenu.node!)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] transition"
          >
            <Edit3 className="w-3.5 h-3.5" /> Rename
          </button>

          {/* Paste for non-folder nodes (paste into root or current folder) is available via toolbar paste or folder 'Paste Here' */}

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
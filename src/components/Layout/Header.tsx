// src/components/Layout/Header.tsx
import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Save,
  FileCode,
  Sparkles,
  LayoutTemplate,
  FolderOpen,
  Monitor,
  Smartphone,
  Tablet,
  Plus,
  Share2,
  Trash2,
  ChevronDown,
  Menu,
  X,
  Download,
  Folder,
  Upload,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ShareModal from '../Modals/ShareModal';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const {
    previewDevice,
    setPreviewDevice,
    toggleSidebar,
    toggleAiPanel,
    aiPanelVisible,
    sidebarVisible,
    files,
    updateFile,
    openFile,
    deleteFile,
    closeFile,
    activeFile,
  } = useWorkspaceStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.classList.remove('opacity-0', 'pointer-events-none');
      toast.classList.add('opacity-100');
      
      if (type === 'error') {
        toast.style.borderColor = '#f85149';
      } else if (type === 'info') {
        toast.style.borderColor = '#58a6ff';
      } else {
        toast.style.borderColor = '#238636';
      }
      
      setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
      }, 2500);
    }
  };

  const isTextFile = (file: File) => {
    return (
      file.type.startsWith('text/') ||
      file.type === 'application/javascript' ||
      file.type === 'application/json' ||
      file.type === 'application/xml' ||
      file.type === 'image/svg+xml'
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    let importedCount = 0;
    const fileList: Record<string, string> = {};
    const totalFiles = uploadedFiles.length;

    Array.from(uploadedFiles).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const fileName = file.name;

        const fileExists = Object.keys(files).some(key => key === fileName);
        if (!fileExists) {
          fileList[fileName] = content;
          importedCount++;
        } else {
          const baseName = fileName.replace(/\.[^.]+$/, '');
          const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
          let newName = fileName;
          let count = 1;
          while (Object.keys(files).some(key => key === newName)) {
            newName = `${baseName}-${count}${ext}`;
            count++;
          }
          fileList[newName] = content;
          importedCount++;
        }

        if (importedCount === totalFiles) {
          Object.entries(fileList).forEach(([name, content]) => {
            updateFile(name, content);
          });

          const firstFile = Object.keys(fileList)[0];
          if (firstFile) {
            openFile(firstFile);
          }

          showToast(` Imported ${importedCount} files`, 'success');
        }
      };
      reader.onerror = () => {
        console.error(`Failed to read ${file.name}`);
        importedCount++;
        if (importedCount === totalFiles) {
          showToast(` Some files failed to import`, 'error');
        }
      };

      if (isTextFile(file)) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  };

  const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    let importedCount = 0;
    const fileList: Record<string, string> = {};
    const totalFiles = uploadedFiles.length;

    Array.from(uploadedFiles).forEach((file) => {
      const relativePath = (file as any).webkitRelativePath || file.name;
      const fileName = relativePath;

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        
        const fileExists = Object.keys(files).some(key => key === fileName);
        if (!fileExists) {
          fileList[fileName] = content;
          importedCount++;
        } else {
          const baseName = fileName.replace(/\.[^.]+$/, '');
          const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
          let newName = fileName;
          let count = 1;
          while (Object.keys(files).some(key => key === newName)) {
            newName = `${baseName}-${count}${ext}`;
            count++;
          }
          fileList[newName] = content;
          importedCount++;
        }
        
        if (importedCount === totalFiles) {
          Object.entries(fileList).forEach(([name, content]) => {
            updateFile(name, content);
          });
          
          const firstFile = Object.keys(fileList)[0];
          if (firstFile) {
            openFile(firstFile);
          }
          
          showToast(`Imported ${importedCount} files from folder`, 'success');
        }
      };
      reader.onerror = () => {
        console.error(`Failed to read ${file.name}`);
        importedCount++;
        if (importedCount === totalFiles) {
          showToast(` Some files failed to import`, 'error');
        }
      };
      if (isTextFile(file)) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  };

  const handleNewFile = () => {
    let count = 1;
    let filename = `untitled-${count}.html`;
    while (Object.keys(files).some(key => key === filename)) {
      count++;
      filename = `untitled-${count}.html`;
    }
    updateFile(filename, '<!-- New file -->');
    openFile(filename);
    showToast(` "${filename}" created`, 'success');
    setMobileMenuOpen(false);
  };

  const handleDeleteFile = () => {
    if (Object.keys(files).length <= 1) {
      showToast(' Cannot delete the last file', 'error');
      return;
    }
    if (!window.confirm(`Delete "${activeFile}"?`)) {
      return;
    }
    deleteFile(activeFile);
    closeFile(activeFile);
    showToast(`🗑️ "${activeFile}" deleted`, 'info');
    setMobileMenuOpen(false);
  };

  const handleSave = () => {
    window.dispatchEvent(new CustomEvent('save-files'));
    showToast(' All files saved', 'success');
    setMobileMenuOpen(false);
  };

  const handleDownloadFile = () => {
    if (!activeFile || !files[activeFile]) {
      showToast(' No file to download', 'error');
      return;
    }
    const content = files[activeFile];
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`📥 Downloaded "${activeFile}"`, 'success');
    setMobileMenuOpen(false);
  };

  const handleOpenFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleOpenFolder = () => {
    if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  return (
    <>
      <header className="h-11 bg-[#0f1322] border-b border-[#1e293b] flex items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white tracking-tight hidden sm:inline">
              BadLson_AI_code Editor
            </span>
            <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded font-medium">
              Beta
            </span>
          </div>

          <div className="hidden md:flex flex-wrap items-center gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2035] rounded-md flex-wrap">
              <button 
                onClick={handleNewFile}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="New File"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">New File</span>
              </button>
              <div className="w-px h-4 bg-[#30363d]" />
              <button 
                onClick={handleDeleteFile} 
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="Delete File"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Delete</span>
              </button>
              <div className="w-px h-4 bg-[#30363d]" />
              <button 
                onClick={handleSave} 
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="Save All (Ctrl+Shift+S)"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Save All</span>
              </button>
              <div className="w-px h-4 bg-[#30363d]" />
              <button 
                onClick={() => {
                  setShowShareModal(true);
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="Share & Download"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Share</span>
              </button>
            </div>

            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2035] rounded-md ml-1 flex-wrap">
              <button 
                onClick={handleOpenFiles}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="Open Files"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Open Files</span>
              </button>
              <div className="w-px h-4 bg-[#30363d]" />
              <button 
                onClick={handleOpenFolder}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="Open Folder"
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Open Folder</span>
              </button>
              <div className="w-px h-4 bg-[#30363d]" />
              <button 
                onClick={handleDownloadFile}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition whitespace-nowrap"
                title="Download current file"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Download</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center bg-[#1a2035] rounded-lg p-0.5">
            <button
              onClick={() => setPreviewDevice('desktop')}
              className={`p-1.5 rounded-md transition ${previewDevice === 'desktop' ? 'bg-[#252d47] text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Desktop View"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice('tablet')}
              className={`p-1.5 rounded-md transition ${previewDevice === 'tablet' ? 'bg-[#252d47] text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Tablet View"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice('mobile')}
              className={`p-1.5 rounded-md transition ${previewDevice === 'mobile' ? 'bg-[#252d47] text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Mobile View"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-[#1e293b]" />

          <button
            onClick={toggleAiPanel}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md transition ${aiPanelVisible ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">AI Assistant</span>
          </button>

          <div className="md:hidden relative" ref={menuRef}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            {mobileMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl py-1 z-[100] max-h-[80vh] overflow-y-auto">
                <div className="px-3 py-2 border-b border-[#30363d]">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ACTIONS</span>
                </div>
                
                <button
                  onClick={handleNewFile}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-slate-300 hover:bg-[#21262d] transition"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>New File</span>
                </button>
                <button
                  onClick={handleDeleteFile}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-red-400 hover:bg-[#21262d] transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete File</span>
                </button>
                <button
                  onClick={handleSave}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-slate-300 hover:bg-[#21262d] transition"
                >
                  <Save className="w-4 h-4 text-blue-400" />
                  <span>Save All</span>
                </button>
                <button
                  onClick={() => {
                    setShowShareModal(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-slate-300 hover:bg-[#21262d] transition"
                >
                  <Share2 className="w-4 h-4 text-violet-400" />
                  <span>Share Project</span>
                </button>

                <div className="px-3 py-2 border-t border-[#30363d] mt-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">PROJECT</span>
                </div>

                <button
                  onClick={handleOpenFiles}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-slate-300 hover:bg-[#21262d] transition"
                >
                  <FolderOpen className="w-4 h-4 text-indigo-400" />
                  <span>Open Files</span>
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-slate-300 hover:bg-[#21262d] transition"
                >
                  <Folder className="w-4 h-4 text-cyan-400" />
                  <span>Open Folder</span>
                </button>
                <button
                  onClick={handleDownloadFile}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] text-slate-300 hover:bg-[#21262d] transition"
                >
                  <Download className="w-4 h-4 text-orange-400" />
                  <span>Download</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".html,.htm,.css,.js,.ts,.tsx,.jsx,.vue,.py,.php,.json,.md,.txt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.ico,.svg,.tiff"
          className="hidden"
          onChange={handleFileUpload}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          webkitdirectory=""
          className="hidden"
          onChange={handleFolderUpload}
        />
      </header>

      <ShareModal 
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)}
        currentFile={activeFile}
        projectFiles={files}
      />
    </>
  );
}
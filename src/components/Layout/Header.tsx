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
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function Header() {
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

  const handleRun = () => {
    window.dispatchEvent(new CustomEvent('run-preview'));
  };

  const showToast = (message: string) => {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.classList.remove('opacity-0', 'pointer-events-none');
      toast.classList.add('opacity-100');
      setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
      }, 2500);
    }
  };

  const handleNewFile = () => {
    let count = 1;
    let filename = `untitled-${count}.html`;
    while (files[filename]) {
      count += 1;
      filename = `untitled-${count}.html`;
    }
    updateFile(filename, '<!-- New file -->');
    openFile(filename);
    showToast('New file created');
  };

  const handleDeleteFile = () => {
    if (Object.keys(files).length <= 1) {
      showToast('Cannot delete the last file');
      return;
    }

    if (!window.confirm(`Delete ${activeFile}?`)) {
      return;
    }

    deleteFile(activeFile);
    closeFile(activeFile);
    showToast(`${activeFile} deleted`);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Share link copied');
    } catch {
      showToast('Unable to copy link');
    }
  };

  const handleSave = () => {
    window.dispatchEvent(new CustomEvent('save-files'));
  };

  const handleFormat = () => {
    window.dispatchEvent(new CustomEvent('format-code'));
  };

  return (
    <header className="h-11 bg-[#0f1322] border-b border-[#1e293b] flex items-center justify-between px-3 shrink-0 z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight hidden sm:inline">
            AI Code Workspace
          </span>
          <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded font-medium">
            Beta
          </span>
        </div>

        <div className="hidden md:flex flex-wrap items-center gap-2">
          <button onClick={handleNewFile} className="btn-icon flex items-center gap-1.5 text-[11px] bg-slate-800 text-slate-100 hover:bg-slate-700">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">New File</span>
          </button>
          <button onClick={handleDeleteFile} className="btn-icon flex items-center gap-1.5 text-[11px] text-red-400 hover:text-red-200">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Delete File</span>
          </button>
          <button onClick={handleSave} className="btn-icon flex items-center gap-1.5 text-[11px]">
            <Save className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Save All</span>
          </button>
          <button onClick={handleFormat} className="btn-icon flex items-center gap-1.5 text-[11px]">
            <FileCode className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Format</span>
          </button>
          <button onClick={handleShare} className="btn-icon flex items-center gap-1.5 text-[11px]">
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Share</span>
          </button>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2">
        <span className="text-[11px] text-slate-500 font-medium">My Website Project</span>
      </div>

      <div className="flex items-center gap-2">
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
      </div>
    </header>
  );
}

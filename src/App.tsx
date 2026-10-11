// src/App.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Layout/Header';
import FileExplorer from './components/Explorer/FileExplorer';
import Workspace from './components/Layout/Workspace';
import ChatPanel from './components/AI/ChatPanel';
import SettingsPanel from './components/Settings/SettingsPanel';
import AccountModal from './components/Auth/AccountModal';
import { useWorkspaceStore } from './store/workspaceStore';
import { getCurrentUser } from './auth/authService';
import { CheckCircle } from 'lucide-react';

function Toast() {
  return (
    <div
      id="toast"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-[#161b22] text-slate-200 rounded-lg border border-white/10 shadow-2xl text-[11px] flex items-center gap-2 transition-all duration-300 opacity-0 pointer-events-none z-[300]"
    >
      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
      <span id="toastMsg">Action completed</span>
    </div>
  );
}

function StatusBar() {
  const { files, activeFile, sidebarVisible, aiPanelVisible } = useWorkspaceStore();
  const activeContent = files[activeFile] || '';
  const lines = activeContent.split('\n').length;
  const chars = activeContent.length;

  return (
    <footer className="h-6 bg-[#0a0c10] border-t border-white/5 flex items-center justify-between px-3 text-[10px] text-slate-500 shrink-0 select-none z-50">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
          <span className="text-slate-400">Ready</span>
        </span>
        <span>{activeFile}</span>
        <span>{lines} lines</span>
        <span>{chars} chars</span>
        <span className="text-indigo-400">UTF-8</span>
        <span>Spaces: 2</span>
        <span className="text-emerald-400/70">AutoSync Active</span>
      </div>
      <div className="flex items-center gap-3">
        {sidebarVisible && <span>Explorer</span>}
        {aiPanelVisible && <span className="text-violet-400">AI Active</span>}
        <span>Badson AI Code Editor</span>
      </div>
    </footer>
  );
}

function AppLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [aiWidth, setAiWidth] = useState(340);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const dragKindRef = useRef<'sidebar' | 'ai' | null>(null);
  const widthRef = useRef({ sidebar: 260, ai: 340 });
  const rafRef = useRef<number | null>(null);
  const { aiPanelVisible, sidebarVisible } = useWorkspaceStore();
  const setAuthUser = useWorkspaceStore((state) => state.setAuthUser);
  const setWorkspaceState = useWorkspaceStore((state) => state.setWorkspaceState);
  const authUser = useWorkspaceStore((state) => state.authUser);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setAuthUser({
        uid: user.id,
        email: user.email,
        displayName: user.name,
      });

      try {
        const savedState = localStorage.getItem('workspace_state');
        if (savedState) {
          const parsed = JSON.parse(savedState);
          setWorkspaceState(parsed);
        }
      } catch (error) {
        console.error('Failed to load workspace state:', error);
      }
    } else {
      setAuthUser(null);
    }
  }, [setAuthUser, setWorkspaceState]);

  useEffect(() => {
    if (authUser?.uid) {
      const state = useWorkspaceStore.getState();
      const {
        files,
        activeFile,
        openFiles,
        sidebarVisible,
        aiPanelVisible,
        previewDevice,
        isRunning,
        editorOptions,
        currentProject,
        projects,
        chatHistory,
        isAiTyping,
      } = state;

      try {
        localStorage.setItem(
          'workspace_state',
          JSON.stringify({
            files,
            activeFile,
            openFiles,
            sidebarVisible,
            aiPanelVisible,
            previewDevice,
            isRunning,
            editorOptions,
            currentProject,
            projects,
            chatHistory,
            isAiTyping,
          })
        );
      } catch (error) {
        console.error('Failed to save workspace state:', error);
      }
    }
  }, [authUser?.uid]);

  useEffect(() => {
    const handleToggleSettings = () => setShowSettings((prev) => !prev);
    window.addEventListener('toggle-settings', handleToggleSettings);
    return () => window.removeEventListener('toggle-settings', handleToggleSettings);
  }, []);

  useEffect(() => {
    const handleToggleAccount = () => setShowAccount((prev) => !prev);
    window.addEventListener('toggle-account', handleToggleAccount);
    return () => window.removeEventListener('toggle-account', handleToggleAccount);
  }, []);

  useEffect(() => {
    widthRef.current.sidebar = sidebarWidth;
  }, [sidebarWidth]);
  useEffect(() => {
    widthRef.current.ai = aiWidth;
  }, [aiWidth]);

  const startResize = useCallback((kind: 'sidebar' | 'ai') => {
    dragKindRef.current = kind;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.documentElement.classList.add('resizing-panels');
  }, []);

  useEffect(() => {
    const applySidebarWidth = (w: number) => {
      widthRef.current.sidebar = w;
      if (sidebarRef.current) sidebarRef.current.style.width = `${w}px`;
    };
    const applyAiWidth = (w: number) => {
      widthRef.current.ai = w;
      if (aiPanelRef.current) aiPanelRef.current.style.width = `${w}px`;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const kind = dragKindRef.current;
      if (!kind) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (kind === 'sidebar') {
          applySidebarWidth(Math.max(220, Math.min(400, e.clientX)));
        } else if (kind === 'ai') {
          applyAiWidth(Math.max(240, Math.min(420, window.innerWidth - e.clientX - 80)));
        }
      });
    };

    const handleMouseUp = () => {
      if (!dragKindRef.current) return;
      const kind = dragKindRef.current;
      dragKindRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (kind === 'sidebar') setSidebarWidth(widthRef.current.sidebar);
      if (kind === 'ai') setAiWidth(widthRef.current.ai);
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.documentElement.classList.remove('resizing-panels');
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.documentElement.classList.remove('resizing-panels');
    };
  }, []);

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0b0f19] text-slate-300 overflow-hidden">
      <Header />

      <main className={`flex-1 flex min-h-0 overflow-hidden${isResizing ? ' select-none' : ''}`}>
        {sidebarVisible && (
          <>
            <div
              ref={sidebarRef}
              style={{ width: sidebarWidth }}
              className="shrink-0 min-w-[220px] max-w-[400px] border-r border-white/10 overflow-hidden flex flex-col will-change-[width]"
            >
              <FileExplorer />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize file explorer"
              onMouseDown={(e) => {
                e.preventDefault();
                startResize('sidebar');
              }}
              className="w-1.5 shrink-0 bg-[#1e293b] hover:bg-indigo-600/60 active:bg-indigo-500 cursor-col-resize transition-colors"
            />
          </>
        )}

        <Workspace />

        {aiPanelVisible && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize AI panel"
              onMouseDown={(e) => {
                e.preventDefault();
                startResize('ai');
              }}
              className="w-1.5 shrink-0 bg-[#1e293b] hover:bg-indigo-600/60 active:bg-indigo-500 cursor-col-resize transition-colors"
            />
            <div
              ref={aiPanelRef}
              style={{ width: aiWidth }}
              className="shrink-0 min-w-[240px] max-w-[420px] overflow-hidden min-h-0 h-full will-change-[width]"
            >
              <ChatPanel />
            </div>
          </>
        )}
      </main>

      <StatusBar />
      <Toast />

      {showSettings && <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />}
      {showAccount && <AccountModal isOpen={showAccount} onClose={() => setShowAccount(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  );
}

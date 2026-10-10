// src/App.tsx
import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Layout/Header';
import FileExplorer from './components/Explorer/FileExplorer';
import Workspace from './components/Layout/Workspace';
import ChatPanel from './components/AI/ChatPanel';
import SettingsPanel from './components/Settings/SettingsPanel';
import AccountModal from './components/Auth/AccountModal';
import { useWorkspaceStore } from './store/workspaceStore';
import { getCurrentUser, isAuthenticated, getToken } from './auth/authService';
import { CheckCircle } from 'lucide-react';

function Toast() {
  return (
    <div
      id="toast"
      className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#12151c] text-slate-100 px-4 py-2 rounded-lg border border-white/10 shadow-2xl text-[11px] flex items-center gap-2 transition-all duration-300 opacity-0 pointer-events-none z-[300]"
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
  const [draggingSidebar, setDraggingSidebar] = useState(false);
  const [draggingAi, setDraggingAi] = useState(false);
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
      } catch {
        /* ignore quota */
      }
    }
  });

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
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingSidebar) {
        setSidebarWidth(Math.max(220, Math.min(400, e.clientX));
      }
      if (draggingAi) {
        setAiWidth(Math.max(240, Math.min(420, window.innerWidth - e.clientX - 80));
      }
    };

    const handleMouseUp = () => {
      setDraggingSidebar(false);
      setDraggingAi(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (draggingSidebar || draggingAi) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingSidebar, draggingAi]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0c10] text-slate-100 overflow-hidden">
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onOpenAccount={() => setShowAccount(true)}
      />
      <div className="flex-1 flex min-h-0 relative">
        {sidebarVisible && (
          <>
            <aside style={{ width: sidebarWidth }} className="shrink-0 border-r border-white/5 bg-[#0a0c10] overflow-hidden">
              <FileExplorer />
            </aside>
            <div
              className="w-1 cursor-col-resize hover:bg-indigo-500/40 transition-colors shrink-0"
              onMouseDown={() => setDraggingSidebar(true)}
            />
          </>
        )}
        <main className="flex-1 min-w-0 overflow-hidden">
          <Workspace />
        </main>
        {aiPanelVisible && (
          <>
            <div
              className="w-1 cursor-col-resize hover:bg-indigo-500/40 transition-colors shrink-0"
              onMouseDown={() => setDraggingAi(true)}
            />
            <aside style={{ width: aiWidth }} className="shrink-0 border-l border-white/5 bg-[#0a0c10] overflow-hidden">
              <ChatPanel />
            </aside>
          </>
        )}
      </div>
      <StatusBar />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
      <Toast />
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

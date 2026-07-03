import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import Workspace from './components/Layout/Workspace';
import ChatPanel from './components/AI/ChatPanel';
import SettingsPanel from './components/Settings/SettingsPanel';
import AccountModal from './components/Auth/AccountModal';
import { useWorkspaceStore } from './store/workspaceStore';
import { onAuthChange } from './firebase/auth';
import { loadWorkspaceState, saveWorkspaceState } from './firebase/firestore';
import { CheckCircle } from 'lucide-react';

function Toast() {
  return (
    <div
      id="toast"
      className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1a2035] text-slate-100 px-4 py-2 rounded-lg border border-[#1e293b] shadow-2xl text-[11px] flex items-center gap-2 transition-all duration-300 opacity-0 pointer-events-none z-[300]"
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
    <footer className="h-6 bg-[#0f1322] border-t border-[#1e293b] flex items-center justify-between px-3 text-[10px] text-slate-500 shrink-0 select-none z-50">
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
        <span>AI Code Workspace v1.0</span>
      </div>
    </footer>
  );
}

function AppLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [aiWidth, setAiWidth] = useState(340);
  const [draggingSidebar, setDraggingSidebar] = useState(false);
  const [draggingAi, setDraggingAi] = useState(false);
  const { aiPanelVisible, sidebarVisible } = useWorkspaceStore();
  const setAuthUser = useWorkspaceStore((state) => state.setAuthUser);
  const setWorkspaceState = useWorkspaceStore((state) => state.setWorkspaceState);

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
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        const authUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        };
        setAuthUser(authUser);

        const loadedState = await loadWorkspaceState(user.uid);
        if (loadedState) {
          setWorkspaceState(loadedState);
        }
      } else {
        setAuthUser(null);
      }
    });

    return () => unsubscribe();
  }, [setAuthUser, setWorkspaceState]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingSidebar) {
        setSidebarWidth(Math.max(180, Math.min(360, e.clientX)));
      }
      if (draggingAi) {
        setAiWidth(Math.max(240, Math.min(420, window.innerWidth - e.clientX - 80)));
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
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [draggingSidebar, draggingAi]);

  useEffect(() => {
    const handleSave = async () => {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toastMsg');
      if (toast && toastMsg) {
        toastMsg.textContent = 'All files saved';
        toast.classList.remove('opacity-0', 'pointer-events-none');
        toast.classList.add('opacity-100');
        setTimeout(() => {
          toast.classList.remove('opacity-100');
          toast.classList.add('opacity-0', 'pointer-events-none');
        }, 3000);
      }

      const state = useWorkspaceStore.getState();
      if (state.authUser?.uid) {
        await saveWorkspaceState(state.authUser.uid, {
          files: state.files,
          activeFile: state.activeFile,
          openFiles: state.openFiles,
          sidebarVisible: state.sidebarVisible,
          aiPanelVisible: state.aiPanelVisible,
          previewDevice: state.previewDevice,
          isRunning: state.isRunning,
          editorOptions: state.editorOptions,
          currentProject: state.currentProject,
          projects: state.projects,
          chatHistory: state.chatHistory,
          isAiTyping: state.isAiTyping,
        });
      }
    };

    window.addEventListener('save-files', handleSave);
    return () => window.removeEventListener('save-files', handleSave);
  }, []);


  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0b0f19] text-slate-300 overflow-hidden">
      <Header />

      <main className="flex-1 flex min-h-0 overflow-hidden">
        {sidebarVisible && (
          <>
            <div
              style={{ width: sidebarWidth }}
              className="shrink-0 min-w-[180px] max-w-[420px] border-r border-[#1e293b] overflow-hidden"
            >
              <Sidebar />
            </div>
            <div
              onMouseDown={() => setDraggingSidebar(true)}
              className="w-1.5 shrink-0 bg-[#1e293b] hover:bg-indigo-600/60 cursor-col-resize transition"
            />
          </>
        )}

        <Workspace />

        {aiPanelVisible && (
          <>
            <div
              onMouseDown={() => setDraggingAi(true)}
              className="w-1.5 shrink-0 bg-[#1e293b] hover:bg-indigo-600/60 cursor-col-resize transition"
            />
            <div
              style={{ width: aiWidth }}
              className="shrink-0 min-w-[240px] max-w-[420px] overflow-hidden min-h-0 h-full"
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
      <Route path="*" element={<AppLayout />} />
    </Routes>
  );
}

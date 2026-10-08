// src/store/workspaceStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Only these three providers are valid ──────────────────────────
export type AiProvider = 'openrouter' | 'groq' | 'gemini';

// ─── Helper to check if a provider is valid ────────────────────────
function isValidProvider(provider: string): provider is AiProvider {
  return ['openrouter', 'groq', 'gemini'].includes(provider);
}

export interface AiProviderState {
  provider: AiProvider;
  preferredOpenRouterModel: string | null;
  fallbackEnabled: boolean;
}

export interface WorkspaceState {
  files: Record<string, string>;
  folders: string[];
  activeFile: string;
  openFiles: string[];
  sidebarVisible: boolean;
  aiPanelVisible: boolean;
  previewDevice: string;
  isRunning: boolean;
  editorOptions: {
    fontSize: number;
    wordWrap: boolean;
    tabSize: number;
    minimap: boolean;
    lineNumbers: boolean;
    theme: string;
  };
  aiProvider: AiProviderState;
  currentProject: any;
  projects: any[];
  chatHistory: Array<{ role: string; content: string; timestamp: number }>;
  isAiTyping: boolean;
  authUser: { uid: string; email: string | null; displayName: string | null } | null;
  setFiles: (files: Record<string, string>) => void;
  updateFile: (filename: string, content: string) => void;
  setActiveFile: (filename: string) => void;
  openFile: (filename: string) => void;
  closeFile: (filename: string) => void;
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  setPreviewDevice: (device: string) => void;
  setIsRunning: (running: boolean) => void;
  setEditorOptions: (options: Partial<WorkspaceState['editorOptions']>) => void;
  setAiProvider: (updates: Partial<AiProviderState>) => void;
  setCurrentProject: (project: any) => void;
  setProjects: (projects: any[]) => void;
  setAuthUser: (user: WorkspaceState['authUser']) => void;
  setWorkspaceState: (workspaceState: Partial<WorkspaceState>) => void;
  addChatMessage: (role: string; content: string) => void;
  addMessage: (message: { role: string; content: string; timestamp?: number }) => void;
  setIsAiTyping: (typing: boolean) => void;
  clearChat: () => void;
  deleteFile: (filename: string) => void;
  createFolder: (folderPath: string) => void;
  deleteFolder: (folderPath: string) => void;
  resetFiles: () => void;
  getPreviewContent: () => string;
}

const defaultHtml = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="UTF-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '  <title>Badson Demo</title>',
  '  <link rel="stylesheet" href="style.css" />',
  '</head>',
  '<body>',
  '  <div class="container">',
  '    <header class="hero">',
  '      <h1>Welcome to <span class="accent">Badson</span></h1>',
  '      <p>Your AI-powered code editor. Edit this page and watch the preview update live.</p>',
  '      <button id="cta" class="btn">Click me</button>',
  '    </header>',
  '  </div>',
  '  <script src="script.js"></script>',
  '</body>',
  '</html>',
].join('\n');

const defaultCss = [
  '* {',
  '  margin: 0;',
  '  padding: 0;',
  '  box-sizing: border-box;',
  '}',
  '',
  'body {',
  '  font-family: Inter, system-ui, -apple-system, sans-serif;',
  '  background: linear-gradient(135deg, #0b0f19 0%, #1a1f35 100%);',
  '  color: #e2e8f0;',
  '  min-height: 100vh;',
  '  display: flex;',
  '  align-items: center;',
  '  justify-content: center;',
  '}',
  '',
  '.container {',
  '  max-width: 640px;',
  '  padding: 2rem;',
  '  text-align: center;',
  '}',
  '',
  '.hero h1 {',
  '  font-size: 2.5rem;',
  '  font-weight: 700;',
  '  margin-bottom: 1rem;',
  '  letter-spacing: -0.02em;',
  '}',
  '',
  '.accent {',
  '  background: linear-gradient(90deg, #818cf8, #c084fc);',
  '  -webkit-background-clip: text;',
  '  -webkit-text-fill-color: transparent;',
  '  background-clip: text;',
  '}',
  '',
  '.hero p {',
  '  color: #94a3b8;',
  '  font-size: 1.1rem;',
  '  line-height: 1.6;',
  '  margin-bottom: 2rem;',
  '}',
  '',
  '.btn {',
  '  background: linear-gradient(135deg, #6366f1, #8b5cf6);',
  '  color: white;',
  '  border: none;',
  '  padding: 0.85rem 1.75rem;',
  '  border-radius: 12px;',
  '  font-size: 1rem;',
  '  font-weight: 600;',
  '  cursor: pointer;',
  '  transition: transform 0.15s ease, box-shadow 0.15s ease;',
  '  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);',
  '}',
  '',
  '.btn:hover {',
  '  transform: translateY(-2px);',
  '  box-shadow: 0 8px 28px rgba(99, 102, 241, 0.45);',
  '}',
  '',
  '.btn:active {',
  '  transform: translateY(0);',
  '}',
].join('\n');

const defaultJs = [
  "const btn = document.getElementById('cta');",
  'let clicks = 0;',
  '',
  "btn.addEventListener('click', () => {",
  '  clicks++;',
  "  btn.textContent = clicks === 1 ? 'Nice! Click again' : 'Clicked ' + clicks + ' times';",
  '',
  '  // Fun little animation',
  "  btn.style.transform = 'scale(0.95)';",
  '  setTimeout(() => {',
  "    btn.style.transform = '';",
  '  }, 100);',
  '});',
  '',
  "console.log('Badson demo script loaded');",
].join('\n');

const defaultFiles: Record<string, string> = {
  'index.html': defaultHtml,
  'style.css': defaultCss,
  'script.js': defaultJs,
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      files: { ...defaultFiles },
      folders: [],
      activeFile: 'index.html',
      openFiles: ['index.html', 'style.css', 'script.js'],
      sidebarVisible: true,
      aiPanelVisible: true,
      previewDevice: 'desktop',
      isRunning: false,
      editorOptions: {
        fontSize: 13,
        wordWrap: true,
        tabSize: 2,
        minimap: false,
        lineNumbers: true,
        theme: 'vs-dark',
      },
      aiProvider: {
        provider: 'openrouter',
        preferredOpenRouterModel: null,
        fallbackEnabled: true,
      },
      currentProject: null,
      projects: [],
      chatHistory: [],
      isAiTyping: false,
      authUser: null,
      setFiles: (files) => set({ files }),
      updateFile: (filename, content) =>
        set((state) => ({
          files: { ...state.files, [filename]: content },
        })),
      setActiveFile: (filename) => set({ activeFile: filename }),
      openFile: (filename) =>
        set((state) => ({
          activeFile: filename,
          openFiles: state.openFiles.includes(filename)
            ? state.openFiles
            : [...state.openFiles, filename],
        })),
      closeFile: (filename) =>
        set((state) => {
          const newOpenFiles = state.openFiles.filter((f) => f !== filename);
          return {
            openFiles: newOpenFiles,
            activeFile:
              state.activeFile === filename
                ? newOpenFiles[newOpenFiles.length - 1] || ''
                : state.activeFile,
          };
        }),
      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      toggleAiPanel: () => set((state) => ({ aiPanelVisible: !state.aiPanelVisible })),
      setPreviewDevice: (device) => set({ previewDevice: device }),
      setIsRunning: (running) => set({ isRunning: running }),
      setEditorOptions: (options) =>
        set((state) => ({
          editorOptions: { ...state.editorOptions, ...options },
        })),
      setAiProvider: (updates) =>
        set((state) => {
          let newProvider = updates.provider ?? state.aiProvider.provider;
          if (!isValidProvider(newProvider)) {
            newProvider = 'openrouter';
          }
          return {
            aiProvider: {
              ...state.aiProvider,
              ...updates,
              provider: newProvider,
            },
          };
        }),
      setCurrentProject: (project) => set({ currentProject: project }),
      setProjects: (projects) => set({ projects }),
      setWorkspaceState: (workspaceState) =>
        set((state) => {
          let aiProvider = {
            ...state.aiProvider,
            ...(workspaceState.aiProvider ?? {}),
          };
          if (!isValidProvider(aiProvider.provider)) {
            aiProvider.provider = 'openrouter';
          }
          return {
            ...state,
            ...workspaceState,
            editorOptions: {
              ...state.editorOptions,
              ...(workspaceState.editorOptions ?? {}),
            },
            aiProvider,
          };
        }),
      setAuthUser: (user) => set({ authUser: user }),
      addChatMessage: (role, content) =>
        set((state) => {
          const newMessage = { role, content, timestamp: Date.now() };
          const trimmedHistory = [...state.chatHistory, newMessage].slice(-20);
          return { chatHistory: trimmedHistory };
        }),
      addMessage: (message) =>
        set((state) => {
          const newMessage = {
            role: message.role,
            content: message.content,
            timestamp: message.timestamp || Date.now(),
          };
          const trimmedHistory = [...state.chatHistory, newMessage].slice(-20);
          return { chatHistory: trimmedHistory };
        }),
      setIsAiTyping: (typing) => set({ isAiTyping: typing }),
      clearChat: () => set({ chatHistory: [] }),
      deleteFile: (filename) =>
        set((state) => {
          const newFiles = { ...state.files };
          delete newFiles[filename];
          const newOpenFiles = state.openFiles.filter((file) => file !== filename);
          const newActiveFile =
            state.activeFile === filename
              ? newOpenFiles[newOpenFiles.length - 1] || ''
              : state.activeFile;
          return {
            files: newFiles,
            openFiles: newOpenFiles,
            activeFile: newActiveFile,
          };
        }),
      createFolder: (folderPath) =>
        set((state) => {
          if (state.folders.includes(folderPath)) return state;
          return { folders: [...state.folders, folderPath] };
        }),
      deleteFolder: (folderPath) =>
        set((state) => {
          const newFolders = state.folders.filter((f) => f !== folderPath);
          const newFiles = { ...state.files };
          const prefix = folderPath + '/';
          Object.keys(newFiles).forEach((file) => {
            if (file === folderPath || file.startsWith(prefix)) {
              delete newFiles[file];
            }
          });
          const newOpenFiles = state.openFiles.filter(
            (f) => !f.startsWith(prefix) && f !== folderPath
          );
          const newActiveFile =
            state.activeFile.startsWith(prefix) || state.activeFile === folderPath
              ? newOpenFiles[newOpenFiles.length - 1] || ''
              : state.activeFile;
          return {
            folders: newFolders,
            files: newFiles,
            openFiles: newOpenFiles,
            activeFile: newActiveFile,
          };
        }),
      resetFiles: () =>
        set({
          files: { ...defaultFiles },
          folders: [],
          activeFile: 'index.html',
          openFiles: ['index.html', 'style.css', 'script.js'],
        }),
      getPreviewContent: () => {
        const state = get();
        const htmlEntry = Object.entries(state.files).find(([name]) =>
          name.endsWith('index.html')
        );
        const html = htmlEntry?.[1] || '';
        const htmlPath = htmlEntry?.[0] || '';
        const basePath = htmlPath.includes('/')
          ? htmlPath.substring(0, htmlPath.lastIndexOf('/') + 1)
          : '';
        const findFile = (name: string) => {
          const sameFolder = state.files[basePath + name];
          if (sameFolder) return sameFolder;
          return state.files[name] || '';
        };
        const css = findFile('style.css');
        const js = findFile('script.js');
        let preview = html;
        const hasStylesheetLink = /<link[^>]*href=["']style\.css["'][^>]*>/i.test(preview);
        const hasScriptLink = /<script[^>]*src=["']script\.js["'][^>]*><\/script>/i.test(preview);

        if (hasStylesheetLink) {
          preview = preview.replace(
            /<link[^>]*href=["']style\.css["'][^>]*>/i,
            '<style>' + css + '</style>'
          );
        } else if (css) {
          preview = preview.replace('<head>', '<head><style>' + css + '</style>');
        }

        if (hasScriptLink) {
          preview = preview.replace(
            /<script[^>]*src=["']script\.js["'][^>]*><\/script>/i,
            '<script>' + js + '</script>'
          );
        } else if (js) {
          preview = preview.replace('</body>', '<script>' + js + '</script></body>');
        }

        return preview;
      },
    }),
    {
      name: 'workspace-store',
      partialize: (state) => {
        let aiProvider = state.aiProvider;
        if (!isValidProvider(aiProvider.provider)) {
          aiProvider = { ...aiProvider, provider: 'openrouter' };
        }
        return {
          files: state.files,
          folders: state.folders,
          activeFile: state.activeFile,
          openFiles: state.openFiles,
          sidebarVisible: state.sidebarVisible,
          aiPanelVisible: state.aiPanelVisible,
          previewDevice: state.previewDevice,
          isRunning: state.isRunning,
          editorOptions: state.editorOptions,
          aiProvider,
          currentProject: state.currentProject,
          projects: state.projects,
          chatHistory: state.chatHistory,
          isAiTyping: state.isAiTyping,
          authUser: state.authUser,
        };
      },
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (persistedState?.aiProvider?.provider) {
          if (!isValidProvider(persistedState.aiProvider.provider)) {
            persistedState.aiProvider.provider = 'openrouter';
          }
        }
        if (version < 2 && (!persistedState?.files || Object.keys(persistedState.files).length === 0)) {
          persistedState.files = { ...defaultFiles };
          persistedState.activeFile = 'index.html';
          persistedState.openFiles = ['index.html', 'style.css', 'script.js'];
        }
        return persistedState;
      },
    }
  )
);

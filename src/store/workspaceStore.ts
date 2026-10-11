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
  addChatMessage: (role: string, content: string) => void;
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
  '  <title>BadLson Project</title>',
  '  <link rel="stylesheet" href="style.css" />',
  '</head>',
  '<body>',
  '  <main class="container">',
  '    <h1>Welcome to BadLson</h1>',
  '    <p>Start editing to see changes live.</p>',
  '  </main>',
  '  <script src="script.js"></script>',
  '</body>',
  '</html>',
].join('\n');

const defaultCss = [
  '* { box-sizing: border-box; margin: 0; padding: 0; }',
  'body { font-family: system-ui, sans-serif; background: #0b0f19; color: #e2e8f0; min-height: 100vh; }',
  '.container { max-width: 720px; margin: 0 auto; padding: 2rem; }',
  'h1 { font-size: 1.75rem; margin-bottom: 0.75rem; color: #f8fafc; }',
  'p { line-height: 1.6; color: #94a3b8; }',
].join('\n');

const defaultJs = [
  "console.log('BadLson project ready');",
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
        fontSize: 14,
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
        set((state) => {
          if (state.files[filename] === content) return state;
          return { files: { ...state.files, [filename]: content } };
        }),
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
      setAuthUser: (user) => set({ authUser: user }),
      setWorkspaceState: (workspaceState) => set((state) => ({ ...state, ...workspaceState })),
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
            timestamp: message.timestamp ?? Date.now(),
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
        const html =
          state.files['index.html'] ||
          state.files[state.activeFile] ||
          defaultHtml;
        const findFile = (name: string) => {
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

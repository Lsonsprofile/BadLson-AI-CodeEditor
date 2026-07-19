// src/store/workspaceStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AiProvider = 'openrouter' | 'groq' | 'gemini';

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

const defaultFiles: Record<string, string> = {};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      files: {},
      folders: [],
      activeFile: '',
      openFiles: [],
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
        set((state) => ({
          aiProvider: { ...state.aiProvider, ...updates },
        })),
      setCurrentProject: (project) => set({ currentProject: project }),
      setProjects: (projects) => set({ projects }),
      setWorkspaceState: (workspaceState) =>
        set((state) => ({
          ...state,
          ...workspaceState,
          editorOptions: {
            ...state.editorOptions,
            ...(workspaceState.editorOptions ?? {}),
          },
          aiProvider: {
            ...state.aiProvider,
            ...(workspaceState.aiProvider ?? {}),
          },
        })),
      setAuthUser: (user) => set({ authUser: user }),
      addChatMessage: (role, content) =>
        set((state) => {
          const newMessage = { role, content, timestamp: Date.now() };
          const trimmedHistory = [...state.chatHistory, newMessage].slice(-20);
          return { chatHistory: trimmedHistory };
        }),
      // Add this new method for convenience
      addMessage: (message) =>
        set((state) => {
          const newMessage = {
            role: message.role,
            content: message.content,
            timestamp: message.timestamp || Date.now()
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
          const newActiveFile = state.activeFile === filename ? newOpenFiles[newOpenFiles.length - 1] || '' : state.activeFile;
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
          Object.keys(newFiles).forEach((file) => {
            if (file === folderPath || file.startsWith(`${folderPath}/`)) {
              delete newFiles[file];
            }
          });
          const newOpenFiles = state.openFiles.filter((f) => !f.startsWith(`${folderPath}/`) && f !== folderPath);
          const newActiveFile = state.activeFile.startsWith(`${folderPath}/`) || state.activeFile === folderPath
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
          files: {},
          folders: [],
          activeFile: '',
          openFiles: [],
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
          const sameFolder = state.files[`${basePath}${name}`];
          if (sameFolder) return sameFolder;
          return state.files[name] || '';
        };
        const css = findFile('style.css');
        const js = findFile('script.js');
        return html
          .replace(/<link[^>]*href=["']style\.css["'][^>]*>/i, `<style>${css}</style>`)
          .replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/i, `<script>${js}<\/script>`);
      },
    }),
    {
      name: 'workspace-store',
      partialize: (state) => ({
        files: state.files,
        folders: state.folders,
        activeFile: state.activeFile,
        openFiles: state.openFiles,
        sidebarVisible: state.sidebarVisible,
        aiPanelVisible: state.aiPanelVisible,
        previewDevice: state.previewDevice,
        isRunning: state.isRunning,
        editorOptions: state.editorOptions,
        aiProvider: state.aiProvider,
        currentProject: state.currentProject,
        projects: state.projects,
        chatHistory: state.chatHistory,
        isAiTyping: state.isAiTyping,
        authUser: state.authUser,
      }),
    }
  )
);
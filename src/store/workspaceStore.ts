import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WorkspaceState {
  // Files state
  files: Record<string, string>;
  activeFile: string;
  openFiles: string[];

  // UI state
  sidebarVisible: boolean;
  aiPanelVisible: boolean;
  previewDevice: string;
  isRunning: boolean;

  // Editor state
  editorOptions: {
    fontSize: number;
    wordWrap: boolean;
    tabSize: number;
    minimap: boolean;
    lineNumbers: boolean;
    theme: string;
  };

  // Project state
  currentProject: any;
  projects: any[];

  // AI chat state
  chatHistory: Array<{ role: string; content: string; timestamp: number }>;
  isAiTyping: boolean;

  // Auth state
  authUser: { uid: string; email: string | null; displayName: string | null } | null;

  // Actions
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
  setCurrentProject: (project: any) => void;
  setProjects: (projects: any[]) => void;
  setAuthUser: (user: WorkspaceState['authUser']) => void;
  setWorkspaceState: (workspaceState: Partial<WorkspaceState>) => void;
  addChatMessage: (role: string, content: string) => void;
  setIsAiTyping: (typing: boolean) => void;
  clearChat: () => void;
  deleteFile: (filename: string) => void;
  resetFiles: () => void;
  getPreviewContent: () => string;
}

const defaultFiles: Record<string, string> = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="navbar">
    <div class="logo">CodeCraft</div>
    <nav>
      <ul class="nav-links">
        <li><a href="#" class="active">Home</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </header>

  <main class="hero">
    <div class="hero-content">
      <h1>Build. Code. Create.</h1>
      <p>A modern and powerful code workspace with AI assistance to help you build amazing things.</p>
      <div class="hero-buttons">
        <button class="btn btn-primary">Get Started</button>
        <button class="btn btn-secondary">Learn More</button>
      </div>
    </div>
    <div class="code-visual">
      <div class="code-window">
        <div class="code-header">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <div class="code-body">
          <div class="code-line"><span class="keyword">const</span> <span class="var">dream</span> = <span class="string">'big'</span>;</div>
          <div class="code-line"><span class="keyword">function</span> <span class="func">create</span>() {</div>
          <div class="code-line">  <span class="keyword">return</span> <span class="string">'awesome'</span>;</div>
          <div class="code-line">}</div>
        </div>
      </div>
    </div>
  </main>

  <script src="script.js"></script>
</body>
</html>`,
  'style.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  line-height: 1.6;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 2rem;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #1e293b;
  position: fixed;
  width: 100%;
  top: 0;
  z-index: 100;
}

.logo {
  font-size: 1.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-links {
  display: flex;
  list-style: none;
  gap: 2rem;
}

.nav-links a {
  color: #64748b;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
  transition: color 0.3s;
  position: relative;
}

.nav-links a::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 0;
  height: 2px;
  background: #6366f1;
  transition: width 0.3s;
}

.nav-links a:hover,
.nav-links a.active {
  color: #6366f1;
}

.nav-links a:hover::after,
.nav-links a.active::after {
  width: 100%;
}

.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6rem 4rem 2rem;
  max-width: 1400px;
  margin: 0 auto;
  gap: 4rem;
}

.hero-content {
  flex: 1;
}

.hero-content h1 {
  font-size: 4rem;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 1.25rem;
  background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-content p {
  font-size: 1.15rem;
  color: #475569;
  margin-bottom: 2rem;
  max-width: 480px;
  line-height: 1.7;
}

.hero-buttons {
  display: flex;
  gap: 1rem;
}

.btn {
  padding: 0.75rem 1.75rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
}

.btn-secondary {
  background: transparent;
  color: #64748b;
  border: 1px solid #1e293b;
}

.btn-secondary:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.code-visual {
  flex: 1;
  display: flex;
  justify-content: center;
}

.code-window {
  background: #1e1b2e;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  border: 1px solid #2d2b3f;
  width: 100%;
  max-width: 480px;
}

.code-header {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: #161428;
  border-bottom: 1px solid #2d2b3f;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot.red { background: #ff5f57; }
.dot.yellow { background: #ffbd2e; }
.dot.green { background: #28c840; }

.code-body {
  padding: 1.5rem;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
}

.code-line {
  padding: 0.25rem 0;
  color: #e2e8f0;
}

.keyword { color: #c084fc; }
.var { color: #60a5fa; }
.string { color: #4ade80; }
.func { color: #f472b6; }

@media (max-width: 968px) {
  .hero {
    flex-direction: column;
    text-align: center;
    padding: 6rem 2rem 2rem;
    gap: 2rem;
  }

  .hero-content h1 {
    font-size: 2.75rem;
  }

  .hero-content p {
    margin-left: auto;
    margin-right: auto;
  }

  .hero-buttons {
    justify-content: center;
  }

  .code-visual {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .navbar {
    padding: 1rem;
  }

  .nav-links {
    gap: 1rem;
  }

  .hero-content h1 {
    font-size: 2.25rem;
  }
}`,
  'script.js': `// Smooth interactions for CodeCraft
const btn = document.querySelector('.btn-primary');
if (btn) {
  btn.addEventListener('click', () => {
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      btn.style.transform = '';
    }, 150);
  });
}

// Smooth scroll for navigation
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// Add active state to nav links on scroll
window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('section[id]');
  const scrollY = window.scrollY;

  sections.forEach((section: Element) => {
    const sectionHeight = (section as HTMLElement).offsetHeight;
    const sectionTop = (section as HTMLElement).offsetTop - 100;
    const sectionId = section.getAttribute('id');
    const link = document.querySelector(\`.nav-links a[href="#\${sectionId}"]\`);

    if (link) {
      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    }
  });
});

console.log('CodeCraft initialized!');`,
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      // Files state
      files: { ...defaultFiles },
      activeFile: 'index.html',
      openFiles: ['index.html'],

      // UI state
      sidebarVisible: true,
      aiPanelVisible: true,
      previewDevice: 'desktop',
      isRunning: false,

      // Editor state
      editorOptions: {
        fontSize: 13,
        wordWrap: true,
        tabSize: 2,
        minimap: false,
        lineNumbers: true,
        theme: 'vs-dark',
      },

      // Project state
      currentProject: null,
      projects: [],

      // AI chat state
      chatHistory: [],
      isAiTyping: false,
      authUser: null,

      // Actions
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
        })),
      setAuthUser: (user) => set({ authUser: user }),

      addChatMessage: (role, content) =>
        set((state) => ({
          chatHistory: [...state.chatHistory, { role, content, timestamp: Date.now() }],
        })),
      setIsAiTyping: (typing) => set({ isAiTyping: typing }),
      clearChat: () => set({ chatHistory: [] }),
      deleteFile: (filename) =>
        set((state) => {
          const newFiles = { ...state.files };
          delete newFiles[filename];
          const newOpenFiles = state.openFiles.filter((file) => file !== filename);
          const newActiveFile = state.activeFile === filename ? newOpenFiles[newOpenFiles.length - 1] || 'index.html' : state.activeFile;

          return {
            files: newFiles,
            openFiles: newOpenFiles,
            activeFile: newActiveFile,
          };
        }),

      resetFiles: () =>
        set({
          files: { ...defaultFiles },
          activeFile: 'index.html',
          openFiles: ['index.html'],
        }),

      getPreviewContent: () => {
        const state = get();
        const html = state.files['index.html'] || '';
        const css = state.files['style.css'] || '';
        const js = state.files['script.js'] || '';

        return html
          .replace(
            '<link rel="stylesheet" href="style.css">',
            `<style>${css}</style>`
          )
          .replace(
            '<script src="script.js"></script>',
            `<script>${js}<\/script>`
          );
      },
    }),
    {
      name: 'workspace-store',
      partialize: (state) => ({
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
        authUser: state.authUser,
      }),
    }
  )
);

// src/services/api.ts
import { getContent } from '../lib/fileStorage';
import { useWorkspaceStore } from '../store/workspaceStore';

// ─── API BASE URL ──────────────────────────────────────────────────
// ✅ FIXED: Must include /api
const API_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : import.meta.env.DEV
    ? 'http://localhost:5002/api'
    : (() => { throw new Error('VITE_API_URL is not defined. Set it in your .env file.'); })();

console.log('🔗 API_BASE_URL:', API_BASE_URL);

// ─── AUTH TOKEN MANAGEMENT ──────────────────────────────────────────

let authToken: string | null = localStorage.getItem('auth_token');

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return headers;
}

// ─── TYPES ──────────────────────────────────────────────────────────

interface FetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
  timestamp: number;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  message: string;
}

export interface AiModelsResponse {
  success: boolean;
  data: {
    openrouter: {
      configured: boolean;
      freeModels: string[];
      defaultModels: string[];
    };
    groq: {
      configured: boolean;
      models: string[];
    };
    gemini: {
      configured: boolean;
      models: string[];
    };
  };
  timestamp?: string;
}

export interface EditSummary {
  filename: string;
  type: 'created' | 'replaced' | 'appended' | 'unchanged';
}

export interface FailedEdit {
  filename: string;
  reason: string;
}

export interface ChatApiResponse {
  success: boolean;
  response: string;
  provider: string;
  model?: string;
  mode?: string;
  timestamp: string;
  edits?: {
    applied: EditSummary[];
    failed: FailedEdit[];
  };
  updatedFiles?: Record<string, string>;
}

export interface ApiResponse {
  success?: boolean;
  response?: string;
  error?: string;
  provider?: string;
  model?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── API REQUEST HELPER ─────────────────────────────────────────────

async function fetchWithError(url: string, options: FetchOptions = {}): Promise<ApiResponse> {
  const { requiresAuth = false, ...fetchOptions } = options;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };
  
  if (requiresAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      throw new Error('Authentication required. Please log in.');
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401) {
      setAuthToken(null);
      if (requiresAuth && !url.includes('/auth/')) {
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('API request failed:', url, error);
    throw error;
  }
}

// ─── AUTH API ──────────────────────────────────────────────────────

export async function registerUser(email: string, password: string, name?: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Registration failed');
  }

  const data: AuthResponse = await response.json();
  setAuthToken(data.token);
  return data.user;
}

export async function loginUser(email: string, password: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  const data: AuthResponse = await response.json();
  setAuthToken(data.token);
  return data.user;
}

export function logoutUser(): void {
  setAuthToken(null);
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        setAuthToken(null);
        return null;
      }
      throw new Error('Failed to get user profile');
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Failed to get user:', error);
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// ─── ERROR CAPTURE HELPERS ──────────────────────────────────────────

export function getRecentConsoleErrors(maxErrors: number = 10): string[] {
  const errors = (window as any).__consoleErrors || [];
  return errors.slice(-maxErrors);
}

export function getRecentBuildErrors(maxErrors: number = 5): string[] {
  const errors = (window as any).__buildErrors || [];
  return errors.slice(-maxErrors);
}

export function clearCapturedErrors(): void {
  (window as any).__consoleErrors = [];
  (window as any).__buildErrors = [];
}

// ─── INDEXEDDB HELPERS ─────────────────────────────────────────────

export async function buildProjectFilesFromStore(): Promise<Record<string, string>> {
  const { files } = useWorkspaceStore.getState();
  const filePaths = Object.keys(files);
  const result: Record<string, string> = {};

  const batchSize = 100;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const contents = await Promise.all(
      batch.map(async (path) => {
        const zustandContent = (files as Record<string, string>)[path];
        if (zustandContent !== undefined && zustandContent !== '') {
          return { path, content: zustandContent };
        }
        const dbContent = await getContent(path);
        return { path, content: dbContent || '' };
      })
    );
    
    for (const { path, content } of contents) {
      result[path] = content;
    }

    if (i + batchSize < filePaths.length) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return result;
}

export async function getFileContentAsync(path: string): Promise<string> {
  const { files } = useWorkspaceStore.getState();
  const zustandContent = (files as Record<string, string>)[path];
  if (zustandContent !== undefined) return zustandContent;
  
  const dbContent = await getContent(path);
  return dbContent || '';
}

// ─── AI API (PUBLIC - NO AUTH REQUIRED) ────────────────────────────

export type AiProvider = 'gemini' | 'groq' | 'openrouter';

export interface SendChatOptions {
  projectFiles: Record<string, string>;
  message: string;
  chatHistory?: ChatMessage[];
  provider?: AiProvider;
  preferredModel?: string | null;
  activeFile?: string | null;
  recentFiles?: string[];
  consoleErrors?: string[];
  buildErrors?: string[];
  selectedCode?: string | null;
  cursorPosition?: CursorPosition | null;
}

export async function sendChatMessage(options: SendChatOptions): Promise<ChatApiResponse> {
  const {
    projectFiles,
    message,
    chatHistory = [],
    provider = 'openrouter',
    preferredModel = null,
    activeFile = null,
    recentFiles = [],
    consoleErrors = [],
    buildErrors = [],
    selectedCode = null,
    cursorPosition = null,
  } = options;

  const response = await fetch(`${API_BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectFiles,
      message,
      chatHistory,
      provider,
      preferredModel,
      activeFile,
      recentFiles,
      consoleErrors,
      buildErrors,
      selectedCode,
      cursorPosition,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText || `HTTP ${response.status}` };
    }
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function sendChatMessageWithStore(
  message: string,
  chatHistory: ChatMessage[] = [],
  provider: AiProvider = 'openrouter',
  preferredModel?: string | null,
  activeFile?: string | null,
  selectedCode?: string | null,
  cursorPosition?: CursorPosition | null
): Promise<ChatApiResponse> {
  const projectFiles = await buildProjectFilesFromStore();
  
  const consoleErrors = getRecentConsoleErrors();
  const buildErrors = getRecentBuildErrors();
  
  const state = useWorkspaceStore.getState();
  const recentFiles = state.openFiles.slice(-5);

  return sendChatMessage({
    projectFiles,
    message,
    chatHistory,
    provider,
    preferredModel,
    activeFile: activeFile || state.activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
  });
}

export async function analyzeCode(
  projectFiles: Record<string, string>, 
  provider: AiProvider = 'openrouter',
  activeFile?: string | null
): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectFiles, provider, activeFile }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function analyzeCodeWithStore(
  provider: AiProvider = 'openrouter',
  activeFile?: string | null
): Promise<ApiResponse> {
  const projectFiles = await buildProjectFilesFromStore();
  return analyzeCode(projectFiles, provider, activeFile);
}

export async function explainCode(
  projectFiles: Record<string, string>, 
  filename: string, 
  provider: AiProvider = 'openrouter',
  activeFile?: string | null
): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectFiles, filename, provider, activeFile }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function explainCodeWithStore(
  filename: string,
  provider: AiProvider = 'openrouter',
  activeFile?: string | null
): Promise<ApiResponse> {
  const projectFiles = await buildProjectFilesFromStore();
  return explainCode(projectFiles, filename, provider, activeFile);
}

export async function getAiModels(): Promise<AiModelsResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/models`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── STREAMING API (PUBLIC - NO AUTH REQUIRED) ────────────────────

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone?: (metadata: { provider: string; model: string; mode?: string }) => void;
  onError?: (error: string) => void;
}

export async function streamChatMessage(
  options: SendChatOptions,
  callbacks: StreamCallbacks
): Promise<void> {
  const {
    projectFiles,
    message,
    chatHistory = [],
    provider = 'openrouter',
    preferredModel = null,
    activeFile = null,
    recentFiles = [],
    consoleErrors = [],
    buildErrors = [],
    selectedCode = null,
    cursorPosition = null,
  } = options;

  const response = await fetch(`${API_BASE_URL}/ai/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectFiles,
      message,
      chatHistory,
      provider,
      preferredModel,
      activeFile,
      recentFiles,
      consoleErrors,
      buildErrors,
      selectedCode,
      cursorPosition,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Stream request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'chunk' && data.content) {
            callbacks.onChunk(data.content);
          } else if (data.type === 'done' && callbacks.onDone) {
            callbacks.onDone({
              provider: data.provider || provider,
              model: data.model || 'unknown',
              mode: data.mode,
            });
          } else if (data.type === 'error' && callbacks.onError) {
            callbacks.onError(data.error || 'Unknown stream error');
          }
        } catch {
          // Skip malformed SSE data
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamChatMessageWithStore(
  message: string,
  callbacks: StreamCallbacks,
  chatHistory: ChatMessage[] = [],
  provider: AiProvider = 'openrouter',
  preferredModel?: string | null,
  activeFile?: string | null,
  selectedCode?: string | null,
  cursorPosition?: CursorPosition | null
): Promise<void> {
  const projectFiles = await buildProjectFilesFromStore();
  
  const consoleErrors = getRecentConsoleErrors();
  const buildErrors = getRecentBuildErrors();
  
  const state = useWorkspaceStore.getState();
  const recentFiles = state.openFiles.slice(-5);

  return streamChatMessage({
    projectFiles,
    message,
    chatHistory,
    provider,
    preferredModel,
    activeFile: activeFile || state.activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
  }, callbacks);
}

// ─── PROJECT API (AUTH REQUIRED) ──────────────────────────────────

export async function listProjects(): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects`, { requiresAuth: true });
}

export async function getProject(id: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}`, { requiresAuth: true });
}

export async function createProject(data: Record<string, unknown>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects`, {
    method: 'POST',
    body: JSON.stringify(data),
    requiresAuth: true,
  });
}

export async function updateProject(id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
    requiresAuth: true,
  });
}

export async function deleteProject(id: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function getProjectFiles(id: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}/files`, { requiresAuth: true });
}

export async function updateProjectFiles(id: string, files: Record<string, string>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}/files`, {
    method: 'PUT',
    body: JSON.stringify({ files }),
    requiresAuth: true,
  });
}

// ─── HEALTH & UPLOAD ────────────────────────────────────────────────

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── UPLOAD API (AUTH REQUIRED) ────────────────────────────────────

export async function uploadFile(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/upload/file`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      throw new Error('Authentication required. Please log in.');
    }
    throw new Error('Upload failed');
  }
  return response.json();
}

export async function uploadZip(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append('zip', file);

  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/upload/zip`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      throw new Error('Authentication required. Please log in.');
    }
    throw new Error('ZIP upload failed');
  }
  return response.json();
}

export async function uploadLargeFolder(files: File[]): Promise<ApiResponse> {
  const formData = new FormData();
  
  console.log(`📁 Preparing to upload ${files.length} files...`);
  
  files.forEach((file) => {
    formData.append('files', file);
  });

  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/upload/folder`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      throw new Error('Authentication required. Please log in.');
    }
    const error = await response.json();
    throw new Error(error.error || 'Folder upload failed');
  }
  
  const result = await response.json();
  console.log(`Upload complete: ${result.count || result.files?.length || 0} files`);
  
  return result;
}
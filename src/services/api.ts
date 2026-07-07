// src/services/api.ts
import { getContent } from '../lib/fileStorage';
import { useWorkspaceStore } from '../store/workspaceStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

interface FetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
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

async function fetchWithError(url: string, options: FetchOptions = {}): Promise<ApiResponse> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
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
  } catch (error) {
    console.error('API request failed:', url, error);
    throw error;
  }
}

// ─── ERROR CAPTURE HELPERS ───────────────────────────────────────────

/**
 * Captures recent console errors from the preview iframe or window.
 * Call this before sending a message to include error context.
 */
export function getRecentConsoleErrors(maxErrors: number = 10): string[] {
  const errors = (window as any).__consoleErrors || [];
  return errors.slice(-maxErrors);
}

/**
 * Captures recent build/compilation errors.
 */
export function getRecentBuildErrors(maxErrors: number = 5): string[] {
  const errors = (window as any).__buildErrors || [];
  return errors.slice(-maxErrors);
}

/**
 * Clears captured errors. Call after successful AI response.
 */
export function clearCapturedErrors(): void {
  (window as any).__consoleErrors = [];
  (window as any).__buildErrors = [];
}

// ─── INDEXEDDB HELPERS ─────────────────────────────────────────────

/**
 * Fetches file contents from IndexedDB (with Zustand fallback) for all files in the store.
 * Use this before sending files to the AI backend.
 */
export async function buildProjectFilesFromStore(): Promise<Record<string, string>> {
  const { files } = useWorkspaceStore.getState();
  const filePaths = Object.keys(files);
  const result: Record<string, string> = {};

  // For small projects (< 1000 files), fetch all from IndexedDB
  const batchSize = 100;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const contents = await Promise.all(
      batch.map(async (path) => {
        // Check Zustand first (newly created files, small files)
        const zustandContent = (files as Record<string, string>)[path];
        if (zustandContent !== undefined && zustandContent !== '') {
          return { path, content: zustandContent };
        }
        // Fallback to IndexedDB
        const dbContent = await getContent(path);
        return { path, content: dbContent || '' };
      })
    );
    
    for (const { path, content } of contents) {
      result[path] = content;
    }

    // Yield to UI every batch
    if (i + batchSize < filePaths.length) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return result;
}

/**
 * Fetches content for a specific file from IndexedDB or Zustand.
 */
export async function getFileContentAsync(path: string): Promise<string> {
  const { files } = useWorkspaceStore.getState();
  const zustandContent = (files as Record<string, string>)[path];
  if (zustandContent !== undefined) return zustandContent;
  
  const dbContent = await getContent(path);
  return dbContent || '';
}

// ─── AI API ─────────────────────────────────────────────────────────

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

  const response = await fetchWithError(`${API_BASE_URL}/ai/chat`, {
    method: 'POST',
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

  return response as unknown as ChatApiResponse;
}

/**
 * Convenience wrapper: fetches file contents from IndexedDB then sends to AI.
 * Automatically captures console/build errors and editor context.
 * Use this instead of sendChatMessage() when working with large projects.
 */
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
  
  // Auto-capture recent errors
  const consoleErrors = getRecentConsoleErrors();
  const buildErrors = getRecentBuildErrors();
  
  // Get recent files from open tabs
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
  return fetchWithError(`${API_BASE_URL}/ai/analyze`, {
    method: 'POST',
    body: JSON.stringify({ projectFiles, provider, activeFile }),
  });
}

/**
 * Convenience wrapper: fetches file contents from IndexedDB then analyzes.
 */
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
  return fetchWithError(`${API_BASE_URL}/ai/explain`, {
    method: 'POST',
    body: JSON.stringify({ projectFiles, filename, provider, activeFile }),
  });
}

/**
 * Convenience wrapper: fetches file contents from IndexedDB then explains.
 */
export async function explainCodeWithStore(
  filename: string,
  provider: AiProvider = 'openrouter',
  activeFile?: string | null
): Promise<ApiResponse> {
  const projectFiles = await buildProjectFilesFromStore();
  return explainCode(projectFiles, filename, provider, activeFile);
}

export async function getAiModels(): Promise<AiModelsResponse> {
  const res = await fetchWithError(`${API_BASE_URL}/ai/models`);
  return res as unknown as AiModelsResponse;
}

// ─── STREAMING API ──────────────────────────────────────────────────

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
    headers: { 'Content-Type': 'application/json' },
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
    throw new Error(`Stream request failed: ${response.status}`);
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

/**
 * Streaming wrapper with auto file fetch and error capture.
 */
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

// ─── PROJECT API ────────────────────────────────────────────────────

export async function listProjects(): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects`);
}

export async function getProject(id: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}`);
}

export async function createProject(data: Record<string, unknown>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}`, {
    method: 'DELETE',
  });
}

export async function getProjectFiles(id: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}/files`);
}

export async function updateProjectFiles(id: string, files: Record<string, string>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/projects/${id}/files`, {
    method: 'PUT',
    body: JSON.stringify({ files }),
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

export async function uploadFile(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/upload/file`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }
  return response.json();
}

export async function uploadZip(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append('zip', file);

  const response = await fetch(`${API_BASE_URL}/upload/zip`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('ZIP upload failed');
  }
  return response.json();
}
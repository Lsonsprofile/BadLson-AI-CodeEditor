// src/services/api.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

interface FetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

interface ChatMessage {
  role: string;
  content: string;
  timestamp: number;
}

interface ApiResponse {
  success?: boolean;
  response?: string;
  error?: string;
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

// AI API - Single sendChatMessage function with provider support
export async function sendChatMessage(
  projectFiles: Record<string, string>,
  message: string,
  chatHistory: ChatMessage[] = [],
  provider: 'gemini' | 'groq' = 'gemini'
): Promise<ApiResponse> {
  const response = await fetchWithError(`${API_BASE_URL}/ai/chat`, {
    method: 'POST',
    body: JSON.stringify({ projectFiles, message, chatHistory, provider }),
  });

  // Handle different response formats
  if (response.response !== undefined) {
    return response;
  }
  
  if (response.success === false) {
    throw new Error(response.error || 'AI request failed');
  }

  return response;
}

export async function analyzeCode(projectFiles: Record<string, string>): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/ai/analyze`, {
    method: 'POST',
    body: JSON.stringify({ projectFiles }),
  });
}

export async function explainCode(projectFiles: Record<string, string>, filename: string): Promise<ApiResponse> {
  return fetchWithError(`${API_BASE_URL}/ai/explain`, {
    method: 'POST',
    body: JSON.stringify({ projectFiles, filename }),
  });
}

// Project API
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

// Health check
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Upload API
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
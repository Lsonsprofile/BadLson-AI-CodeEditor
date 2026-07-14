// src/ai/client.ts
// ─────────────────────────────────────────────────────────────────────
// AI Client — Thin adapter between frontend AI store and backend API
// Handles: request translation, SSE streaming, response mapping, errors
// ─────────────────────────────────────────────────────────────────────

import type {
  AIProviderRequest,
  AIProviderResponse,
  AIStreamChunk,
  AIProviderError,
} from "./types";
import type { AIMessage } from "@/store/ai/ai.types";

const API_BASE = "http://localhost:5002/api/ai";

// ─── REQUEST ADAPTER ────────────────────────────────────────────────
// Translates frontend AIProviderRequest → backend expected shape

interface BackendChatRequest {
  message: string;
  provider: string;
  preferredModel: string | null;
  chatHistory: Array<{ role: string; content: string }>;
  projectFiles: Record<string, string>;
  folders: string[];
  activeFile: string | null;
  recentFiles: string[];
  consoleErrors: string[];
  buildErrors: string[];
  selectedCode: string | null;
  cursorPosition: { line: number; column: number } | null;
}

function adaptRequest(request: AIProviderRequest): BackendChatRequest {
  const messages = request.messages;

  // Find the LAST USER message (not empty assistant placeholder)
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");

  const message = lastUserMessage?.content ?? "";

  // Filter out empty assistant placeholders from chat history
  const chatHistory = messages
    .filter((m) => !(m.role === "assistant" && m.content.trim() === ""))
    .slice(0, -1)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  return {
    message,
    provider: request.provider,
    preferredModel: request.model || null,
    chatHistory,

    // ✅ NEW: Forward project context from workspace store
    projectFiles: request.projectFiles,
    folders: request.folders ?? [],
    activeFile: request.activeFile,
    recentFiles: request.recentFiles,
    consoleErrors: request.consoleErrors ?? [],
    buildErrors: request.buildErrors ?? [],
    selectedCode: request.selectedCode ?? null,
    cursorPosition: request.cursorPosition ?? null,
  };
}

// ─── RESPONSE ADAPTER ───────────────────────────────────────────────
// Translates backend response → frontend AIProviderResponse shape

interface BackendChatResponse {
  success: boolean;
  response: string;
  provider: string;
  model: string;
  mode: string;
  edits?: Array<{ filename: string; code: string }>;
  timestamp: string;
  error?: string;
}

function adaptResponse(backendResponse: BackendChatResponse): AIProviderResponse {
  const now = Date.now();
  const id = crypto.randomUUID();

  return {
    id,
    provider: backendResponse.provider as "openrouter" | "groq" | "gemini",
    model: backendResponse.model,
    message: {
      id,
      role: "assistant",
      content: backendResponse.response,
      timestamp: now,
    },
    finishReason: "stop",
  };
}

// ─── ERROR BUILDER ──────────────────────────────────────────────────
// Creates detailed, actionable error messages

function buildError(
  provider: string,
  message: string,
  status?: number,
  code?: string
): AIProviderError {
  let detailedMessage = message;

  if (status === 400) {
    detailedMessage = `[${provider}] Bad Request: ${message}. The request format may be incorrect. Check that all required fields (message, provider) are provided.`;
  } else if (status === 401 || status === 403) {
    detailedMessage = `[${provider}] Authentication Failed: ${message}. Your API key for ${provider} may be invalid or expired. Check your .env file and verify the key.`;
  } else if (status === 429) {
    detailedMessage = `[${provider}] Rate Limited: ${message}. Too many requests. Wait a moment and try again, or switch to a different provider.`;
  } else if (status === 500) {
    detailedMessage = `[${provider}] Server Error: ${message}. The AI provider is experiencing issues. Try again later or switch providers.`;
  } else if (status === 503) {
    detailedMessage = `[${provider}] Service Unavailable: ${message}. The model may be temporarily offline. Try a different model or provider.`;
  } else if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
    detailedMessage = `[${provider}] Connection Failed: Cannot reach the backend server at ${API_BASE}. Make sure the server is running (npm run start).`;
  } else if (message.includes("All providers failed")) {
    detailedMessage = `[${provider}] All AI providers failed. This usually means: (1) No API keys are configured, (2) All providers are rate-limited, or (3) Network issues. Check your .env file and try again.`;
  } else {
    detailedMessage = `[${provider}] Error: ${message}`;
  }

  return {
    provider: provider as "openrouter" | "groq" | "gemini",
    message: detailedMessage,
    code,
    status,
  };
}

// ─── SSE STREAM PARSER ──────────────────────────────────────────────
// Parses Server-Sent Events from /api/ai/stream

interface SSEEvent {
  type: "chunk" | "done" | "error";
  content?: string;
  provider?: string;
  model?: string;
  mode?: string;
  error?: string;
}

async function parseSSEStream(
  response: Response,
  onChunk: (chunk: AIStreamChunk) => void
): Promise<{ content: string; provider: string; model: string }> {
  if (!response.body) {
    throw new Error("Response body is null — server closed connection unexpectedly.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let metadata: { provider: string; model: string } = { provider: "unknown", model: "unknown" };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const lines = event.split("\n").filter((line) => line.trim());
        let dataLine = "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataLine = line.replace(/^data:\s*/, "").trim();
          }
        }

        if (!dataLine) continue;

        try {
          const parsed: SSEEvent = JSON.parse(dataLine);

          if (parsed.type === "chunk" && parsed.content) {
            fullText += parsed.content;
            onChunk({
              id: crypto.randomUUID(),
              content: parsed.content,
              done: false,
            });
          } else if (parsed.type === "done") {
            metadata.provider = parsed.provider ?? metadata.provider;
            metadata.model = parsed.model ?? metadata.model;
            onChunk({
              id: crypto.randomUUID(),
              content: "",
              done: true,
            });
          } else if (parsed.type === "error") {
            throw new Error(parsed.error || "Unknown streaming error");
          }
        } catch (parseError) {
          console.warn("[AIClient] Malformed SSE event:", dataLine, parseError);
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const dataLine = line.replace(/^data:\s*/, "").trim();
          try {
            const parsed: SSEEvent = JSON.parse(dataLine);
            if (parsed.type === "chunk" && parsed.content) {
              fullText += parsed.content;
            } else if (parsed.type === "done") {
              metadata.provider = parsed.provider ?? metadata.provider;
              metadata.model = parsed.model ?? metadata.model;
            }
          } catch {
            // Ignore final malformed data
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!fullText && metadata.provider === "unknown") {
    throw new Error("Stream ended without receiving any data. The server may have crashed or the connection was interrupted.");
  }

  return { content: fullText, ...metadata };
}

// ─── AI CLIENT CLASS ────────────────────────────────────────────────

export class AIClient {
  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    const body = adaptRequest(request);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (networkError) {
      const error = buildError(
        request.provider,
        networkError instanceof Error ? networkError.message : "Network error",
        undefined,
        "NETWORK_ERROR"
      );
      throw new Error(error.message);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = buildError(request.provider, errorText, response.status, `HTTP_${response.status}`);
      throw new Error(error.message);
    }

    let backendResponse: BackendChatResponse;
    try {
      backendResponse = await response.json();
    } catch {
      throw new Error("Failed to parse server response as JSON");
    }

    if (!backendResponse.success) {
      throw new Error(backendResponse.error || "Server reported failure");
    }

    return adaptResponse(backendResponse);
  }

  async stream(
    request: AIProviderRequest,
    onChunk: (chunk: AIStreamChunk) => void
  ): Promise<AIProviderResponse> {
    const body = adaptRequest(request);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (networkError) {
      const error = buildError(
        request.provider,
        networkError instanceof Error ? networkError.message : "Network error",
        undefined,
        "NETWORK_ERROR"
      );
      throw new Error(error.message);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const error = buildError(request.provider, errorText, response.status, `HTTP_${response.status}`);
      throw new Error(error.message);
    }

    const { content, provider, model } = await parseSSEStream(response, onChunk);

    const id = crypto.randomUUID();
    const now = Date.now();

    return {
      id,
      provider: provider as "openrouter" | "groq" | "gemini",
      model,
      message: {
        id,
        role: "assistant",
        content,
        timestamp: now,
      },
      finishReason: "stop",
    };
  }
}

// ─── SINGLETON EXPORT ───────────────────────────────────────────────

export const aiClient = new AIClient();

// ─── UTILITY: EXTRACT CODE BLOCKS FOR COPY FUNCTIONALITY ───────────

export interface CodeBlock {
  language: string;
  filename: string | null;
  code: string;
}

export function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  const editRegex = /```edit:([^\n]+)\n([\s\S]*?)```/g;
  let editMatch: RegExpExecArray | null;
  while ((editMatch = editRegex.exec(content)) !== null) {
    blocks.push({
      language: "edit",
      filename: editMatch[1].trim(),
      code: editMatch[2].trim(),
    });
  }

  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = codeRegex.exec(content)) !== null) {
    const language = codeMatch[1]?.trim() || "text";
    const code = codeMatch[2].trim();

    const alreadyCaptured = blocks.some(
      (b) => b.language === "edit" && b.code === code
    );

    if (!alreadyCaptured) {
      blocks.push({
        language,
        filename: null,
        code,
      });
    }
  }

  return blocks;
}

// ─── UTILITY: COPY TO CLIPBOARD ─────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("[AIClient] Copy failed:", error);
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }
}
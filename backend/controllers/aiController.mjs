// backend/controllers/aiController.mjs
import {
  buildPrompt,
  callWithFallback,
  streamWithFallback,
  parseAiResponse,
} from '../services/aiService.mjs';

// ─── HANDLE CHAT ──────────────────────────────────────────────────
export async function handleChat(params) {
  const {
    message,
    projectFiles,
    chatHistory,
    provider,
    preferredModel,
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
  } = params;

  const { messages, mode } = buildPrompt(projectFiles || {}, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
    chatHistory,
  });

  const result = await callWithFallback(messages, provider || 'openrouter', preferredModel || null);
  const parsed = parseAiResponse(result.content);

  return {
    content: parsed.message || result.content,
    provider: result.provider,
    model: result.model,
    mode: parsed.mode || mode,
    edits: parsed.edits || [],
    completedFile: parsed.completedFile || null,
  };
}

// ─── HANDLE STREAM ────────────────────────────────────────────────
export async function handleStream(params) {
  const {
    message,
    projectFiles,
    chatHistory,
    provider,
    preferredModel,
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
    onChunk,
    onComplete,
  } = params;

  const { messages, mode } = buildPrompt(projectFiles || {}, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
    chatHistory,
  });

  let fullText = '';
  const wrappedOnChunk = (chunk) => {
    fullText += chunk;
    if (onChunk) onChunk(chunk);
  };

  const result = await streamWithFallback(
    messages,
    wrappedOnChunk,
    provider || 'openrouter',
    preferredModel || null
  );

  const parsed = parseAiResponse(result.content || fullText);

  const finalResult = {
    content: parsed.message || result.content || fullText,
    provider: result.provider,
    model: result.model,
    mode: parsed.mode || mode,
    edits: parsed.edits || [],
    completedFile: parsed.completedFile || null,
  };

  if (onComplete) onComplete(finalResult);
  return finalResult;
}

// ─── HANDLE ANALYZE ───────────────────────────────────────────────
export async function handleAnalyze(params) {
  const { projectFiles, provider, preferredModel, activeFile } = params;

  const reviewMessage = 'Please review this entire codebase for bugs, security vulnerabilities, performance issues, and TypeScript type safety problems. For each issue found, explain the problem and provide the corrected code using ```edit:path format only.';

  const { messages, mode } = buildPrompt(projectFiles || {}, reviewMessage, {
    activeFile,
    chatHistory: [],
  });

  const result = await callWithFallback(messages, provider || 'openrouter', preferredModel || null);
  const parsed = parseAiResponse(result.content);

  return {
    content: parsed.message || result.content,
    provider: result.provider,
    model: result.model,
    mode: 'review',
    edits: parsed.edits || [],
    completedFile: parsed.completedFile || null,
  };
}

// ─── HANDLE EXPLAIN ───────────────────────────────────────────────
export async function handleExplain(params) {
  const { projectFiles, filename, provider, preferredModel, activeFile } = params;

  const fileContent = projectFiles?.[filename] || '';
  const explainMessage = `Please explain the following file in detail: ${filename}\n\nFile content:\n\`\`\`\n${fileContent}\n\`\`\`\n\nBreak down: what it does, how it works, key patterns used, and any potential improvements.`;

  const { messages, mode } = buildPrompt(projectFiles || {}, explainMessage, {
    activeFile: activeFile || filename,
    chatHistory: [],
  });

  const result = await callWithFallback(messages, provider || 'openrouter', preferredModel || null);
  const parsed = parseAiResponse(result.content);

  return {
    content: parsed.message || result.content,
    provider: result.provider,
    model: result.model,
    mode: 'explain',
    edits: parsed.edits || [],
    completedFile: parsed.completedFile || null,
  };
}
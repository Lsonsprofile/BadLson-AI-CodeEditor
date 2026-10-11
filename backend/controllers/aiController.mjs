// backend/controllers/aiController.mjs
import {
  buildPrompt,
  callWithFallback,
  streamWithFallback,
  parseAiResponse,
  applyEdits,
} from '../services/aiService.mjs';

export async function handleChat({
  message,
  projectFiles = {},
  files = {}, // frontend may send "files" instead of projectFiles
  chatHistory = [],
  provider = 'openrouter',
  preferredModel = null,
  preferredOpenRouterModel = null,
  activeFile = null,
  recentFiles = [],
  openFiles = [],
  consoleErrors = [],
  buildErrors = [],
  selectedCode = null,
  cursorPosition = null,
  folders = [],
} = {}) {
  // Merge aliases so AI always sees project content
  const mergedFiles =
    Object.keys(projectFiles || {}).length > 0
      ? projectFiles
      : files || {};
  projectFiles = mergedFiles;
  if (!preferredModel && preferredOpenRouterModel) preferredModel = preferredOpenRouterModel;
  if ((!recentFiles || recentFiles.length === 0) && openFiles?.length) {
    recentFiles = openFiles;
  }

  console.log(
    `[AI Controller] handleChat | msg="${(message || '').substring(0, 60)}" | files=${Object.keys(projectFiles).length} | folders=${(folders || []).length} | provider=${provider}`
  );

  const trimmed = (message || '').trim().toLowerCase();
  const isGreeting =
    /^(hello|hi|hey|howdy|good morning|good afternoon|good evening|what's up|sup|yo|greetings)[!?.]*$/i.test(
      trimmed
    );
  if (isGreeting) {
    const greetingText =
      "Hello! I'm your AI coding assistant. I suggest code in chat — click Apply on a code block to write it into your project. What do you need?";
    return {
      success: true,
      content: greetingText,
      message: greetingText,
      response: greetingText,
      provider: 'system',
      model: 'greeting',
      mode: 'general',
      edits: { applied: [], failed: [] },
      timestamp: new Date().toISOString(),
    };
  }

  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
    folders,
  });

  let response;
  try {
    response = await callWithFallback(messages, provider, preferredModel, projectFiles);
  } catch (error) {
    console.error('[AI Controller] AI call failed:', error.message);
    throw new Error(
      `AI service error: ${error.message}. Check that OPENROUTER_API_KEY / GROQ_API_KEY / GEMINI_API_KEY is set in backend/.env`
    );
  }

  if (!response || !response.content) {
    const fallbackText =
      "I couldn't generate a response. Please try again or switch AI provider in settings.";
    return {
      success: true,
      content: fallbackText,
      message: fallbackText,
      response: fallbackText,
      provider: 'system',
      model: 'fallback',
      mode: 'error',
      edits: { applied: [], failed: [] },
      timestamp: new Date().toISOString(),
    };
  }

  const parsed = parseAiResponse(response.content);
  let edits = { applied: [], failed: [] };

  // Manual apply only from the UI — never auto-write
  const skipApply = true;
  if (!skipApply && parsed.edits?.length) {
    edits = applyEdits(parsed.edits, projectFiles);
  }

  return {
    success: true,
    content: parsed.displayText || response.content,
    message: parsed.displayText || response.content,
    response: parsed.displayText || response.content,
    rawContent: response.content,
    provider: response.provider || provider,
    model: response.model || preferredModel,
    mode,
    edits,
    timestamp: new Date().toISOString(),
  };
}

export async function handleStream(args) {
  const {
    message,
    projectFiles = {},
    files = {},
    onChunk,
    onComplete,
    provider = 'openrouter',
    preferredModel = null,
    activeFile = null,
    folders = [],
    chatHistory = [],
  } = args || {};

  const merged =
    Object.keys(projectFiles || {}).length > 0 ? projectFiles : files || {};

  const { messages, mode } = buildPrompt(merged, message, {
    activeFile,
    folders,
    chatHistory,
  });

  await streamWithFallback(messages, provider, preferredModel, {
    onChunk,
    onComplete: (result) => {
      if (onComplete) onComplete({ ...result, mode });
    },
  });
}

export async function handleAnalyze(body = {}) {
  const projectFiles = body.projectFiles || body.files || {};
  const { messages } = buildPrompt(projectFiles, body.message || 'Analyze this project', {
    activeFile: body.activeFile || null,
    folders: body.folders || [],
  });
  const response = await callWithFallback(messages, body.provider || 'openrouter', body.preferredModel || null, projectFiles);
  return {
    analysis: response?.content || '',
    provider: response?.provider,
    model: response?.model,
  };
}

export async function handleExplain(body = {}) {
  const projectFiles = body.projectFiles || body.files || {};
  const filename = body.filename || body.activeFile || 'the selected file';
  const { messages } = buildPrompt(
    projectFiles,
    body.message || `Explain ${filename} in detail`,
    {
      activeFile: body.activeFile || filename,
      folders: body.folders || [],
    }
  );
  const response = await callWithFallback(messages, body.provider || 'openrouter', body.preferredModel || null, projectFiles);
  return {
    explanation: response?.content || '',
    provider: response?.provider,
    model: response?.model,
  };
}

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
  chatHistory = [],
  provider = 'openrouter',
  preferredModel = null,
  activeFile = null,
  recentFiles = [],
  consoleErrors = [],
  buildErrors = [],
  selectedCode = null,
  cursorPosition = null,
  folders = [],
}) {
  console.log(
    `[AI Controller] handleChat | msg="${(message || '').substring(0, 60)}" | files=${Object.keys(projectFiles).length} | provider=${provider}`
  );

  const trimmed = (message || '').trim().toLowerCase();
  const isGreeting =
    /^(hello|hi|hey|howdy|good morning|good afternoon|good evening|what's up|sup|yo|greetings)[!?.]*$/i.test(
      trimmed
    );
  if (isGreeting) {
    const greetingText =
      "Hello! I'm your AI coding assistant. Use @fix, @create, or @bug to control how code is applied. What do you need?";
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
  let updatedFiles = {};
  let appliedEdits = [];
  let failedEdits = [];
  const changedOnly = {};

  const skipApply = mode === 'fix' || mode === 'explain' || mode === 'general';

  if (
    !skipApply &&
    ((parsed.edits && parsed.edits.length > 0) ||
      (parsed.patches && parsed.patches.length > 0))
  ) {
    const result = applyEdits(
      projectFiles,
      parsed.edits || [],
      parsed.patches || [],
      { activeFile }
    );
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
  }

  for (const [filename, content] of Object.entries(updatedFiles)) {
    if (projectFiles[filename] !== content) {
      changedOnly[filename] = content;
    }
  }

  if (mode === 'general' && Object.keys(changedOnly).length === 0) {
    return {
      success: true,
      content: response.content,
      message: response.content,
      response: response.content,
      rawContent: response.content,
      provider: response.provider,
      model: response.model,
      mode: 'general',
      edits: { applied: [], failed: [] },
      timestamp: new Date().toISOString(),
    };
  }

  const fullText =
    response.content ||
    parsed.message ||
    "I couldn't generate a proper response. Please try again.";

  return {
    success: true,
    content: fullText,
    message: fullText,
    response: fullText,
    rawContent: response.content,
    provider: response.provider,
    model: response.model,
    mode: parsed.mode || mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles:
      Object.keys(changedOnly).length > 0 ? changedOnly : undefined,
    wireframes:
      parsed.wireframes && parsed.wireframes.length > 0
        ? parsed.wireframes
        : undefined,
    fileContext: {
      analyzed: true,
      fileCount: Object.keys(projectFiles).length,
      htmlAnalyzed: !!projectFiles['index.html'],
    },
    timestamp: new Date().toISOString(),
  };
}

export async function handleStream(args) {
  const { onChunk, onComplete, ...chatArgs } = args || {};
  try {
    const result = await handleChat(chatArgs);
    const text = result.content || result.response || '';
    if (typeof onChunk === 'function' && text) onChunk(text);
    if (typeof onComplete === 'function') onComplete(result);
    return result;
  } catch (error) {
    if (typeof onComplete === 'function') {
      onComplete({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

export async function handleAnalyze(body = {}) {
  const message =
    body.message ||
    body.prompt ||
    'Analyze this project. Summarize structure, main files, and suggest improvements.';
  return handleChat({
    ...body,
    message: `@fix ${message}`,
  });
}

export async function handleExplain(body = {}) {
  const code = body.code || body.selectedCode || '';
  const question = body.message || body.question || 'Explain this code clearly.';
  const message = code
    ? `Explain the following code:\n\n\`\`\`\n${code}\n\`\`\`\n\n${question}`
    : question;
  return handleChat({
    ...body,
    message,
  });
}

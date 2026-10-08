// backend/controllers/aiController.mjs
import {
  buildPrompt,
  callWithFallback,
  streamWithFallback,
  parseAiResponse,
  applyEdits,
} from '../services/aiService.mjs';

/**
 * Handle a normal (non-streaming) chat request.
 * Returns a consistent shape the frontend expects.
 */
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
}) {
  console.log(
    `[AI Controller] handleChat | msg="${(message || '').substring(0, 60)}" | files=${Object.keys(projectFiles).length} | provider=${provider}`
  );

  // Quick greeting short-circuit (no API call)
  const trimmed = (message || '').trim().toLowerCase();
  const isGreeting =
    /^(hello|hi|hey|howdy|good morning|good afternoon|good evening|what's up|sup|yo|greetings)[!?.]*$/i.test(
      trimmed
    );
  if (isGreeting) {
    const greetingText =
      "Hello! I'm your AI coding assistant. I can help you write code, fix bugs, and explain concepts. What do you need?";
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

  // Build messages + detect mode
  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
  });

  // Call provider with fallback
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

  // General conversation → return model text as-is (do NOT force code edits)
  if (mode === 'general') {
    return {
      success: true,
      content: response.content,
      message: response.content,
      response: response.content,
      provider: response.provider,
      model: response.model,
      mode: 'general',
      edits: { applied: [], failed: [] },
      timestamp: new Date().toISOString(),
    };
  }

  // Code-related modes: parse edit blocks and apply if present
  const parsed = parseAiResponse(response.content);
  let updatedFiles = {};
  let appliedEdits = [];
  let failedEdits = [];

  if (
    (parsed.edits && parsed.edits.length > 0) ||
    (parsed.patches && parsed.patches.length > 0)
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

  // IMPORTANT: Do NOT invent default templates when the model didn't emit edits.
  // Just return the model's natural answer.
  const finalResponse =
    parsed.message ||
    response.content ||
    "I couldn't generate a proper response. Please try again.";

  return {
    success: true,
    content: finalResponse,
    message: finalResponse,
    response: finalResponse,
    provider: response.provider,
    model: response.model,
    mode: parsed.mode || mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles:
      Object.keys(updatedFiles).length > 0 ? updatedFiles : undefined,
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

/**
 * Streaming chat (SSE). Used by some clients; non-streaming is the main path.
 */
export async function handleStream({
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
  onChunk,
  onComplete,
}) {
  console.log(
    `[AI Controller] handleStream | msg="${(message || '').substring(0, 60)}"`
  );

  const trimmed = (message || '').trim().toLowerCase();
  const isGreeting =
    /^(hello|hi|hey|howdy|good morning|good afternoon|good evening|what's up|sup|yo|greetings)[!?.]*$/i.test(
      trimmed
    );
  if (isGreeting) {
    const greetingText =
      "Hello! I'm your AI coding assistant. I can help you write code, fix bugs, and explain concepts. What do you need?";
    if (onChunk) onChunk(greetingText);
    if (onComplete) {
      onComplete({
        success: true,
        content: greetingText,
        response: greetingText,
        provider: 'system',
        model: 'greeting',
        mode: 'general',
      });
    }
    return;
  }

  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
  });

  try {
    await streamWithFallback(
      messages,
      provider,
      preferredModel,
      projectFiles,
      (chunk) => {
        if (onChunk && chunk) onChunk(chunk);
      },
      (result) => {
        if (onComplete) {
          onComplete({
            success: true,
            content: result?.content || '',
            response: result?.content || '',
            provider: result?.provider || provider,
            model: result?.model || preferredModel,
            mode,
          });
        }
      }
    );
  } catch (error) {
    console.error('[AI Controller] Stream failed:', error.message);
    if (onComplete) {
      onComplete({
        success: false,
        error: error.message,
        content: `AI stream error: ${error.message}`,
        response: `AI stream error: ${error.message}`,
      });
    }
    throw error;
  }
}

export async function handleAnalyze({ code, language, provider = 'openrouter' }) {
  const message = `Analyze this ${language || 'code'} and list bugs, risks, and improvements:\n\n\`\`\`\n${code || ''}\n\`\`\``;
  return handleChat({ message, projectFiles: {}, provider });
}

export async function handleExplain({ code, language, provider = 'openrouter' }) {
  const message = `Explain this ${language || 'code'} clearly for a developer:\n\n\`\`\`\n${code || ''}\n\`\`\``;
  return handleChat({ message, projectFiles: {}, provider });
}

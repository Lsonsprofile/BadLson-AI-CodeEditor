// backend/controllers/aiController.mjs
import { 
  generateCodeResponse, 
  streamCodeResponse, 
  parseAiResponse,
  applyEdits,
} from '../services/aiService.mjs';

export async function handleChat(options) {
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
  } = options;

  const response = await generateCodeResponse(projectFiles, message, {
    chatHistory,
    provider,
    preferredModel,
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
  });

  const parsed = parseAiResponse(response.content);

  // Apply edits if any
  let updatedFiles = null;
  let appliedEdits = [];
  let failedEdits = [];
  
  if (parsed.edits && parsed.edits.length > 0) {
    const result = applyEdits(projectFiles, parsed.edits, { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
  }

  return {
    content: parsed.message,
    provider: response.provider,
    model: response.model,
    mode: parsed.mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles,
  };
}

export async function handleStream(options) {
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
  } = options;

  let fullText = '';
  let metadata = {};

  const response = await streamCodeResponse(projectFiles, message, (chunk) => {
    fullText += chunk;
    if (onChunk) onChunk(chunk);
  }, {
    chatHistory,
    provider,
    preferredModel,
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
  });

  const parsed = parseAiResponse(response);
  
  metadata = {
    provider: response.provider,
    model: response.model,
    mode: parsed.mode,
  };

  // Apply edits after stream completes
  if (parsed.edits && parsed.edits.length > 0) {
    const result = applyEdits(projectFiles, parsed.edits, { activeFile });
    metadata.edits = result;
  }

  if (onComplete) onComplete(metadata);
}

export async function handleAnalyze(options) {
  const { projectFiles, provider, preferredModel, activeFile } = options;

  // Force review mode by prepending instruction
  const reviewMessage = 'Please review this codebase for bugs, security issues, performance problems, and maintainability concerns. Be thorough and specific.';

  const response = await generateCodeResponse(projectFiles, reviewMessage, {
    provider,
    preferredModel,
    activeFile,
  });

  const parsed = parseAiResponse(response);

  return {
    content: parsed.message,
    provider: response.provider,
    model: response.model,
    edits: parsed.edits || [],
  };
}

export async function handleExplain(options) {
  const { projectFiles, filename, provider, preferredModel, activeFile } = options;

  const explainMessage = `Please explain the code in file "${filename}". Break down what it does, key functions, and any important patterns or decisions.`;

  const response = await generateCodeResponse(projectFiles, explainMessage, {
    provider,
    preferredModel,
    activeFile,
  });

  const parsed = parseAiResponse(response);

  return {
    content: parsed.message,
    provider: response.provider,
    model: response.model,
  };
}
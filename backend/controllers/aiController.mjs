// backend/controllers/aiController.mjs
import { 
  generateCodeResponse, 
  streamCodeResponse, 
  parseAiResponse,
  applyEdits,
} from '../services/aiService.mjs';

// ─── SSE HELPER ─────────────────────────────────────────────────────
// Sends a properly formatted SSE event and flushes immediately

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Flush if compression middleware is active
  if (res.flush) res.flush();
}

function sendSSEComment(res, comment) {
  res.write(`:${comment}\n\n`);
  if (res.flush) res.flush();
}

// ─── CHAT (non-streaming) ───────────────────────────────────────────

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

// ─── STREAM (SSE with keep-alive for Render) ───────────────────────

export async function handleStream(req, res, options) {
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

  // ✅ Set SSE headers immediately
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering if behind nginx
  });

  // Send initial connection comment
  sendSSEComment(res, 'connected');

  let fullText = '';
  let streamError = null;
  let metadata = {};
  let chunkCount = 0;

  // ✅ Keep-alive heartbeat every 15 seconds to prevent Render timeout
  const keepAliveInterval = setInterval(() => {
    try {
      sendSSEComment(res, 'keep-alive');
    } catch (err) {
      // Client disconnected
      clearInterval(keepAliveInterval);
    }
  }, 15000);

  // ✅ Handle client disconnect
  const onClientClose = () => {
    clearInterval(keepAliveInterval);
    console.log('[AI] Client disconnected from stream');
  };
  req.on('close', onClientClose);
  req.on('abort', onClientClose);

  try {
    // Stream chunks from AI service
    const response = await streamCodeResponse(projectFiles, message, (chunk) => {
      fullText += chunk;
      chunkCount++;
      
      // Send chunk as SSE event
      sendSSE(res, {
        type: 'chunk',
        content: chunk,
        index: chunkCount,
      });
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

    // Parse final response for edits
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

    // Send completion event
    sendSSE(res, {
      type: 'done',
      ...metadata,
    });

  } catch (error) {
    streamError = error;
    console.error('[AI] Stream error:', error);
    
    // Send error event
    sendSSE(res, {
      type: 'error',
      error: error.message,
      code: error.code || 'STREAM_ERROR',
    });
  } finally {
    clearInterval(keepAliveInterval);
    req.off('close', onClientClose);
    req.off('abort', onClientClose);
    
    // End the response
    res.end();
  }

  // Return metadata for any post-processing
  if (streamError) throw streamError;
  return metadata;
}

// ─── ANALYZE ────────────────────────────────────────────────────────

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

// ─── EXPLAIN ───────────────────────────────────────────────────────

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
// backend/routes/aiRoutes.mjs
import express from 'express';
import {
  handleChat,
  handleStream,
  handleAnalyze,
  handleExplain,
} from '../controllers/aiController.mjs';
import { getAvailableModels } from '../services/aiService.mjs';

const router = express.Router();

// ─── ASYNC ERROR WRAPPER ────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ─── SSE FLUSH HELPERS ─────────────────────────────────────────────
function sseWrite(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (res.flush) res.flush();
}

function sseComment(res, comment) {
  res.write(`:${comment}\n\n`);
  if (res.flush) res.flush();
}

// ─── DEBUG LOGGING MIDDLEWARE ───────────────────────────────────────
router.use((req, res, next) => {
  if (req.method === 'POST' && req.path !== '/stream') {
    const fileCount = req.body?.projectFiles ? Object.keys(req.body.projectFiles).length : 0;
    const fileNames = fileCount > 0
      ? Object.keys(req.body.projectFiles).slice(0, 5).join(', ') + (fileCount > 5 ? `... (+${fileCount - 5} more)` : '')
      : 'none';

    console.log(`[AI Route] ${req.method} ${req.path} | Provider: ${req.body?.provider || 'default'} | Files: ${fileCount} (${fileNames})`);
  }
  next();
});

// ─── POST /api/ai/chat ──────────────────────────────────────────────
router.post('/chat', asyncHandler(async (req, res) => {
  const {
    message,
    projectFiles,
    chatHistory,
    provider,
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
    preferredModel,
  } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Message is required and must be a string',
    });
  }

  const response = await handleChat({
    message,
    projectFiles: projectFiles || {},
    chatHistory: chatHistory || [],
    provider: provider || 'openrouter',
    preferredModel: preferredModel || null,
    activeFile: activeFile || null,
    recentFiles: recentFiles || [],
    consoleErrors: consoleErrors || [],
    buildErrors: buildErrors || [],
    selectedCode: selectedCode || null,
    cursorPosition: cursorPosition || null,
  });

  res.json({
    success: true,
    response: response.content,
    provider: response.provider,
    model: response.model,
    mode: response.mode,
    edits: response.edits || [],
    timestamp: new Date().toISOString(),
  });
}));

// ─── POST /api/ai/stream ───────────────────────────────────────────
router.post('/stream', asyncHandler(async (req, res) => {
  const {
    message,
    projectFiles,
    chatHistory,
    provider,
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    selectedCode,
    cursorPosition,
    preferredModel,
  } = req.body;

  if (!message || typeof message !== 'string') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    sseWrite(res, { type: 'error', error: 'Message is required and must be a string' });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });

  sseComment(res, 'connected');

  let fullResponse = '';
  let metadata = {};
  let isClosed = false;
  let chunkCount = 0;

  const keepAliveInterval = setInterval(() => {
    if (isClosed) return;
    try {
      sseComment(res, `keep-alive-${Date.now()}`);
    } catch (err) {
      cleanup();
    }
  }, 15000);

  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    clearInterval(keepAliveInterval);
    req.off('close', onClientClose);
    req.off('abort', onClientClose);
  }

  function onClientClose() {
    console.log('[AI Stream] Client disconnected');
    cleanup();
  }

  req.on('close', onClientClose);
  req.on('abort', onClientClose);

  try {
    await handleStream({
      message,
      projectFiles: projectFiles || {},
      chatHistory: chatHistory || [],
      provider: provider || 'openrouter',
      preferredModel: preferredModel || null,
      activeFile: activeFile || null,
      recentFiles: recentFiles || [],
      consoleErrors: consoleErrors || [],
      buildErrors: buildErrors || [],
      selectedCode: selectedCode || null,
      cursorPosition: cursorPosition || null,
      onChunk: (chunk) => {
        if (isClosed) return;
        fullResponse += chunk;
        chunkCount++;
        sseWrite(res, { type: 'chunk', content: chunk, index: chunkCount });
      },
      onComplete: (result) => {
        if (isClosed) return;
        metadata = result;
      },
    });

    if (!isClosed) {
      sseWrite(res, {
        type: 'done',
        provider: metadata.provider,
        model: metadata.model,
        mode: metadata.mode,
      });
    }
  } catch (error) {
    console.error('[AI Stream] Error:', error);
    if (!isClosed) {
      sseWrite(res, {
        type: 'error',
        error: error.message,
        code: error.code || 'STREAM_ERROR',
      });
    }
  } finally {
    cleanup();
    if (!res.writableEnded) {
      res.end();
    }
  }
}));

// ─── POST /api/ai/analyze ──────────────────────────────────────────
router.post('/analyze', asyncHandler(async (req, res) => {
  const { projectFiles, provider, activeFile, preferredModel } = req.body;

  if (!projectFiles || Object.keys(projectFiles).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Project files are required for analysis',
    });
  }

  const response = await handleAnalyze({
    projectFiles,
    provider: provider || 'openrouter',
    preferredModel: preferredModel || null,
    activeFile: activeFile || null,
  });

  res.json({
    success: true,
    response: response.content,
    provider: response.provider,
    model: response.model,
    mode: 'review',
    edits: response.edits || [],
    timestamp: new Date().toISOString(),
  });
}));

// ─── POST /api/ai/explain ──────────────────────────────────────────
router.post('/explain', asyncHandler(async (req, res) => {
  const { projectFiles, filename, provider, activeFile, preferredModel } = req.body;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Filename is required',
    });
  }

  const response = await handleExplain({
    projectFiles: projectFiles || {},
    filename,
    provider: provider || 'openrouter',
    preferredModel: preferredModel || null,
    activeFile: activeFile || null,
  });

  res.json({
    success: true,
    response: response.content,
    provider: response.provider,
    model: response.model,
    mode: 'explain',
    timestamp: new Date().toISOString(),
  });
}));

// ─── GET /api/ai/models ────────────────────────────────────────────
router.get('/models', asyncHandler(async (req, res) => {
  const models = await getAvailableModels();
  res.json({
    success: true,
    data: models,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
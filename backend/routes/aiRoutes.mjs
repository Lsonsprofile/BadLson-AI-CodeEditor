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

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function sseWrite(res, data) {
  if (res.writableEnded || res.destroyed) return false;
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
    return true;
  } catch (e) {
    return false;
  }
}

function sseComment(res, comment) {
  if (res.writableEnded || res.destroyed) return false;
  try {
    res.write(`:${comment}\n\n`);
    if (res.flush) res.flush();
    return true;
  } catch (e) {
    return false;
  }
}

// ─── DEBUG LOGGING ─────────────────────────────────────────────────
router.use((req, res, next) => {
  if (req.method === 'POST') {
    const fileCount = req.body?.projectFiles ? Object.keys(req.body.projectFiles).length : 0;
    console.log(`[AI Route] ${req.method} ${req.path} | Provider: ${req.body?.provider || 'default'} | Files: ${fileCount}`);
  }
  next();
});

// ─── POST /api/ai/chat ─────────────────────────────────────────────
router.post('/chat', asyncHandler(async (req, res) => {
  const { message, projectFiles, chatHistory, provider, activeFile, recentFiles, consoleErrors, buildErrors, selectedCode, cursorPosition, preferredModel } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Message is required and must be a string' });
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
  const { message, projectFiles, chatHistory, provider, activeFile, recentFiles, consoleErrors, buildErrors, selectedCode, cursorPosition, preferredModel } = req.body;

  // ─── SET SSE HEADERS IMMEDIATELY ────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200);

  // Flush headers immediately so client knows connection is alive
  if (res.flushHeaders) res.flushHeaders();

  if (!message || typeof message !== 'string') {
    sseWrite(res, { type: 'error', error: 'Message is required and must be a string' });
    res.end();
    return;
  }

  // Send initial ping so frontend knows stream is alive
  sseComment(res, 'connected');
  sseWrite(res, { type: 'info', message: 'Connecting to AI…' });

  let fullResponse = '';
  let metadata = {};
  let isClosed = false;
  let chunkCount = 0;
  let firstChunkReceived = false;

  // Keep-alive every 10s
  const keepAliveInterval = setInterval(() => {
    if (isClosed) return;
    const ok = sseComment(res, `keepalive-${Date.now()}`);
    if (!ok) cleanup();
  }, 10000);

  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    clearInterval(keepAliveInterval);
    clearTimeout(safetyTimeout);
    req.off('close', onClientClose);
    req.off('abort', onClientClose);
  }

  function onClientClose() {
    console.log('[AI Stream] Client disconnected');
    cleanup();
  }

  req.on('close', onClientClose);
  req.on('abort', onClientClose);

  // Safety timeout: if no chunk in 60s, abort
  const safetyTimeout = setTimeout(() => {
    if (!firstChunkReceived && !isClosed) {
      console.error('[AI Stream] Safety timeout: no chunks received within 60s');
      sseWrite(res, { type: 'error', error: 'Server timeout: AI provider did not respond within 60 seconds. Try again or switch providers.' });
      cleanup();
      if (!res.writableEnded) res.end();
    }
  }, 60000);

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
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          clearTimeout(safetyTimeout);
          console.log('[AI Stream] First chunk received');
        }
        fullResponse += chunk;
        chunkCount++;
        sseWrite(res, { type: 'chunk', content: chunk, index: chunkCount });
      },
      onComplete: (result) => {
        if (isClosed) return;
        metadata = result;
      },
    });

    clearTimeout(safetyTimeout);

    if (!isClosed) {
      if (!firstChunkReceived) {
        console.warn('[AI Stream] Stream completed but no chunks were received');
        sseWrite(res, { type: 'error', error: 'AI returned empty response. The model may be unavailable or the request was too large.' });
      } else {
        sseWrite(res, {
          type: 'done',
          provider: metadata.provider || 'unknown',
          model: metadata.model || 'unknown',
          mode: metadata.mode || 'generic',
        });
      }
    }
  } catch (error) {
    clearTimeout(safetyTimeout);
    console.error('[AI Stream] Error:', error.message);
    if (!isClosed) {
      sseWrite(res, {
        type: 'error',
        error: error.message || 'Stream failed',
        code: error.code || 'STREAM_ERROR',
      });
    }
  } finally {
    cleanup();
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
}));

// ─── POST /api/ai/analyze ──────────────────────────────────────────
router.post('/analyze', asyncHandler(async (req, res) => {
  const { projectFiles, provider, activeFile, preferredModel } = req.body;

  if (!projectFiles || Object.keys(projectFiles).length === 0) {
    return res.status(400).json({ success: false, error: 'Project files are required for analysis' });
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
    return res.status(400).json({ success: false, error: 'Filename is required' });
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
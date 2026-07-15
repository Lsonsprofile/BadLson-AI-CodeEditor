// backend/routes/aiRoutes.mjs
import express from 'express';
import { 
  handleChat, 
  handleStream, 
  handleAnalyze, 
  handleExplain 
} from '../controllers/aiController.mjs';
import { getAvailableModels } from '../services/aiService.mjs';

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ─── SSE HELPERS ────────────────────────────────────────────────────
function sseWrite(res, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (res.flush) res.flush();
}

function sseComment(res, comment) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`:${comment}\n\n`);
  if (res.flush) res.flush();
}

// ─── DEBUG LOGGING ──────────────────────────────────────────────────
router.use((req, res, next) => {
  if (req.method === 'POST' && req.path !== '/stream') {
    const fileCount = req.body?.projectFiles ? Object.keys(req.body.projectFiles).length : 0;
    console.log(`[AI Route] ${req.method} ${req.path} | Provider: ${req.body?.provider || 'default'} | Files: ${fileCount}`);
  }
  next();
});

// ─── CHAT (non-streaming) ───────────────────────────────────────────
router.post('/chat', asyncHandler(async (req, res) => {
  const { message, projectFiles, chatHistory, provider, activeFile, recentFiles, consoleErrors, buildErrors, selectedCode, cursorPosition, preferredModel } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  const response = await handleChat({
    message, projectFiles: projectFiles || {}, chatHistory: chatHistory || [],
    provider: provider || 'openrouter', preferredModel: preferredModel || null,
    activeFile: activeFile || null, recentFiles: recentFiles || [],
    consoleErrors: consoleErrors || [], buildErrors: buildErrors || [],
    selectedCode: selectedCode || null, cursorPosition: cursorPosition || null,
  });

  res.json({
    success: true, response: response.content, provider: response.provider,
    model: response.model, mode: response.mode, edits: response.edits || [],
    timestamp: new Date().toISOString(),
  });
}));

// POST /api/ai/stream — SSE streaming with keep-alive
router.post('/stream', asyncHandler(async (req, res) => {
  const { message, projectFiles, chatHistory, provider, activeFile, recentFiles, consoleErrors, buildErrors, selectedCode, cursorPosition, preferredModel } = req.body;

  if (!message || typeof message !== 'string') {
    res.setHeader('Content-Type', 'text/event-stream');
    sseWrite(res, { type: 'error', error: 'Message is required' });
    return res.end();
  }

  // SSE headers with anti-buffering
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let isClosed = false;
  let chunkCount = 0;
  let fullResponse = '';
  let metadata = {};

  // ✅ Send immediate init event so frontend knows connection is alive
  sseWrite(res, { type: 'init', status: 'connected' });

  // ✅ Keep-alive every 15 seconds
  const keepAliveInterval = setInterval(() => {
    if (isClosed) return;
    try { sseComment(res, `keepalive-${Date.now()}`); }
    catch { cleanup(); }
  }, 15000);

  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    clearInterval(keepAliveInterval);
    req.off('close', onClose);
    req.off('abort', onClose);
  }

  function onClose() {
    console.log('[AI Stream] Client disconnected');
    cleanup();
  }

  req.on('close', onClose);
  req.on('abort', onClose);

  try {
    await handleStream({
      message, projectFiles: projectFiles || {}, chatHistory: chatHistory || [],
      provider: provider || 'openrouter', preferredModel: preferredModel || null,
      activeFile: activeFile || null, recentFiles: recentFiles || [],
      consoleErrors: consoleErrors || [], buildErrors: buildErrors || [],
      selectedCode: selectedCode || null, cursorPosition: cursorPosition || null,
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
      sseWrite(res, { type: 'done', provider: metadata.provider, model: metadata.model, mode: metadata.mode });
    }
  } catch (error) {
    console.error('[AI Stream] Error:', error);
    if (!isClosed) {
      sseWrite(res, { type: 'error', error: error.message, code: error.code || 'STREAM_ERROR' });
    }
  } finally {
    cleanup();
    if (!res.writableEnded) res.end();
  }
}));

// ANALYZE
router.post('/analyze', asyncHandler(async (req, res) => {
  const { projectFiles, provider, activeFile, preferredModel } = req.body;
  if (!projectFiles || Object.keys(projectFiles).length === 0) {
    return res.status(400).json({ success: false, error: 'Project files required' });
  }
  const response = await handleAnalyze({ projectFiles, provider: provider || 'openrouter', preferredModel: preferredModel || null, activeFile: activeFile || null });
  res.json({ success: true, response: response.content, provider: response.provider, model: response.model, mode: 'review', edits: response.edits || [], timestamp: new Date().toISOString() });
}));

// EXPLAIN
router.post('/explain', asyncHandler(async (req, res) => {
  const { projectFiles, filename, provider, activeFile, preferredModel } = req.body;
  if (!filename) return res.status(400).json({ success: false, error: 'Filename required' });
  const response = await handleExplain({ projectFiles: projectFiles || {}, filename, provider: provider || 'openrouter', preferredModel: preferredModel || null, activeFile: activeFile || null });
  res.json({ success: true, response: response.content, provider: response.provider, model: response.model, mode: 'explain', timestamp: new Date().toISOString() });
}));

// MODELS
router.get('/models', asyncHandler(async (req, res) => {
  const models = await getAvailableModels();
  res.json({ success: true, data: models, timestamp: new Date().toISOString() });
}));

export default router;
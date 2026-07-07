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

// ─── ASYNC ERROR WRAPPER ────────────────────────────────────────────
// Catches errors in async route handlers without try/catch in every route
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

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

// ─── ROUTES ─────────────────────────────────────────────────────────

// POST /api/ai/chat — Non-streaming chat with full context
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

// POST /api/ai/stream — Server-Sent Events streaming
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
    return res.status(400).json({
      success: false,
      error: 'Message is required and must be a string',
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullResponse = '';
  let metadata = {};

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
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      },
      onComplete: (result) => {
        metadata = result;
      },
    });

    // Send final metadata
    res.write(`data: ${JSON.stringify({ 
      type: 'done', 
      provider: metadata.provider,
      model: metadata.model,
      mode: metadata.mode,
    })}\n\n`);
    
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}));

// POST /api/ai/analyze — Code review mode
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

// POST /api/ai/explain — Explanation mode for specific file
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

// GET /api/ai/models — Returns available AI models and provider status
router.get('/models', asyncHandler(async (req, res) => {
  const models = await getAvailableModels();
  res.json({
    success: true,
    data: models,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
// backend/routes/aiRoutes.mjs
import express from 'express';
import {
  handleChat,
  handleStream,
  handleAnalyze,
  handleExplain,
} from '../controllers/aiController.mjs';
import { getAvailableModels, testConnection } from '../services/aiService.mjs';

const router = express.Router();

// ─── POST /chat ─────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const result = await handleChat(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AI Route] Chat error:', error.message);
    console.error(error.stack); // log full stack for debugging

    const errorMessage = error.message || 'Unknown error occurred while calling AI.';
    res.status(500).json({
      success: false,
      error: errorMessage,
      data: {
        message: `❌ ${errorMessage}`,
        // Provide a fallback suggestion
        suggestion: 'Check API keys or enable MOCK_AI in backend/.env',
      },
      suggestion: 'Check API keys or enable MOCK_AI in backend/.env',
    });
  }
});

// ─── POST /stream ──────────────────────────────────────────────────
router.post('/stream', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await handleStream({
      ...req.body,
      onChunk: (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      onComplete: (result) => {
        res.write(`data: ${JSON.stringify({ done: true, ...result })}\n\n`);
        res.end();
      },
    });
  } catch (error) {
    console.error('[AI Route] Stream error:', error.message);
    console.error(error.stack);
    const errorMessage = error.message || 'Stream error occurred.';
    // Send error via SSE
    res.write(`data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`);
    res.end();
  }
});

// ─── POST /analyze ──────────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const result = await handleAnalyze(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AI Route] Analyze error:', error.message);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      data: { message: `❌ ${error.message}` },
    });
  }
});

// ─── POST /explain ──────────────────────────────────────────────────
router.post('/explain', async (req, res) => {
  try {
    const result = await handleExplain(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AI Route] Explain error:', error.message);
    console.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      data: { message: `❌ ${error.message}` },
    });
  }
});

// ─── GET /models ────────────────────────────────────────────────────
router.get('/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    res.json({ success: true, data: models });
  } catch (error) {
    console.error('[AI Route] Models error:', error.message);
    console.error(error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /test ──────────────────────────────────────────────────────
router.get('/test', async (req, res) => {
  try {
    const result = await testConnection();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AI Route] Test error:', error.message);
    console.error(error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
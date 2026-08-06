// backend/routes/aiRoutes.mjs
import express from 'express';
import {
  handleChat,
  handleStream,
  handleAnalyze,
  handleExplain,
} from '../controllers/aiController.mjs';

const router = express.Router();

// ─── POST /chat ─────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const result = await handleChat(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AI Route] Chat error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Check API keys or enable MOCK_AI in backend/.env'
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
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /explain ──────────────────────────────────────────────────
router.post('/explain', async (req, res) => {
  try {
    const result = await handleExplain(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[AI Route] Explain error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
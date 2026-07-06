// backend/routes/aiRoutes.mjs
import express from 'express';
import { handleChat, handleStream, handleAnalyze, handleExplain } from '../controllers/aiController.mjs';
import { getAvailableModels } from '../services/aiService.mjs';

const router = express.Router();

// Debug logging middleware for AI routes
router.use((req, res, next) => {
  if (req.method === 'POST' && req.path !== '/stream') {
    console.log(`[AI Route] ${req.method} ${req.path} - Files: ${Object.keys(req.body?.projectFiles || {}).join(', ') || 'none'}`);
  }
  next();
});

router.post('/chat', handleChat);
router.post('/stream', handleStream);
router.post('/analyze', handleAnalyze);
router.post('/explain', handleExplain);

// GET /api/ai/models - Returns available AI models and provider status
router.get('/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    res.json({
      success: true,
      data: models,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching AI models:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: {
        openrouter: { configured: false, freeModels: [], defaultModels: [] },
        groq: { configured: false, models: [] },
        gemini: { configured: false, models: [] },
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
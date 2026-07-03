import express from 'express';
import { handleChat, handleStream, handleAnalyze, handleExplain } from '../controllers/aiController.mjs';

const router = express.Router();

// POST /api/ai/chat - Send a message to AI
router.post('/chat', handleChat);

// POST /api/ai/stream - Stream AI response
router.post('/stream', handleStream);

// POST /api/ai/analyze - Analyze code for errors
router.post('/analyze', handleAnalyze);

// POST /api/ai/explain - Explain code
router.post('/explain', handleExplain);

export default router;

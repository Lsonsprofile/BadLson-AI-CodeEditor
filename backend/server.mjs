// backend/server.mjs
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { testConnection } from './services/aiService.mjs';

import aiRoutes from './routes/aiRoutes.mjs';
import projectRoutes from './routes/projectRoutes.mjs';
import uploadRoutes from './routes/uploadRoutes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5002;

// ─── ENV DEBUG ──────────────────────────────────────────────────────
console.log('=== ENV DEBUG ===');
console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
console.log('GEMINI_API_KEY exists?', !!process.env.GEMINI_API_KEY);
console.log('OPENROUTER_API_KEY exists?', !!process.env.OPENROUTER_API_KEY);
console.log('PORT:', PORT);
console.log('=================');

// ─── CORS ───────────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://badlson-ai-codeeditor.onrender.com';
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

// ─── BODY PARSING ───────────────────────────────────────────────────
// INCREASED LIMIT for full file contents with nested folders
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── HEALTH CHECK ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── DIAGNOSTIC ───────────────────────────────────────────────────
app.get('/api/diagnose', async (req, res) => {
  try {
    const results = await testConnection();

    const anyConfigured = results.openrouter?.status === 'ok' || 
                          results.groq?.status === 'ok' || 
                          results.gemini?.status === 'ok';

    if (!anyConfigured) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'No AI providers configured',
        results,
        setup: 'Set OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in backend/.env'
      });
    }

    res.json({
      status: 'ok',
      results,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// ─── API ROUTES ─────────────────────────────────────────────────────
app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);

// ─── 404 HANDLER ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── ERROR HANDLER ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// ─── START SERVER ───────────────────────────────────────────────────
const server = createServer(app);

server.on('error', (err) => {
  console.error('Server startup error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 AI endpoints:`);
  console.log(`   POST /api/ai/chat    - Chat with code context`);
  console.log(`   POST /api/ai/stream  - Streaming chat`);
  console.log(`   POST /api/ai/analyze - Code analysis`);
  console.log(`   POST /api/ai/explain - Code explanation`);
  console.log(`   GET  /api/ai/models  - Available AI models`);
  console.log(`🔍 Health: GET /api/health`);
  console.log(`🔍 Diagnose: GET /api/diagnose`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    process.exit(0);
  });
});

export default app;
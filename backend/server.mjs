// backend/server.mjs
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { testConnection } from './services/aiService.mjs';
import fs from 'fs';

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
// INCREASED LIMIT for large projects — 45k files can be ~200MB+ of JSON
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

// ─── TIMEOUT & CONNECTION HANDLING (CRITICAL for 46K file uploads) ───
app.use((req, res, next) => {
  // Extend timeout for upload routes — 5 minutes per request
  if (req.path.includes('/upload/')) {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);
  } else {
    req.setTimeout(30000); // 30s default
    res.setTimeout(30000);
  }
  next();
});

// Log warning for very large requests (helps debug 45k file issues)
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 50 * 1024 * 1024) { // 50MB
    console.warn(`⚠️ Large request detected: ${(contentLength / 1024 / 1024).toFixed(1)}MB from ${req.path}`);
    console.warn(`   This may cause memory issues. Consider sending only relevant files.`);
  }
  next();
});

// ─── ENSURE UPLOADS DIRECTORY EXISTS ───────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const EXTRACTED_DIR = path.join(__dirname, 'uploads', 'extracted');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(EXTRACTED_DIR, { recursive: true });

// Static uploads (with cache control)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  etag: false,
}));

// ─── HEALTH CHECK ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
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

// ─── UPLOAD STATUS ENDPOINT (for large upload progress tracking) ───
app.get('/api/upload/status', (req, res) => {
  res.json({
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxBatchSize: 500, // files per batch
    recommendedBatchSize: 500,
    supportsConcurrency: true,
  });
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
  
  // Handle multer-specific errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ 
      error: 'File too large', 
      maxSize: '50MB',
      message: err.message 
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ 
      error: 'Too many files', 
      maxFiles: 500,
      message: err.message 
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ 
      error: 'Unexpected field name', 
      message: 'Use "files" as the field name for uploads' 
    });
  }

  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error',
    path: req.path,
    method: req.method,
  });
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
  console.log(`📁 Upload endpoints:`);
  console.log(`   POST /api/upload/file         - Single file upload`);
  console.log(`   POST /api/upload/zip          - ZIP file extraction`);
  console.log(`   POST /api/upload/folder       - Direct folder upload (≤500 files)`);
  console.log(`   POST /api/upload/folder-batch - Batch folder upload (500 files/batch)`);
  console.log(`   GET  /api/upload/status       - Upload configuration`);
  console.log(`🔍 Health: GET /api/health`);
  console.log(`🔍 Diagnose: GET /api/diagnose`);
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n⚠️ SIGINT received. Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed. Cleaning up...');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ SIGTERM received. Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed gracefully.');
    process.exit(0);
  });
});

// ─── UNCAUGHT EXCEPTION HANDLER ─────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  // Give time for logs to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
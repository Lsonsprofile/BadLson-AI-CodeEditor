// backend/server.mjs
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { testConnection } from './services/aiService.mjs';
import fs from 'fs';

import { verifyAuth } from './middleware/authMiddleware.mjs';
import authRoutes from './routes/authRoutes.mjs';
import aiRoutes from './routes/aiRoutes.mjs';
import projectRoutes from './routes/projectRoutes.mjs';
import uploadRoutes from './routes/uploadRoutes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

// ✅ TRUST RENDER'S PROXY
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5002;

// ─── ENV DEBUG ──────────────────────────────────────────────────────
console.log('=== ENV DEBUG ===');
console.log('JWT_SECRET exists?', !!process.env.JWT_SECRET);
console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
console.log('GEMINI_API_KEY exists?', !!process.env.GEMINI_API_KEY);
console.log('OPENROUTER_API_KEY exists?', !!process.env.OPENROUTER_API_KEY);
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', PORT);
console.log('=================');

// ─── SECURITY HEADERS ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ─── COMPRESSION (skip SSE) ────────────────────────────────────────
app.use(compression({
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// ─── RATE LIMITING ──────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/api/health' || req.path === '/api/auth/login' || req.path === '/api/auth/register',
  validate: { xForwardedForHeader: false },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later.' },
  validate: { xForwardedForHeader: false },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload limit reached, please try again later.' },
  validate: { xForwardedForHeader: false },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  validate: { xForwardedForHeader: false },
});

app.use(globalLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api/auth', authLimiter);

// ─── CORS ───────────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://badlson-ai-codeeditor.onrender.com';
const allowedOrigins = [
  FRONTEND_URL,
  // ✅ Add your actual Render URLs
  'https://badlson-ai-codeeditor.onrender.com',
  'https://badlson-frontend.onrender.com',
  // ✅ Local development
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
].filter(Boolean);

console.log('✅ CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (!allowed) return false;
      // Exact match
      if (origin === allowed) return true;
      // Origin starts with allowed (e.g., https://badlson-ai-codeeditor.onrender.com)
      if (origin.startsWith(allowed)) return true;
      // Allowed starts with origin
      if (allowed.startsWith(origin)) return true;
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    console.warn(`⚠️ CORS blocked request from: ${origin}`);
    callback(new Error(`CORS policy: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ─── BODY PARSING ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── TIMEOUT & CONNECTION HANDLING ──────────────────────────────────
app.use((req, res, next) => {
  if (req.path.includes('/upload/')) {
    req.setTimeout(300000);
    res.setTimeout(300000);
  } else {
    req.setTimeout(30000);
    res.setTimeout(30000);
  }
  next();
});

// Large request warning
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 50 * 1024 * 1024) {
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

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  etag: false,
}));

// ─── HEALTH CHECK (public) ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── AUTH ROUTES (public) ──────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── AI ROUTES (PUBLIC - NO AUTH REQUIRED) ─────────────────────────
// ✅ FIXED: AI should be accessible to everyone
app.use('/api/ai', aiRoutes);

// ─── PROTECTED ROUTES (auth required) ──────────────────────────────
app.use('/api/projects', verifyAuth, projectRoutes);
app.use('/api/upload', verifyAuth, uploadRoutes);

// ─── DIAGNOSTIC (auth required in production) ──────────────────────
app.get('/api/diagnose', verifyAuth, async (req, res) => {
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

// ─── UPLOAD STATUS ENDPOINT ─────────────────────────────────────────
app.get('/api/upload/status', verifyAuth, (req, res) => {
  res.json({
    maxFileSize: 50 * 1024 * 1024,
    maxBatchSize: 500,
    recommendedBatchSize: 500,
    supportsConcurrency: true,
  });
});

// ─── 404 HANDLER ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── ERROR HANDLER ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);

  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS Error',
      message: err.message
    });
  }

  if (err.statusCode === 429) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: err.message
    });
  }

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
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`   Kill the process or change the PORT in .env`);
    process.exit(1);
  }
  console.error('Server startup error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔐 Auth endpoints:`);
  console.log(`   POST /api/auth/register - Register new user`);
  console.log(`   POST /api/auth/login    - Login`);
  console.log(`   GET  /api/auth/me       - Get current user profile (auth required)`);
  console.log(`   POST /api/auth/logout   - Logout`);
  console.log(`📡 AI endpoints (PUBLIC):`);
  console.log(`   POST /api/ai/chat     - Chat with code context`);
  console.log(`   POST /api/ai/stream   - Streaming chat (SSE)`);
  console.log(`   POST /api/ai/analyze  - Code analysis`);
  console.log(`   POST /api/ai/explain  - Code explanation`);
  console.log(`   GET  /api/ai/models   - Available AI models`);
  console.log(`📁 Upload endpoints (AUTH REQUIRED):`);
  console.log(`   POST /api/upload/file         - Single file upload`);
  console.log(`   POST /api/upload/zip          - ZIP file extraction`);
  console.log(`   POST /api/upload/folder       - Direct folder upload`);
  console.log(`   POST /api/upload/folder-batch - Batch folder upload`);
  console.log(`   GET  /api/upload/status       - Upload configuration`);
  console.log(`🔍 Health: GET /api/health (public)`);
  console.log(`🔍 Diagnose: GET /api/diagnose (auth required)`);
  console.log(`📋 Note: AI endpoints are PUBLIC. Uploads require authentication.`);
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️ ${signal} received. Shutting down server...`);
  server.close(() => {
    console.log('✅ Server closed gracefully.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ─── UNCAUGHT EXCEPTION HANDLER ─────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
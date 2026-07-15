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

import aiRoutes from './routes/aiRoutes.mjs';
import projectRoutes from './routes/projectRoutes.mjs';
import uploadRoutes from './routes/uploadRoutes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

// ✅ TRUST RENDER'S PROXY (required for rate-limit + correct client IPs)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5002;

// ─── ENV DEBUG ──────────────────────────────────────────────────────
console.log('=== ENV DEBUG ===');
console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
console.log('GEMINI_API_KEY exists?', !!process.env.GEMINI_API_KEY);
console.log('OPENROUTER_API_KEY exists?', !!process.env.OPENROUTER_API_KEY);
console.log('PORT:', PORT);
console.log('=================');

// ─── SECURITY HEADERS ───────────────────────────────────────────────
app.use(helmet({
 crossOriginResourcePolicy: { policy: 'cross-origin' },
 contentSecurityPolicy: false, // Disable CSP for API server (no HTML)
}));

// ─── COMPRESSION ──────────────────────────────────────────────────
// In server.mjs, replace the compression line with:
app.use(compression({
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// ─── RATE LIMITING ──────────────────────────────────────────────────
const globalLimiter = rateLimit({
 windowMs: 15 * 60 * 1000, // 15 minutes
 max: 500, // 500 requests per 15 min per IP
 standardHeaders: true,
 legacyHeaders: false,
 message: { error: 'Too many requests, please try again later.' },
 skip: (req) => req.path === '/api/health', // Skip health check
 validate: { xForwardedForHeader: false }, // ✅ Fix for Render proxy
});

const aiLimiter = rateLimit({
 windowMs: 15 * 60 * 1000,
 max: 100,
 standardHeaders: true,
 legacyHeaders: false,
 message: { error: 'Too many AI requests, please try again later.' },
 validate: { xForwardedForHeader: false }, // ✅ Fix for Render proxy
});

const uploadLimiter = rateLimit({
 windowMs: 60 * 60 * 1000, // 1 hour
 max: 50, // 50 uploads per hour per IP
 standardHeaders: true,
 legacyHeaders: false,
 message: { error: 'Upload limit reached, please try again later.' },
 validate: { xForwardedForHeader: false }, // ✅ Fix for Render proxy
});

app.use(globalLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/upload', uploadLimiter);

// ─── CORS ───────────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://badlson-ai-codeeditor.onrender.com';
const allowedOrigins = [
 FRONTEND_URL,
 'http://localhost:5173',
 'http://localhost:3000',
 'http://127.0.0.1:5173',
 'http://127.0.0.1:3000',
].filter(Boolean); // Remove undefined/null

app.use(cors({
 origin: (origin, callback) => {
   // Allow requests with no origin (mobile apps, curl, Postman)
   if (!origin) return callback(null, true);
   if (allowedOrigins.includes(origin)) {
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
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

// ─── TIMEOUT & CONNECTION HANDLING ──────────────────────────────────
app.use((req, res, next) => {
 if (req.path.includes('/upload/')) {
   req.setTimeout(300000); // 5 minutes for uploads
   res.setTimeout(300000);
 } else {
   req.setTimeout(30000); // 30s default
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
   environment: process.env.NODE_ENV || 'development',
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

// ─── UPLOAD STATUS ENDPOINT ─────────────────────────────────────────
app.get('/api/upload/status', (req, res) => {
 res.json({
   maxFileSize: 50 * 1024 * 1024, // 50MB
   maxBatchSize: 500,
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
 
 // Handle CORS errors
 if (err.message && err.message.includes('CORS')) {
   return res.status(403).json({ 
     error: 'CORS Error', 
     message: err.message 
   });
 }

 // Handle rate limit errors
 if (err.statusCode === 429) {
   return res.status(429).json({ 
     error: 'Rate limit exceeded', 
     message: err.message 
   });
 }

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
 if (err.code === 'EADDRINUSE') {
   console.error(`❌ Port ${PORT} is already in use.`);
   console.error(`   Kill the process or change the PORT in .env`);
   process.exit(1);
 }
 console.error('Server startup error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
 console.log(`🚀 Server running on port ${PORT}`);
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
const gracefulShutdown = (signal) => {
 console.log(`\n⚠️ ${signal} received. Shutting down server...`);
 server.close(() => {
   console.log('✅ Server closed gracefully.');
   process.exit(0);
 });
 
 // Force shutdown after 10s if graceful fails
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
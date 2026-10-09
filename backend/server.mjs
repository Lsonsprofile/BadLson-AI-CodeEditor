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

// TRUST RENDER'S PROXY
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5002;

console.log('=== ENV DEBUG ===');
console.log('JWT_SECRET exists?', !!process.env.JWT_SECRET);
console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
console.log('GEMINI_API_KEY exists?', !!process.env.GEMINI_API_KEY);
console.log('OPENROUTER_API_KEY exists?', !!process.env.OPENROUTER_API_KEY);
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', PORT);
console.log('=================');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(compression({
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// CORS early
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://badlson-ai-codeeditor.onrender.com';
const allowedOrigins = [
  FRONTEND_URL,
  'https://badlson-ai-codeeditor.onrender.com',
  'https://badlson-frontend.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
].filter(Boolean);

console.log('CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowed) => {
      if (!allowed) return false;
      if (origin === allowed) return true;
      if (origin.startsWith(allowed)) return true;
      if (allowed.startsWith(origin)) return true;
      return false;
    });

    if (isAllowed) return callback(null, true);

    if ((process.env.NODE_ENV || 'development') !== 'production') {
      console.log(`CORS allowing dev origin: ${origin}`);
      return callback(null, true);
    }

    console.warn(`CORS blocked request from: ${origin}`);
    callback(new Error(`CORS policy: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) =>
    req.path === '/api/health' ||
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/register',
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
  message: { error: 'Too many uploads, please try again later.' },
  validate: { xForwardedForHeader: false },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
  validate: { xForwardedForHeader: false },
});

app.use(globalLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api/auth', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/projects', verifyAuth, projectRoutes);
app.use('/api/upload', verifyAuth, uploadRoutes);

app.get('/api/diagnose', verifyAuth, async (req, res) => {
  try {
    const ai = await testConnection();
    res.json({ ok: true, ai });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'CORS Error', message: err.message });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const server = createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Kill the process or change PORT in backend/.env');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: GET http://localhost:${PORT}/api/health`);
  console.log(`AI chat: POST http://localhost:${PORT}/api/ai/chat`);
});

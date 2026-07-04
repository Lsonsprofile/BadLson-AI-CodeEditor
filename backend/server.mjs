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

console.log('=== ENV DEBUG ===');
console.log('GROQ_API_KEY exists?', !!process.env.GROQ_API_KEY);
console.log('PORT:', process.env.PORT);
console.log('=================');

const app = express();
const PORT = process.env.PORT || 5002;

// CORS: allow frontend origins
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://badlson-ai-codeeditor.onrender.com';
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check (Render uses this)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Diagnostic endpoint
app.get('/api/diagnose', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'GROQ_API_KEY not set in environment',
        keyPresent: false,
        setup: 'Get a free API key at https://console.groq.com/keys'
      });
    }

    const result = await testConnection();

    res.json({
      status: 'ok',
      keyPresent: true,
      keyPrefix: apiKey.substring(0, 10) + '...',
      keyLength: apiKey.length,
      ...result,
      nodeVersion: process.version,
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// API routes
app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const server = createServer(app);

server.on('error', (err) => {
  console.error('Server startup error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    process.exit(0);
  });
});

export default app;
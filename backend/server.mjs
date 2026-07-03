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

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== DIAGNOSTIC ENDPOINT =====
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
// ===== END DIAGNOSTIC ENDPOINT =====

app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const server = createServer(app);

server.on('error', (err) => {
  console.error('Server startup error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🤖 AI Endpoint: http://localhost:${PORT}/api/ai`);
  console.log(`📁 Projects Endpoint: http://localhost:${PORT}/api/projects`);
  console.log(`📤 Upload Endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`🔍 Diagnostic: http://localhost:${PORT}/api/diagnose\n`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    process.exit(0);
  });
});

export default app;
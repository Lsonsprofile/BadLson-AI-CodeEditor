// backend/routes/uploadRoutes.mjs
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  uploadFile,
  uploadZip,
  uploadFolder,
  uploadFolderBatch,
} from '../controllers/uploadController.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(__dirname, '../uploads/');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/html',
      'text/css',
      'application/javascript',
      'text/javascript',
      'application/json',
      'application/x-typescript',
      'application/zip',
      'application/x-zip-compressed',
      'image/',
    ];
    const isAllowed = allowedTypes.some((type) => file.mimetype.startsWith(type));
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ─── Single file upload ───────────────────────────────────────────
router.post('/file', upload.single('file'), uploadFile);

// ─── ZIP upload ───────────────────────────────────────────────────
router.post('/zip', upload.single('zip'), uploadZip);

// ─── Direct folder upload (≤500 files) ────────────────────────────
router.post('/folder', upload.array('files', 500), uploadFolder);

// ─── Batch upload — 500 files per request ─────────────────────────
router.post('/folder-batch', upload.array('files', 500), uploadFolderBatch);

export default router;
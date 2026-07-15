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

// ─── ASYNC ERROR WRAPPER ────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(__dirname, '../uploads/');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const allowedExtensions = [
  '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.json',
  '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.rb',
  '.php', '.swift', '.kt', '.scala', '.r', '.m', '.mm',
  '.sql', '.yaml', '.yml', '.xml', '.toml', '.ini', '.env',
  '.md', '.txt', '.log', '.svg', '.zip',
];

const allowedMimes = [
  'text/', 'application/javascript', 'application/json',
  'application/zip', 'application/x-zip-compressed',
  'image/',
];

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
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = allowedExtensions.includes(ext);
    const isAllowedMime = allowedMimes.some(type => file.mimetype.startsWith(type));
    
    if (isAllowedExt || isAllowedMime) {
      cb(null, true);
    } else {
      console.warn(`Rejected upload: ${file.originalname} (${file.mimetype})`);
      cb(new Error(`File type not allowed: ${file.mimetype} (${file.originalname})`));
    }
  },
});

// ─── Single file upload ───────────────────────────────────────────
router.post('/file', upload.single('file'), asyncHandler(uploadFile));

// ─── ZIP upload ───────────────────────────────────────────────────
router.post('/zip', upload.single('zip'), asyncHandler(uploadZip));

// ─── Direct folder upload (≤500 files) ────────────────────────────
router.post('/folder', upload.array('files', 500), asyncHandler(uploadFolder));

// ─── Batch upload — 500 files per request ─────────────────────────
router.post('/folder-batch', upload.array('files', 500), asyncHandler(uploadFolderBatch));

export default router;
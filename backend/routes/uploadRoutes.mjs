// backend/routes/uploadRoutes.mjs
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadFile, uploadZip, uploadFolder } from '../controllers/uploadController.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024,
    files: 100000
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/html',
      'text/css',
      'application/javascript',
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

router.post('/file', upload.single('file'), uploadFile);
router.post('/zip', upload.single('zip'), uploadZip);
router.post('/folder', upload.array('files', 0), uploadFolder);

export default router;
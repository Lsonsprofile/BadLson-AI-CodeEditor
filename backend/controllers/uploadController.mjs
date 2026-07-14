// backend/controllers/uploadController.mjs
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

// ─── Helper: cleanup temp files ───────────────────────────────────
function cleanupFiles(filePaths) {
  for (const p of filePaths) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

export async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileData = {
      filename: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
    };

    if (req.file.mimetype.startsWith('text/') || req.file.mimetype === 'application/javascript') {
      fileData.content = fs.readFileSync(req.file.path, 'utf-8');
    }

    cleanupFiles([req.file.path]);

    res.json({ success: true, file: fileData });
  } catch (error) {
    if (req.file?.path) cleanupFiles([req.file.path]);
    res.status(500).json({ error: error.message });
  }
}

export async function uploadZip(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No ZIP file uploaded' });
    }

    const extractPath = path.join(process.cwd(), 'backend/uploads/extracted', Date.now().toString());
    fs.mkdirSync(extractPath, { recursive: true });

    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(extractPath, true);

    const files = readDirectoryRecursive(extractPath);

    fs.rmSync(extractPath, { recursive: true, force: true });
    cleanupFiles([req.file.path]);

    res.json({ success: true, message: 'ZIP extracted successfully', files, count: Object.keys(files).length });
  } catch (error) {
    if (req.file?.path) cleanupFiles([req.file.path]);
    res.status(500).json({ error: error.message });
  }
}

export async function uploadFolder(req, res) {
  const tempPaths = [];
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log(`[Upload] Uploading ${req.files.length} files...`);
    
    const files = req.files.map((file) => {
      tempPaths.push(file.path);
      const fileData = {
        filename: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
      };

      if (file.mimetype.startsWith('text/') || file.mimetype === 'application/javascript') {
        try {
          fileData.content = fs.readFileSync(file.path, 'utf-8');
        } catch (err) {
          fileData.content = null;
        }
      }

      return fileData;
    });

    cleanupFiles(tempPaths);

    console.log(`[Upload] Uploaded ${files.length} files`);

    res.json({ 
      success: true, 
      files, 
      count: files.length,
      message: `Successfully uploaded ${files.length} files`
    });
  } catch (error) {
    cleanupFiles(tempPaths);
    console.error('[Upload] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function uploadFolderBatch(req, res) {
  const tempPaths = [];
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const batchNumber = parseInt(req.body.batchNumber) || 1;
    const totalBatches = parseInt(req.body.totalBatches) || 1;

    console.log(`[Upload] Batch ${batchNumber}/${totalBatches} – ${req.files.length} files`);

    const files = req.files.map((file) => {
      tempPaths.push(file.path);
      const fileData = {
        filename: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
      };

      const isTextLike = 
        file.mimetype.startsWith('text/') ||
        file.mimetype === 'application/javascript' ||
        file.mimetype === 'text/javascript' ||
        file.mimetype === 'application/json' ||
        file.mimetype === 'application/x-typescript';

      if (isTextLike) {
        try {
          fileData.content = fs.readFileSync(file.path, 'utf-8');
        } catch (err) {
          fileData.content = null;
        }
      }

      return fileData;
    });

    cleanupFiles(tempPaths);

    res.json({
      success: true,
      files,
      count: files.length,
      batchNumber,
      totalBatches,
    });
  } catch (error) {
    cleanupFiles(tempPaths);
    console.error('[Upload] Batch error:', error);
    res.status(500).json({ error: error.message });
  }
}

function readDirectoryRecursive(dir, baseDir = dir) {
  const result = {};
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      const subFiles = readDirectoryRecursive(fullPath, baseDir);
      Object.assign(result, subFiles);
    } else {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        result[relativePath] = content;
      } catch {
        result[relativePath] = null;
      }
    }
  }

  return result;
}
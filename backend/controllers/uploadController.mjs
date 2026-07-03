import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

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

    res.json({ success: true, file: fileData });
  } catch (error) {
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

    res.json({ success: true, message: 'ZIP extracted successfully', files, extractPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function uploadFolder(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files.map((file) => {
      const fileData = {
        filename: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
      };

      if (file.mimetype.startsWith('text/') || file.mimetype === 'application/javascript') {
        fileData.content = fs.readFileSync(file.path, 'utf-8');
      }

      return fileData;
    });

    res.json({ success: true, files, count: files.length });
  } catch (error) {
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

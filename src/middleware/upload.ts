import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { ensureDir } from '../utils/fs.js';

const allowedExtensions = new Set(['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.flac', '.opus']);
const allowedMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
  'audio/opus',
  'application/octet-stream'
]);

const allowedDocumentExtensions = new Set(['.docx', '.txt', '.md']);
const allowedDocumentMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/octet-stream'
]);

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await ensureDir(config.uploadDir);
      cb(null, config.uploadDir);
    } catch (error) {
      cb(error as Error, config.uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.audio';
    const safeBaseName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${safeBaseName || 'audio'}${extension}`);
  }
});

export const audioUpload = multer({
  storage,
  limits: {
    fileSize: config.maxAudioFileMb * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Unsupported audio format. Allowed: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, opus.'));
      return;
    }
    cb(null, true);
  }
});

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedDocumentExtensions.has(extension) || !allowedDocumentMimeTypes.has(file.mimetype)) {
      cb(new Error('Unsupported document format. Allowed: docx, txt, md.'));
      return;
    }
    cb(null, true);
  }
});

import multer from 'multer';
import { env } from '../config/env.js';

/** Single-file, in-memory upload (bytes are validated and re-encoded before touching disk). */
export const singleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(env.UPLOAD_MAX_IMAGE_MB, env.UPLOAD_MAX_DOCUMENT_MB) * 1024 * 1024,
    files: 1,
    fields: 5,
    parts: 6,
  },
}).single('file');

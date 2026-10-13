import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import { badRequest } from '../core/errors.js';
import { logger } from '../core/logger.js';

/**
 * The only module that reads or writes uploaded files on disk.
 * Pipeline: sniff real type → enforce limits → (images) auto-rotate, strip metadata, resize,
 * convert to WebP → write under a random name → return storage info. Callers persist metadata.
 */

sharp.cache(false);
sharp.concurrency(2);

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const PDF_TYPE = 'application/pdf';
const MB = 1024 * 1024;

export async function ensureStorageDirs() {
  await fs.mkdir(env.PUBLIC_UPLOAD_DIR, { recursive: true });
  await fs.mkdir(env.PRIVATE_UPLOAD_DIR, { recursive: true, mode: 0o750 });
}

const rootFor = (visibility) => (visibility === 'public' ? env.PUBLIC_UPLOAD_DIR : env.PRIVATE_UPLOAD_DIR);

function resolveKey(visibility, key) {
  const root = rootFor(visibility);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Storage key escapes its root');
  return full;
}

export const publicUrl = (key) => `${env.PUBLIC_MEDIA_BASE_URL}/${key}`;

/**
 * Validates and processes an uploaded buffer.
 * @returns {{ buffer, mimeType, ext, width?, height? }}
 */
export async function processUpload(buffer, { kinds }) {
  if (!buffer?.length) throw badRequest('The file is empty.', undefined, 'UPLOAD_EMPTY');
  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime;

  if (mime && IMAGE_TYPES.has(mime) && kinds.includes('image')) {
    if (buffer.length > env.UPLOAD_MAX_IMAGE_MB * MB) throw badRequest(`Images must be under ${env.UPLOAD_MAX_IMAGE_MB} MB.`, undefined, 'UPLOAD_TOO_LARGE');
    try {
      const img = sharp(buffer, { limitInputPixels: env.UPLOAD_MAX_INPUT_PIXELS, failOn: 'error' });
      const meta = await img.metadata();
      if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200)
        throw badRequest('Image is too small. Use a photo at least 200×200 pixels.', undefined, 'UPLOAD_TOO_SMALL');
      const { data, info } = await img
        .rotate() // apply EXIF orientation before metadata is stripped
        .resize({ width: env.IMAGE_MAX_DIMENSION, height: env.IMAGE_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: env.IMAGE_WEBP_QUALITY, effort: 4 })
        .toBuffer({ resolveWithObject: true }); // sharp drops EXIF/GPS/ICC unless withMetadata() is called
      return { buffer: data, mimeType: 'image/webp', ext: 'webp', width: info.width, height: info.height };
    } catch (err) {
      if (err.expose) throw err;
      throw badRequest('This image could not be processed. Try a different photo.', undefined, 'UPLOAD_INVALID_IMAGE');
    }
  }

  if (mime === PDF_TYPE && kinds.includes('pdf')) {
    if (buffer.length > env.UPLOAD_MAX_DOCUMENT_MB * MB) throw badRequest(`Documents must be under ${env.UPLOAD_MAX_DOCUMENT_MB} MB.`, undefined, 'UPLOAD_TOO_LARGE');
    return { buffer, mimeType: PDF_TYPE, ext: 'pdf' }; // stored unmodified; served only through authorised download
  }

  const allowed = kinds.map((k) => (k === 'image' ? 'JPG, PNG, WebP' : 'PDF')).join(' or ');
  throw badRequest(`Unsupported file. Upload ${allowed}.`, undefined, 'UPLOAD_UNSUPPORTED_TYPE');
}

/** Writes processed bytes under a random, non-guessable name. Returns { key, sha256 }. */
export async function writeFile(visibility, folder, { buffer, ext }) {
  const now = new Date();
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  const key = path.posix.join(folder, String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), name);
  const full = resolveKey(visibility, key);
  await fs.mkdir(path.dirname(full), { recursive: true, mode: visibility === 'private' ? 0o750 : 0o755 });
  await fs.writeFile(full, buffer, { mode: visibility === 'private' ? 0o640 : 0o644, flag: 'wx' });
  return { key, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function deleteFile(visibility, key) {
  try {
    await fs.unlink(resolveKey(visibility, key));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.error({ err, key }, 'failed to delete stored file');
  }
}

export const absolutePath = (visibility, key) => resolveKey(visibility, key);

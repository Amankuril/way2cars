import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { created } from '../../core/http.js';
import { badRequest, unauthorized } from '../../core/errors.js';
import { singleUpload } from '../../middleware/upload.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { authenticate } from '../../middleware/auth.js';
import { absolutePath } from '../../integrations/storage.js';
import { storeUpload, getReadableFile } from './files.service.js';

const PURPOSES_BY_REALM = {
  user: ['avatar', 'kyc_document', 'kyc_selfie', 'inspection_photo', 'damage_photo', 'ticket_attachment'],
  vendor: ['avatar', 'vehicle_photo', 'vehicle_document', 'kyc_document', 'kyc_selfie', 'bank_proof', 'inspection_photo', 'damage_photo', 'ticket_attachment'],
  admin: ['banner', 'brand_logo', 'category_image', 'city_image', 'vehicle_photo', 'ticket_attachment'],
};

/** POST /{realm}/uploads  multipart: file=<binary>, purpose=<purpose> */
export function uploadRoutes(realm) {
  const r = Router();
  r.post('/', uploadLimiter, singleUpload, async (req, res) => {
    const purpose = z.enum(PURPOSES_BY_REALM[realm]).safeParse(req.body?.purpose);
    if (!purpose.success) throw badRequest('Choose a valid upload purpose.', undefined, 'UPLOAD_PURPOSE_INVALID');
    if (!req.file) throw badRequest('Attach a file in the "file" field.', undefined, 'UPLOAD_MISSING');
    created(res, await storeUpload(req.auth, purpose.data, req.file));
  });
  return r;
}

/** Accepts an access token from any realm; the realm is read from the token then verified. */
async function anyRealm(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  const realm = jwt.decode(token)?.realm;
  if (!['user', 'vendor', 'admin'].includes(realm)) return next(unauthorized());
  return authenticate(realm)(req, res, next);
}

export const filesRouter = Router();
filesRouter.get('/:id', anyRealm, async (req, res) => {
  const file = await getReadableFile(req.auth, req.params.id);
  res.set({
    'Content-Type': file.mimeType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${file.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename="${file._id}.${file.mimeType === 'application/pdf' ? 'pdf' : 'webp'}"`,
  });
  if (file.visibility === 'public') return res.redirect(302, `${env.PUBLIC_MEDIA_BASE_URL}/${file.storageKey}`);
  if (env.PRIVATE_FILE_DELIVERY === 'x-accel') {
    res.set('X-Accel-Redirect', `${env.PRIVATE_X_ACCEL_PREFIX}/${file.storageKey}`);
    return res.end();
  }
  const stream = fs.createReadStream(absolutePath('private', file.storageKey));
  stream.on('error', () => (res.headersSent ? res.destroy() : res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found.' } })));
  stream.pipe(res);
});

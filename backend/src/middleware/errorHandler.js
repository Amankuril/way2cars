import multer from 'multer';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { getSettings } from '../modules/settings/settings.service.js';

// Renter-facing booking paths: their 400/403/409/410 errors (wrong timings, car taken, too late to
// extend…) carry the support number so the renter can call instead of getting stuck.
const BOOKING_PATH = /^\/api\/v1\/(user\/bookings|public\/vehicles)/;
const SUPPORT_STATUSES = new Set([400, 403, 409, 410]);

async function supportPhoneFor(req, status) {
  if (!SUPPORT_STATUSES.has(status) || !BOOKING_PATH.test(req.originalUrl || '')) return null;
  try {
    const { support } = await getSettings();
    return support.phone || support.whatsapp || null;
  } catch {
    return null;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Endpoint not found.', requestId: req.id } });
}

// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let code = err.code && typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR';
  let message = err.expose ? err.message : 'Something went wrong. Please try again.';
  let details = err.expose ? err.details : undefined;

  if (err instanceof multer.MulterError) {
    status = 413;
    code = 'UPLOAD_REJECTED';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : 'Upload rejected.';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    code = 'VALIDATION_FAILED';
    message = 'Some fields are invalid.';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Invalid identifier or value.';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_JSON';
    message = 'Malformed JSON body.';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large.';
  } else if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'This record already exists.';
  }
  if (status >= 500) {
    logger.error({ err, requestId: req.id, path: req.path }, 'unhandled error');
    if (!err.expose) {
      code = 'INTERNAL_ERROR';
      message = 'Something went wrong. Please try again.';
    }
  }
  if (res.headersSent) return;
  const supportPhone = err.expose ? await supportPhoneFor(req, status) : null;
  if (supportPhone) message = `${message} Need help? Call us on ${supportPhone}.`;
  const body = { success: false, error: { code, message, requestId: req.id } };
  if (supportPhone) body.error.support = { phone: supportPhone };
  if (details) body.error.details = details;
  if (!env.isProd && status >= 500 && !err.expose) body.error.debug = err.message;
  if (err.details?.retryAfterSeconds) res.set('Retry-After', String(err.details.retryAfterSeconds));
  res.status(status).json(body);
}

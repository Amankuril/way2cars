import { badRequest } from '../core/errors.js';

const MAX_DEPTH = 8;

function hasOperatorKey(value, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKey(v, depth + 1));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor') return true;
      if (hasOperatorKey(v, depth + 1)) return true;
    }
  }
  return false;
}

/** Rejects request bodies/params containing Mongo operator keys, dotted paths or prototype keys. */
export function rejectOperatorKeys(req, _res, next) {
  if (hasOperatorKey(req.body) || hasOperatorKey(req.query)) return next(badRequest('Invalid request payload.', undefined, 'INVALID_PAYLOAD'));
  next();
}

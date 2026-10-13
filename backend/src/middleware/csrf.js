import { env } from '../config/env.js';
import { forbidden } from '../core/errors.js';

/**
 * Cookie-authenticated endpoints (refresh/logout) require a custom header, which browsers cannot
 * send cross-site without a CORS preflight, and an allowed Origin when one is present.
 */
export function requireClientHeader(req, _res, next) {
  if (!req.get('x-w2c-client')) return next(forbidden('Missing client header.', 'CSRF_REJECTED'));
  const origin = req.get('origin');
  if (origin && !env.CORS_ORIGINS.includes(origin)) return next(forbidden('Origin not allowed.', 'CSRF_REJECTED'));
  next();
}

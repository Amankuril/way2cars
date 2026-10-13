import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Coarse in-process limits (per instance). Business-critical limits — OTP sends, OTP attempts,
 * admin lockout — are enforced durably in MongoDB by their services, not here.
 */
const handler = (_req, res, _next, options) =>
  res.status(options.statusCode).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
  });

const base = { standardHeaders: 'draft-7', legacyHeaders: false, handler, skip: () => env.isTest };

export const apiLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000, limit: env.RATE_LIMIT_MAX });
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: env.RATE_LIMIT_AUTH_MAX });
export const uploadLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: 120 });

import pino from 'pino';
import { env } from '../config/env.js';

// Secrets, OTPs, tokens and identity numbers must never reach the logs.
const redact = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.otp',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.accountNumber',
  '*.apiKey',
  '*.secret',
];

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: redact, censor: '[redacted]' },
  base: { service: 'way2cars-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
});

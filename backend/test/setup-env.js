import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { inject } from 'vitest';

// Must run before any src/ import: config/env.js is evaluated once at import time.
const tmp = path.join(os.tmpdir(), `w2c-test-${process.pid}`);
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
  OTP_HMAC_SECRET: 'test-otp-secret-0123456789abcdef0123456789abc',
  DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  COOKIE_SECURE: 'false',
  APP_PUBLIC_URL: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
  OTP_BYPASS_ENABLED: process.env.TEST_OTP_BYPASS ?? 'false',
  OTP_DUMMY_NUMBERS: '+91 98765 43210,9123456780',
  OTP_RESEND_COOLDOWN_SECONDS: '10',
  PUBLIC_UPLOAD_DIR: path.join(tmp, 'public'),
  PRIVATE_UPLOAD_DIR: path.join(tmp, 'private'),
  PUBLIC_MEDIA_BASE_URL: 'http://localhost:4000/uploads',
  JOBS_ENABLED: 'false',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret',
  RAZORPAY_WEBHOOK_SECRET: 'rzp_webhook_secret',
});
const base = inject('mongoUri');
const db = `w2c_${crypto.randomBytes(4).toString('hex')}`;
const u = new URL(base);
u.pathname = `/${db}`;
process.env.MONGODB_URI = u.toString();

import path from 'node:path';
import { z } from 'zod';

/**
 * Single source of runtime configuration. Parsed once at startup; the process exits
 * with a readable report when anything required is missing or malformed.
 */

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(v)));
const int = (def, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z.coerce.number().int().min(min).max(max).default(def);
const optStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: int(4000, { min: 1, max: 65535 }),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY: z.string().default('loopback'),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: csv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/way2cars?replicaSet=rs0'),

  JWT_ACCESS_SECRET: optStr,
  JWT_ACCESS_TTL_SECONDS: int(900, { min: 60, max: 3600 }),
  USER_REFRESH_TTL_DAYS: int(30, { min: 1, max: 180 }),
  ADMIN_REFRESH_TTL_HOURS: int(12, { min: 1, max: 72 }),
  COOKIE_SECURE: bool(true),
  OTP_HMAC_SECRET: optStr,
  DATA_ENCRYPTION_KEY: optStr, // base64, 32 bytes — encrypts bank account numbers & MFA secrets

  OTP_BYPASS_ENABLED: bool(false),
  OTP_DUMMY_NUMBERS: csv,
  OTP_LENGTH: int(6, { min: 6, max: 6 }), // apps and API accept exactly 6 digits
  OTP_TTL_SECONDS: int(300, { min: 60, max: 900 }),
  OTP_MAX_ATTEMPTS: int(5, { min: 1, max: 10 }),
  OTP_RESEND_COOLDOWN_SECONDS: int(30, { min: 10, max: 300 }),
  OTP_MAX_PER_PHONE_PER_HOUR: int(5, { min: 1, max: 50 }),
  OTP_MAX_PER_IP_PER_HOUR: int(30, { min: 1, max: 1000 }),

  ADMIN_MAX_FAILED_LOGINS: int(5, { min: 3, max: 20 }),
  ADMIN_LOCKOUT_MINUTES: int(15, { min: 1, max: 1440 }),
  ADMIN_REQUIRE_MFA: bool(false),

  SMS_ENABLED: bool(false),
  SMSINDIAHUB_API_URL: z.string().url().default('https://cloud.smsindiahub.in/api/mt/SendSMS'),
  SMSINDIAHUB_DELIVERY_URL: z.string().url().default('https://cloud.smsindiahub.in/api/mt/GetDelivery'),
  SMSINDIAHUB_API_KEY: optStr,
  SMSINDIAHUB_SENDER_ID: optStr,
  SMSINDIAHUB_ROUTE: z.string().default('1'),
  SMSINDIAHUB_CHANNEL: z.string().default('2'),
  SMSINDIAHUB_PEID: optStr,
  SMSINDIAHUB_TIMEOUT_MS: int(8000, { min: 1000, max: 30000 }),
  SMS_TEMPLATE_OTP: optStr,
  SMS_TEMPLATE_BOOKING_CONFIRMED: optStr,
  SMS_TEMPLATE_PAYMENT: optStr,
  SMS_TEMPLATE_REMINDER: optStr,
  SMS_TEMPLATE_VENDOR_BOOKING: optStr,
  SMS_TEMPLATE_GENERIC: optStr,

  RAZORPAY_KEY_ID: optStr,
  RAZORPAY_KEY_SECRET: optStr,
  RAZORPAY_WEBHOOK_SECRET: optStr,

  GOOGLE_MAPS_SERVER_KEY: optStr,
  GOOGLE_MAPS_BROWSER_KEY: optStr,
  MAPS_CACHE_TTL_SECONDS: int(86400, { min: 60 }),

  FIREBASE_SERVICE_ACCOUNT_FILE: optStr,
  FIREBASE_SERVICE_ACCOUNT_BASE64: optStr,
  FIREBASE_WEB_CONFIG_JSON: optStr, // public web config (apiKey, projectId, messagingSenderId, appId)
  FIREBASE_WEB_VAPID_KEY: optStr,

  SMTP_HOST: optStr,
  SMTP_PORT: int(587, { min: 1, max: 65535 }),
  SMTP_SECURE: bool(false),
  SMTP_USER: optStr,
  SMTP_PASS: optStr,
  EMAIL_FROM: z.string().default('WAY2CARS <no-reply@way2cars.in>'),

  PUBLIC_UPLOAD_DIR: z.string().default('./storage/public'),
  PRIVATE_UPLOAD_DIR: z.string().default('./storage/private'),
  PUBLIC_MEDIA_BASE_URL: z.string().default('http://localhost:4000/uploads'),
  SERVE_PUBLIC_UPLOADS: bool(true), // dev convenience; Nginx serves /uploads in production
  PRIVATE_FILE_DELIVERY: z.enum(['stream', 'x-accel']).default('stream'),
  PRIVATE_X_ACCEL_PREFIX: z.string().default('/_protected'),
  UPLOAD_MAX_IMAGE_MB: int(10, { min: 1, max: 50 }),
  UPLOAD_MAX_DOCUMENT_MB: int(10, { min: 1, max: 50 }),
  UPLOAD_MAX_INPUT_PIXELS: int(40_000_000, { min: 1_000_000 }),
  IMAGE_MAX_DIMENSION: int(2000, { min: 320, max: 8000 }),
  IMAGE_WEBP_QUALITY: int(80, { min: 40, max: 100 }),

  RATE_LIMIT_WINDOW_SECONDS: int(60, { min: 1 }),
  RATE_LIMIT_MAX: int(300, { min: 10 }),
  RATE_LIMIT_AUTH_MAX: int(20, { min: 3 }),

  JOBS_ENABLED: bool(true),
  TRACKING_PROVIDER: z.enum(['none', 'generic-webhook']).default('none'),
  TRACKING_WEBHOOK_SECRET: optStr,
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production' || e.NODE_ENV === 'staging';
  const problems = [];

  const devSecret = (name) => {
    if (e[name]) return e[name];
    if (isProd) problems.push(`${name} is required in ${e.NODE_ENV}`);
    return `dev-only-${name}-do-not-use-in-production`;
  };
  e.JWT_ACCESS_SECRET = devSecret('JWT_ACCESS_SECRET');
  e.OTP_HMAC_SECRET = devSecret('OTP_HMAC_SECRET');
  if (e.JWT_ACCESS_SECRET.length < 32) problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  if (e.OTP_HMAC_SECRET.length < 32) problems.push('OTP_HMAC_SECRET must be at least 32 characters');

  if (e.DATA_ENCRYPTION_KEY) {
    if (Buffer.from(e.DATA_ENCRYPTION_KEY, 'base64').length !== 32)
      problems.push('DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  } else if (isProd) {
    problems.push('DATA_ENCRYPTION_KEY is required in production');
  } else {
    e.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  }

  if (isProd) {
    if (!e.CORS_ORIGINS.length) problems.push('CORS_ORIGINS is required in production');
    if (!e.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production');
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET || !e.RAZORPAY_WEBHOOK_SECRET)
      problems.push('RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required in production');
    if (!e.OTP_BYPASS_ENABLED && (!e.SMS_ENABLED || !e.SMSINDIAHUB_API_KEY || !e.SMSINDIAHUB_SENDER_ID))
      problems.push('SMS_ENABLED, SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID are required for live OTP delivery');
    const pub = path.resolve(e.PUBLIC_UPLOAD_DIR);
    const priv = path.resolve(e.PRIVATE_UPLOAD_DIR);
    if (priv.startsWith(pub + path.sep) || priv === pub)
      problems.push('PRIVATE_UPLOAD_DIR must not be inside PUBLIC_UPLOAD_DIR');
  }
  if (e.SMS_ENABLED && (!e.SMSINDIAHUB_API_KEY || !e.SMSINDIAHUB_SENDER_ID))
    problems.push('SMS_ENABLED=true requires SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID');
  if (e.TRACKING_PROVIDER !== 'none' && !e.TRACKING_WEBHOOK_SECRET)
    problems.push('TRACKING_WEBHOOK_SECRET is required when TRACKING_PROVIDER is set');

  if (problems.length) throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);

  e.isProd = isProd;
  e.isTest = e.NODE_ENV === 'test';
  e.PUBLIC_UPLOAD_DIR = path.resolve(e.PUBLIC_UPLOAD_DIR);
  e.PRIVATE_UPLOAD_DIR = path.resolve(e.PRIVATE_UPLOAD_DIR);
  e.PUBLIC_MEDIA_BASE_URL = e.PUBLIC_MEDIA_BASE_URL.replace(/\/+$/, '');
  if (!e.CORS_ORIGINS.length) e.CORS_ORIGINS = [new URL(e.APP_PUBLIC_URL).origin];
  return Object.freeze(e);
}

export const env = load();

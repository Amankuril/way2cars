import fs from 'node:fs';
import admin from 'firebase-admin';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

/**
 * Firebase Cloud Messaging — the ONLY module that talks to FCM. Disabled cleanly (no throw)
 * when no service account is configured. Returns tokens that FCM reported as dead so callers
 * can prune them.
 */
let app;
let initFailed = false;

function messaging() {
  if (app) return admin.messaging(app);
  if (initFailed) return null;
  try {
    let creds;
    if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) creds = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    else if (env.FIREBASE_SERVICE_ACCOUNT_FILE) creds = JSON.parse(fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8'));
    else return null;
    app = admin.initializeApp({ credential: admin.credential.cert(creds) }, 'way2cars');
    return admin.messaging(app);
  } catch (err) {
    initFailed = true;
    logger.error({ err: err.message }, 'firebase init failed — push disabled');
    return null;
  }
}

export const pushConfigured = () => Boolean(env.FIREBASE_SERVICE_ACCOUNT_BASE64 || env.FIREBASE_SERVICE_ACCOUNT_FILE);

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Sends one notification to up to 500 tokens. data values must be strings. */
export async function sendPush(tokens, { title, body, data = {}, link }) {
  const m = messaging();
  if (!m || !tokens.length) return { sent: 0, deadTokens: [], skipped: true };
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  try {
    const res = await m.sendEachForMulticast({
      tokens: tokens.slice(0, 500),
      notification: { title, body },
      data: stringData,
      webpush: link ? { fcmOptions: { link } } : undefined,
      android: { priority: 'high' },
    });
    const deadTokens = [];
    res.responses.forEach((r, i) => {
      if (!r.success && DEAD_TOKEN_CODES.has(r.error?.code)) deadTokens.push(tokens[i]);
    });
    return { sent: res.successCount, deadTokens };
  } catch (err) {
    logger.error({ err: err.message }, 'push send failed');
    return { sent: 0, deadTokens: [], error: err.message };
  }
}

/** Public web config for the browser SDK (these values are not secrets). */
export function webPushConfig() {
  if (!env.FIREBASE_WEB_CONFIG_JSON || !env.FIREBASE_WEB_VAPID_KEY) return null;
  try {
    return { config: JSON.parse(env.FIREBASE_WEB_CONFIG_JSON), vapidKey: env.FIREBASE_WEB_VAPID_KEY };
  } catch {
    return null;
  }
}

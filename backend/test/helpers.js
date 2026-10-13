import request from 'supertest';
import mongoose from 'mongoose';
import { beforeAll, afterAll } from 'vitest';
import { connectDb } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { ensureStorageDirs } from '../src/integrations/storage.js';

export const app = createApp();
export const api = () => request(app);

export function useDb() {
  beforeAll(async () => {
    await ensureStorageDirs();
    await connectDb();
    await Promise.all(Object.values(mongoose.models).map((m) => m.createCollection().then(() => m.syncIndexes()).catch(() => {})));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

let phoneSeq = 0;
/** Unique valid mobile numbers per test file (never in the dummy list). */
export const freshPhone = () => `7${String(process.pid % 1000).padStart(3, '0')}${String(++phoneSeq).padStart(6, '0')}`;

/** Logs in through the real OTP endpoints using a dummy number or explicit code lookup. */
export async function loginWithStaticOtp(realm, phone) {
  await api().post(`/api/v1/auth/${realm}/otp/request`).send({ phone }).expect(200);
  const res = await api().post(`/api/v1/auth/${realm}/otp/verify`).send({ phone, code: '1234' }).expect(200);
  return { token: res.body.data.accessToken, account: res.body.data.account, cookie: res.headers['set-cookie'], body: res.body.data };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

import sharp from 'sharp';
import { createSession, signAccessToken } from '../src/modules/auth/token.service.js';

/** Issues a real session for an account created directly in the DB (OTP is covered in auth.test.js). */
export async function tokenFor(realm, account) {
  const { session } = await createSession({ realm, accountId: account._id });
  return signAccessToken({ realm, accountId: account._id, sessionId: session._id, extra: realm === 'admin' ? { role: account.role } : {} });
}

let imgSeq = 0;
export async function testImage() {
  imgSeq++;
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: (imgSeq * 37) % 255, g: 120, b: 200 } } }).png().toBuffer();
}
export const testPdf = () => Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

export async function upload(realm, token, purpose, { pdf = false } = {}) {
  const res = await api().post(`/api/v1/${realm}/uploads`).set(auth(token)).field('purpose', purpose).attach('file', pdf ? testPdf() : await testImage(), pdf ? 'doc.pdf' : 'photo.png');
  if (res.status !== 201) throw new Error(`upload failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id;
}

/** Next half-hour boundary at least `minutesAhead` from now. */
export function slot(minutesAhead) {
  const step = 30 * 60_000;
  return new Date(Math.ceil((Date.now() + minutesAhead * 60_000) / step) * step);
}

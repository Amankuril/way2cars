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

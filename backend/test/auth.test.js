import { describe, it, expect } from 'vitest';
import { api, useDb, freshPhone, loginWithStaticOtp } from './helpers.js';
import { decideOtpMode, otpModeFor } from '../src/modules/auth/otp.service.js';
import { OtpChallenge } from '../src/modules/auth/otp.model.js';
import { User } from '../src/modules/users/user.model.js';

useDb();

describe('OTP mode rules', () => {
  const dummies = new Set(['9876543210']);
  it('dummy numbers always use the static OTP, whatever the bypass flag', () => {
    expect(decideOtpMode('9876543210', { bypassEnabled: false, dummyNumbers: dummies })).toBe('static');
    expect(decideOtpMode('9876543210', { bypassEnabled: true, dummyNumbers: dummies })).toBe('static');
  });
  it('other numbers use SMS unless global bypass is on', () => {
    expect(decideOtpMode('9000000001', { bypassEnabled: false, dummyNumbers: dummies })).toBe('sms');
    expect(decideOtpMode('9000000001', { bypassEnabled: true, dummyNumbers: dummies })).toBe('static');
  });
  it('normalises configured dummy numbers ("+91 98765 43210" matches 9876543210)', () => {
    expect(otpModeFor('9876543210')).toBe('static');
    expect(otpModeFor('9123456780')).toBe('static');
    expect(otpModeFor('9000000002')).toBe('sms');
  });
});

describe('user OTP login', () => {
  it('rejects invalid numbers', async () => {
    const res = await api().post('/api/v1/auth/user/otp/request').send({ phone: '1234567890' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHONE');
  });

  it('fails cleanly when live SMS is required but the provider is not configured', async () => {
    const res = await api().post('/api/v1/auth/user/otp/request').send({ phone: '9000000003' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('OTP_DELIVERY_FAILED');
    expect(JSON.stringify(res.body)).not.toMatch(/static|bypass|dummy/i);
  });

  it('dummy number logs in with 1234, creates the account, and response does not leak the mode', async () => {
    const reqRes = await api().post('/api/v1/auth/user/otp/request').send({ phone: '+91 98765 43210' }).expect(200);
    expect(Object.keys(reqRes.body.data).sort()).toEqual(['expiresInSeconds', 'resendAfterSeconds']);
    const res = await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9876543210', code: '1234' }).expect(200);
    expect(res.body.data.isNewAccount).toBe(true);
    expect(res.body.data.nextStep).toBe('profile');
    expect(res.body.data.account.phone).toBe('9876543210');
    expect(res.headers['set-cookie'][0]).toMatch(/w2c_user_rt=.*HttpOnly.*SameSite=Strict/i);
    const stored = await OtpChallenge.findOne({ phone: '9876543210' }).lean();
    expect(stored.codeHash).not.toContain('1234');
  });

  it('second login reports an existing account', async () => {
    await new Promise((r) => setTimeout(r, 10)); // distinct createdAt
    await OtpChallenge.deleteMany({ phone: '9876543210' }); // skip resend cooldown
    const { body } = await loginWithStaticOtp('user', '9876543210');
    expect(body.isNewAccount).toBe(false);
  });

  it('enforces resend cooldown', async () => {
    await api().post('/api/v1/auth/user/otp/request').send({ phone: '9123456780' }).expect(200);
    const res = await api().post('/api/v1/auth/user/otp/request').send({ phone: '9123456780' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('codes are single use and attempts are limited', async () => {
    await OtpChallenge.deleteMany({ phone: '9123456780' });
    await api().post('/api/v1/auth/user/otp/request').send({ phone: '9123456780' }).expect(200);
    for (let i = 0; i < 4; i++) {
      const r = await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9123456780', code: '9999' });
      expect(r.body.error.code).toBe('OTP_INCORRECT');
    }
    const last = await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9123456780', code: '9999' });
    expect(last.body.error.details.attemptsLeft).toBe(0);
    // Even the right code no longer works on an exhausted challenge.
    const after = await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9123456780', code: '1234' });
    expect(after.body.error.code).toBe('OTP_EXPIRED');
  });

  it('a used code cannot be replayed', async () => {
    await OtpChallenge.deleteMany({ phone: '9123456780' });
    await api().post('/api/v1/auth/user/otp/request').send({ phone: '9123456780' }).expect(200);
    await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9123456780', code: '1234' }).expect(200);
    const replay = await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9123456780', code: '1234' });
    expect(replay.status).toBe(400);
  });

  it('suspended accounts cannot sign in', async () => {
    await User.updateOne({ phone: '9123456780' }, { $set: { status: 'suspended' } });
    await OtpChallenge.deleteMany({ phone: '9123456780' });
    await api().post('/api/v1/auth/user/otp/request').send({ phone: '9123456780' }).expect(200);
    const res = await api().post('/api/v1/auth/user/otp/verify').send({ phone: '9123456780', code: '1234' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    await User.updateOne({ phone: '9123456780' }, { $set: { status: 'active' } });
  });
});

describe('sessions', () => {
  const cookieValue = (setCookie) => setCookie.find((c) => c.startsWith('w2c_user_rt=')).split(';')[0];

  it('refresh requires the client header (CSRF guard)', async () => {
    await OtpChallenge.deleteMany({ phone: '9876543210' });
    const { cookie } = await loginWithStaticOtp('user', '9876543210');
    const res = await api().post('/api/v1/auth/user/refresh').set('Cookie', cookieValue(cookie));
    expect(res.status).toBe(403);
  });

  it('rotates refresh tokens and revokes the session when an old token is reused', async () => {
    await OtpChallenge.deleteMany({ phone: '9876543210' });
    const { cookie } = await loginWithStaticOtp('user', '9876543210');
    const first = cookieValue(cookie);
    const r1 = await api().post('/api/v1/auth/user/refresh').set('Cookie', first).set('X-W2C-Client', 'web').expect(200);
    expect(r1.body.data.accessToken).toBeTruthy();
    const second = cookieValue(r1.headers['set-cookie']);
    expect(second).not.toBe(first);

    // Wait past the parallel-refresh grace window by rewinding rotatedAt.
    const { sessionModels } = await import('../src/modules/auth/session.model.js');
    const sid = second.split('=')[1].split('.')[0];
    await sessionModels.user.updateOne({ _id: sid }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });

    const reuse = await api().post('/api/v1/auth/user/refresh').set('Cookie', first).set('X-W2C-Client', 'web');
    expect(reuse.status).toBe(401);
    const afterTheft = await api().post('/api/v1/auth/user/refresh').set('Cookie', second).set('X-W2C-Client', 'web');
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    await OtpChallenge.deleteMany({ phone: '9876543210' });
    const { cookie } = await loginWithStaticOtp('user', '9876543210');
    const c = cookieValue(cookie);
    await api().post('/api/v1/auth/user/logout').set('Cookie', c).set('X-W2C-Client', 'web').expect(204);
    await api().post('/api/v1/auth/user/refresh').set('Cookie', c).set('X-W2C-Client', 'web').expect(401);
  });
});

describe('phone normalisation', () => {
  it('generates distinct valid phones for fixtures', () => {
    expect(freshPhone()).toMatch(/^[6-9]\d{9}$/);
  });
});

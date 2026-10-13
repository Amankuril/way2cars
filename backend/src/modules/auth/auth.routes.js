import { Router } from 'express';
import { z } from 'zod';
import { ok, noContent } from '../../core/http.js';
import { unauthorized } from '../../core/errors.js';
import { requireMobile } from '../../core/phone.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { requireClientHeader } from '../../middleware/csrf.js';
import { requestOtp } from './otp.service.js';
import { loginWithOtp, adminPasswordLogin, adminMfaLogin, realmModels, publicAdmin } from './auth.service.js';
import {
  rotateSession, revokeSession, setRefreshCookie, clearRefreshCookie, refreshCookieName, signAccessToken,
} from './token.service.js';
import { serializeUser } from '../users/user.serializer.js';
import { serializeVendor } from '../vendors/vendor.serializer.js';

const phoneBody = z.object({ phone: z.string().min(10).max(16) }).strict();
const verifyBody = z.object({ phone: z.string().min(10).max(16), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).strict();
const serializers = { user: serializeUser, vendor: serializeVendor };

/** Native apps keep the refresh token in the Android Keystore instead of a cookie. */
const isNative = (req) => req.get('x-w2c-client') === 'native';
const presentedToken = (req, realm) => (isNative(req) ? req.body?.refreshToken : req.cookies?.[refreshCookieName(realm)]);

function otpRealmRouter(realm) {
  const r = Router();
  r.post('/otp/request', authLimiter, validate({ body: phoneBody }), async (req, res) => {
    const phone = requireMobile(req.valid.body.phone);
    ok(res, await requestOtp({ phone, realm, ip: req.ip }));
  });

  r.post('/otp/verify', authLimiter, validate({ body: verifyBody }), async (req, res) => {
    const phone = requireMobile(req.valid.body.phone);
    const out = await loginWithOtp(req, { realm, phone, code: req.valid.body.code });
    const body = { accessToken: out.accessToken, account: serializers[realm](out.account), isNewAccount: out.isNew, nextStep: out.nextStep };
    if (isNative(req)) body.refreshToken = out.refreshToken;
    else setRefreshCookie(res, realm, out.refreshToken, out.session.expiresAt);
    ok(res, body);
  });

  mountSessionRoutes(r, realm, async (session) => {
    const account = await realmModels[realm].findById(session.accountId).lean();
    if (!account || ['suspended', 'deleted'].includes(account.status)) throw unauthorized('Account unavailable.', 'ACCOUNT_SUSPENDED');
    return { token: signAccessToken({ realm, accountId: account._id, sessionId: session._id }), account: serializers[realm](account) };
  });
  return r;
}

/** /refresh and /logout — cookie-authenticated, so CSRF-guarded. */
function mountSessionRoutes(r, realm, issue) {
  r.post('/refresh', requireClientHeader, async (req, res) => {
    const presented = presentedToken(req, realm);
    if (!presented || typeof presented !== 'string') throw unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED');
    try {
      const { session, refreshToken } = await rotateSession(realm, presented);
      const { token, account } = await issue(session);
      if (isNative(req)) return ok(res, { accessToken: token, account, refreshToken: refreshToken || presented });
      if (refreshToken) setRefreshCookie(res, realm, refreshToken, session.expiresAt);
      ok(res, { accessToken: token, account });
    } catch (err) {
      if (!isNative(req)) clearRefreshCookie(res, realm);
      throw err;
    }
  });
  r.post('/logout', requireClientHeader, async (req, res) => {
    const presented = presentedToken(req, realm);
    const id = String(presented || '').split('.')[0];
    if (/^[a-f0-9]{24}$/.test(id)) await revokeSession(realm, id, 'logout');
    clearRefreshCookie(res, realm);
    noContent(res);
  });
}

function adminRouter() {
  const r = Router();
  r.post(
    '/login',
    authLimiter,
    validate({ body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).strict() }),
    async (req, res) => {
      const out = await adminPasswordLogin(req, req.valid.body);
      if (out.mfaRequired) return ok(res, { mfaRequired: true, mfaToken: out.mfaToken });
      setRefreshCookie(res, 'admin', out.refreshToken, out.session.expiresAt);
      ok(res, { accessToken: out.accessToken, admin: out.admin, mfaSetupRequired: Boolean(out.mfaSetupRequired) });
    },
  );
  r.post(
    '/mfa',
    authLimiter,
    validate({ body: z.object({ mfaToken: z.string().min(10).max(1000), code: z.string().regex(/^\d{6}$/) }).strict() }),
    async (req, res) => {
      const out = await adminMfaLogin(req, req.valid.body);
      setRefreshCookie(res, 'admin', out.refreshToken, out.session.expiresAt);
      ok(res, { accessToken: out.accessToken, admin: out.admin });
    },
  );
  mountSessionRoutes(r, 'admin', async (session) => {
    const admin = await realmModels.admin.findById(session.accountId).lean();
    if (!admin || admin.status !== 'active') throw unauthorized('Account unavailable.', 'ACCOUNT_DISABLED');
    return {
      token: signAccessToken({ realm: 'admin', accountId: admin._id, sessionId: session._id, extra: { role: admin.role } }),
      account: publicAdmin(admin),
    };
  });
  return r;
}

export const authRouter = Router();
authRouter.use('/user', otpRealmRouter('user'));
authRouter.use('/vendor', otpRealmRouter('vendor'));
authRouter.use('/admin', adminRouter());

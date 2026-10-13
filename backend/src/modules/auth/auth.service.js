import { TOTP, Secret } from 'otpauth';
import { env } from '../../config/env.js';
import { audit } from '../../core/audit.js';
import { decrypt, verifyPassword } from '../../core/crypto.js';
import { forbidden, unauthorized, AppError } from '../../core/errors.js';
import { isDuplicateKey } from '../../core/db.js';
import { randomToken } from '../../core/crypto.js';
import { User } from '../users/user.model.js';
import { Vendor, VENDOR_ONBOARDING_STEPS } from '../vendors/vendor.model.js';
import { AdminUser } from '../admin/admin.model.js';
import { getSettings } from '../settings/settings.service.js';
import { verifyOtp } from './otp.service.js';
import { createSession, signAccessToken, signMfaToken, verifyMfaToken } from './token.service.js';
import { permissionsFor } from './permissions.js';

export const realmModels = { user: User, vendor: Vendor, admin: AdminUser };

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function referralCode() {
  const bytes = Buffer.from(randomToken(8), 'base64url');
  let s = '';
  for (let i = 0; i < 6; i++) s += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  return `W2C${s}`;
}

export function vendorNextStep(v) {
  if (v.status === 'approved') return null;
  const next = VENDOR_ONBOARDING_STEPS.find((s) => !v.completedSteps?.includes(s));
  if (next) return next;
  return v.status === 'rejected' ? 'resubmit' : 'review';
}

async function findOrCreate(realm, phone) {
  const Model = realmModels[realm];
  let account = await Model.findOne({ phone });
  if (account) return { account, isNew: false };
  const settings = await getSettings();
  for (let i = 0; i < 5; i++) {
    try {
      const data = realm === 'user'
        ? { phone, referralCode: referralCode(), status: settings.booking.requireUserApproval ? 'pending_approval' : 'active' }
        : { phone, status: 'onboarding' };
      account = await Model.create(data);
      return { account, isNew: true };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      account = await Model.findOne({ phone }); // concurrent signup with the same phone
      if (account) return { account, isNew: false };
    }
  }
  throw new Error('Could not allocate a referral code');
}

/** OTP login for users and vendors. Creates the account on first successful verification. */
export async function loginWithOtp(req, { realm, phone, code }) {
  const { mode } = await verifyOtp({ phone, realm, code });
  const { account, isNew } = await findOrCreate(realm, phone);
  if (account.status === 'suspended') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Please contact support.');
  }
  if (account.status === 'deleted') throw unauthorized();

  account.lastLoginAt = new Date();
  await account.save();
  const { session, refreshToken } = await createSession({ realm, accountId: account._id, ip: req.ip, userAgent: req.get('user-agent') });
  const accessToken = signAccessToken({ realm, accountId: account._id, sessionId: session._id });
  await audit(req, `${realm}.login`, { type: realm, id: account._id }, {
    actor: { realm, id: account._id },
    changes: { isNew, otpMode: mode === 'static' ? 'static' : undefined },
  });
  const nextStep = realm === 'user' ? (account.profileCompleted ? null : 'profile') : vendorNextStep(account);
  return { accessToken, refreshToken, session, account, isNew, nextStep };
}

// ---------------------------------------------------------------- admin
async function registerFailure(admin) {
  const failed = (admin.failedLogins || 0) + 1;
  const set = { failedLogins: failed };
  if (failed >= env.ADMIN_MAX_FAILED_LOGINS) {
    set.lockedUntil = new Date(Date.now() + env.ADMIN_LOCKOUT_MINUTES * 60_000);
    set.failedLogins = 0;
  }
  await AdminUser.updateOne({ _id: admin._id }, { $set: set });
}

export async function adminPasswordLogin(req, { email, password }) {
  const admin = await AdminUser.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
  const invalid = () => unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  if (!admin) {
    await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA'); // equalise timing
    throw invalid();
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }
  if (!(await verifyPassword(password, admin.passwordHash))) {
    await registerFailure(admin);
    await audit(req, 'admin.login_failed', { type: 'admin', id: admin._id }, { actor: { realm: 'system' } });
    throw invalid();
  }
  if (admin.status !== 'active') throw forbidden('This admin account is disabled.', 'ACCOUNT_DISABLED');
  if (admin.mfa?.enabled) return { mfaRequired: true, mfaToken: signMfaToken(admin._id) };
  if (env.ADMIN_REQUIRE_MFA) return completeAdminLogin(req, admin, { mfaSetupRequired: true });
  return completeAdminLogin(req, admin);
}

export function verifyTotp(secretEnc, code) {
  const totp = new TOTP({ issuer: 'WAY2CARS Admin', algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(decrypt(secretEnc)) });
  return totp.validate({ token: String(code || ''), window: 1 }) !== null;
}

export async function adminMfaLogin(req, { mfaToken, code }) {
  const adminId = verifyMfaToken(mfaToken);
  const admin = await AdminUser.findById(adminId).select('+mfa.secretEnc');
  if (!admin || admin.status !== 'active' || !admin.mfa?.enabled) throw unauthorized();
  if (admin.lockedUntil && admin.lockedUntil > new Date()) throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  if (!verifyTotp(admin.mfa.secretEnc, code)) {
    await registerFailure(admin);
    throw unauthorized('Incorrect authentication code.', 'MFA_INVALID');
  }
  return completeAdminLogin(req, admin);
}

async function completeAdminLogin(req, admin, extra = {}) {
  await AdminUser.updateOne({ _id: admin._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: req.ip } });
  const { session, refreshToken } = await createSession({ realm: 'admin', accountId: admin._id, ip: req.ip, userAgent: req.get('user-agent') });
  const accessToken = signAccessToken({ realm: 'admin', accountId: admin._id, sessionId: session._id, extra: { role: admin.role } });
  await audit(req, 'admin.login', { type: 'admin', id: admin._id }, { actor: { realm: 'admin', id: admin._id, label: admin.email } });
  return { accessToken, refreshToken, session, admin: publicAdmin(admin), ...extra };
}

export const publicAdmin = (a) => ({
  id: a._id,
  email: a.email,
  name: a.name,
  role: a.role,
  permissions: permissionsFor(a.role),
  mfaEnabled: Boolean(a.mfa?.enabled),
  lastLoginAt: a.lastLoginAt,
});

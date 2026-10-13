import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { TOTP, Secret } from 'otpauth';
import { ok, created, noContent } from '../../core/http.js';
import { badRequest, conflict, notFound, forbidden } from '../../core/errors.js';
import { encrypt, hashPassword, verifyPassword } from '../../core/crypto.js';
import { audit, AuditLog } from '../../core/audit.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { AdminUser, ADMIN_ROLES } from './admin.model.js';
import { publicAdmin, verifyTotp } from '../auth/auth.service.js';
import { revokeAllSessions } from '../auth/token.service.js';
import { getSettings, updateSettings } from '../settings/settings.service.js';
import { bypassStatus } from '../auth/otp.service.js';
import { smsConfigured } from '../../integrations/sms.js';
import { pushConfigured } from '../../integrations/firebase.js';
import { emailConfigured } from '../../integrations/email.js';
import { mapsConfigured, mapsUsage } from '../../integrations/maps.js';
import { publicKeyId } from '../../integrations/razorpay.js';
import { trackingEnabled } from '../tracking/tracking.js';
import { notify } from '../notifications/notification.service.js';
import { User } from '../users/user.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const password = z.string().min(12, 'At least 12 characters').max(200).regex(/[A-Z]/, 'Add an uppercase letter').regex(/[a-z]/, 'Add a lowercase letter').regex(/\d/, 'Add a digit');

export const adminCoreRouter = Router();

// ---------------------------------------------------------------- me / MFA
adminCoreRouter.get('/me', async (req, res) => ok(res, publicAdmin(await AdminUser.findById(req.auth.id).lean())));

adminCoreRouter.post('/me/password', validate({ body: z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }).strict() }), async (req, res) => {
  const admin = await AdminUser.findById(req.auth.id).select('+passwordHash');
  if (!(await verifyPassword(req.valid.body.currentPassword, admin.passwordHash))) throw badRequest('Current password is incorrect.', undefined, 'INVALID_CREDENTIALS');
  admin.passwordHash = await hashPassword(req.valid.body.newPassword);
  admin.passwordChangedAt = new Date();
  await admin.save();
  await revokeAllSessions('admin', admin._id, 'password_changed');
  await audit(req, 'admin.password_changed', { type: 'admin', id: admin._id });
  noContent(res);
});

adminCoreRouter.post('/me/mfa/setup', async (req, res) => {
  const admin = await AdminUser.findById(req.auth.id);
  if (admin.mfa?.enabled) throw conflict('Two-factor authentication is already enabled.', 'MFA_ENABLED');
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: 'WAY2CARS Admin', label: admin.email, algorithm: 'SHA1', digits: 6, period: 30, secret });
  admin.mfa = { enabled: false, pendingSecretEnc: encrypt(secret.base32) };
  await admin.save();
  const uri = totp.toString();
  ok(res, { otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret: secret.base32 });
});

adminCoreRouter.post('/me/mfa/enable', validate({ body: z.object({ code: z.string().regex(/^\d{6}$/) }).strict() }), async (req, res) => {
  const admin = await AdminUser.findById(req.auth.id).select('+mfa.pendingSecretEnc +mfa.secretEnc');
  if (!admin.mfa?.pendingSecretEnc) throw badRequest('Start MFA setup first.');
  if (!verifyTotp(admin.mfa.pendingSecretEnc, req.valid.body.code)) throw badRequest('That code is not valid. Check your authenticator app time.', undefined, 'MFA_INVALID');
  admin.mfa = { enabled: true, secretEnc: admin.mfa.pendingSecretEnc, pendingSecretEnc: undefined };
  await admin.save();
  await audit(req, 'admin.mfa_enabled', { type: 'admin', id: admin._id });
  noContent(res);
});

adminCoreRouter.post('/me/mfa/disable', validate({ body: z.object({ password: z.string().min(1).max(200), code: z.string().regex(/^\d{6}$/) }).strict() }), async (req, res) => {
  const admin = await AdminUser.findById(req.auth.id).select('+passwordHash +mfa.secretEnc');
  if (!(await verifyPassword(req.valid.body.password, admin.passwordHash)) || !admin.mfa?.enabled || !verifyTotp(admin.mfa.secretEnc, req.valid.body.code)) throw badRequest('Password or code is incorrect.', undefined, 'INVALID_CREDENTIALS');
  admin.mfa = { enabled: false };
  await admin.save();
  await audit(req, 'admin.mfa_disabled', { type: 'admin', id: admin._id });
  noContent(res);
});

// ---------------------------------------------------------------- admin accounts (super admin)
adminCoreRouter.get('/admins', requirePermission('admins.manage'), async (_req, res) => ok(res, (await AdminUser.find().sort({ createdAt: 1 }).lean()).map((a) => ({ ...publicAdmin(a), status: a.status, createdAt: a.createdAt }))));

adminCoreRouter.post('/admins', requirePermission('admins.manage'), validate({ body: z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(100), role: z.enum(ADMIN_ROLES), password }).strict() }), async (req, res) => {
  if (await AdminUser.exists({ email: req.valid.body.email })) throw conflict('An admin with this email exists.', 'ADMIN_EXISTS');
  const a = await AdminUser.create({ ...req.valid.body, passwordHash: await hashPassword(req.valid.body.password), createdBy: req.auth.id, passwordChangedAt: new Date() });
  await audit(req, 'admin.created', { type: 'admin', id: a._id }, { changes: { email: a.email, role: a.role } });
  created(res, publicAdmin(a));
});

adminCoreRouter.patch('/admins/:id', requirePermission('admins.manage'), validate({ params: z.object({ id: objectId }), body: z.object({ role: z.enum(ADMIN_ROLES).optional(), status: z.enum(['active', 'disabled']).optional(), resetPassword: password.optional(), resetMfa: z.boolean().optional() }).strict() }), async (req, res) => {
  if (req.valid.params.id === String(req.auth.id)) throw forbidden('Use your own profile settings to change your account.');
  const a = await AdminUser.findById(req.valid.params.id);
  if (!a) throw notFound('Admin');
  const { role, status, resetPassword, resetMfa } = req.valid.body;
  if (role) a.role = role;
  if (status) a.status = status;
  if (resetPassword) {
    a.passwordHash = await hashPassword(resetPassword);
    a.passwordChangedAt = new Date();
  }
  if (resetMfa) a.mfa = { enabled: false };
  await a.save();
  if (status === 'disabled' || resetPassword || role) await revokeAllSessions('admin', a._id, 'admin_updated');
  await audit(req, 'admin.updated', { type: 'admin', id: a._id }, { changes: { role, status, passwordReset: Boolean(resetPassword), mfaReset: Boolean(resetMfa) } });
  ok(res, publicAdmin(a));
});

// ---------------------------------------------------------------- settings
const bps = z.number().int().min(0).max(10000);
const paise = z.number().int().min(0).max(100_000_000);
const settingsPatch = z.object({
  tax: z.object({ rentalGstBps: bps, gstin: z.string().trim().max(15), legalName: z.string().trim().max(150), registeredAddress: z.string().trim().max(300), stateCode: z.string().regex(/^(\d{2})?$/), sacCode: z.string().regex(/^\d{6}$/) }).partial().strict(),
  fees: z.object({ convenienceFeePaise: paise, deliveryBaseFeePaise: paise, deliveryPerKmPaise: paise, deliveryMaxKm: z.number().int().min(0).max(200) }).partial().strict(),
  commissionBps: z.number().int().min(0).max(9000),
  booking: z.object({ holdMinutes: z.number().int().min(5).max(60), minDurationHours: z.number().int().min(1).max(48), maxDurationDays: z.number().int().min(1).max(180), minLeadMinutes: z.number().int().min(0).max(1440), maxAdvanceDays: z.number().int().min(1).max(365), bufferMinutes: z.number().int().min(0).max(720), vendorApprovalSlaMinutes: z.number().int().min(10).max(1440), pickupWindowMinutesBefore: z.number().int().min(0).max(240), kycRequired: z.boolean(), requireUserApproval: z.boolean() }).partial().strict(),
  cancellation: z.object({ tiers: z.array(z.object({ minHoursBeforeStart: z.number().min(0).max(720), refundBps: bps }).strict()).min(1).max(6), feePaise: paise }).partial().strict(),
  trip: z.object({ lateGraceMinutes: z.number().int().min(0).max(240), lateFeeMultiplierBps: z.number().int().min(10000).max(50000), fuelChargePerEighthPaise: paise, returnReviewHours: z.number().int().min(1).max(168), minPickupPhotos: z.number().int().min(1).max(12) }).partial().strict(),
  payouts: z.object({ holdDays: z.number().int().min(0).max(60), minWithdrawalPaise: paise }).partial().strict(),
  referral: z.object({ enabled: z.boolean(), referrerRewardPaise: paise, refereeRewardPaise: paise }).partial().strict(),
  loyalty: z.object({ enabled: z.boolean(), earnBps: z.number().int().min(0).max(2000) }).partial().strict(),
  wallet: z.object({ maxRedeemBps: bps }).partial().strict(),
  support: z.object({ phone: z.string().trim().max(20), email: z.string().trim().max(200), whatsapp: z.string().trim().max(20), emergencyPhone: z.string().trim().max(20), roadsidePhone: z.string().trim().max(20), hours: z.string().trim().max(60) }).partial().strict(),
}).partial().strict();

adminCoreRouter.get('/settings', requirePermission('dashboard.read'), async (_req, res) => ok(res, await getSettings({ fresh: true })));
adminCoreRouter.patch('/settings', requirePermission('settings.manage'), validate({ body: settingsPatch }), async (req, res) => {
  const before = await getSettings({ fresh: true });
  const after = await updateSettings(req.valid.body, req.auth.id);
  await audit(req, 'settings.updated', { type: 'settings' }, { changes: { patch: req.valid.body, fromVersion: before.version, toVersion: after.version } });
  ok(res, after);
});

/** Integration health (configured or not) — never returns secrets. */
adminCoreRouter.get('/system/integrations', requirePermission('settings.manage'), async (_req, res) => {
  const otp = bypassStatus();
  ok(res, {
    sms: { configured: smsConfigured() },
    otp: { globalBypass: otp.globalBypass, dummyNumbersConfigured: otp.dummyNumberCount > 0 },
    razorpay: { configured: Boolean(publicKeyId()), mode: publicKeyId()?.startsWith('rzp_live') ? 'live' : publicKeyId() ? 'test' : null },
    firebase: { configured: pushConfigured() },
    email: { configured: emailConfigured() },
    maps: { configured: mapsConfigured(), usageSinceRestart: mapsUsage() },
    tracking: { configured: trackingEnabled() },
  });
});

// ---------------------------------------------------------------- audit logs
adminCoreRouter.get('/audit-logs', requirePermission('audit.read'), validate({ query: z.object({ ...paginationQuery, action: z.string().trim().max(60).optional(), entityId: objectId.optional(), actorId: objectId.optional(), realm: z.enum(['user', 'vendor', 'admin', 'system', 'webhook']).optional() }) }), async (req, res) => {
  const { page, limit, action, entityId, actorId, realm } = req.valid.query;
  const filter = {};
  if (action) filter.action = new RegExp(`^${action.replace(/[^\w.]/g, '')}`);
  if (entityId) filter['entity.id'] = entityId;
  if (actorId) filter['actor.id'] = actorId;
  if (realm) filter['actor.realm'] = realm;
  const { items, meta } = await paginate(AuditLog, filter, { page, limit });
  ok(res, items, meta);
});

// ---------------------------------------------------------------- promotional broadcast
adminCoreRouter.post('/broadcasts', requirePermission('coupons.manage'), validate({ body: z.object({ title: z.string().trim().min(3).max(60), body: z.string().trim().min(5).max(200), link: z.string().regex(/^\/[\w\-/?=&.%]*$/).max(200).optional(), cityId: objectId.optional() }).strict() }), async (req, res) => {
  const filter = { status: 'active', 'notificationPrefs.promotional': { $ne: false } };
  if (req.valid.body.cityId) filter.homeCityId = req.valid.body.cityId;
  const ids = await User.find(filter).distinct('_id');
  await audit(req, 'broadcast.sent', { type: 'broadcast' }, { changes: { ...req.valid.body, recipients: ids.length } });
  const key = `promo:${Date.now()}`;
  // Sequential in the background to respect provider rate limits.
  setImmediate(async () => {
    for (const id of ids) await notify('promo.broadcast', { realm: 'user', id }, req.valid.body, { dedupeKey: `${key}:${id}` });
  });
  ok(res, { recipients: ids.length });
});

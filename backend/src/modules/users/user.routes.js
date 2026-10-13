import { Router } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { revokeAllSessions } from '../auth/token.service.js';
import { User } from './user.model.js';
import { serializeUser } from './user.serializer.js';
import { submitKyc, userKycSchema, latestSubmission, serializeSubmission } from '../kyc/kyc.service.js';
import { attachReferral, serializeLedger } from '../wallet/wallet.service.js';
import { LedgerEntry, Referral } from '../wallet/wallet.model.js';
import { getSettings } from '../settings/settings.service.js';
import { listSavedTokens, deleteSavedToken } from '../../integrations/razorpay.js';
import { Booking, ACTIVE_BOOKING_STATUSES } from '../bookings/booking.model.js';
import { City } from '../catalog/catalog.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const name = z.string().trim().min(2, 'Enter your full name').max(100).regex(/^[\p{L} .'-]+$/u, 'Use letters only');
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(200);

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code').optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  placeId: z.string().max(300).optional(),
  isDefault: z.boolean().optional(),
}).strict();

const toAddress = ({ lat, lng, ...a }) => ({ ...a, ...(lat !== undefined && lng !== undefined ? { location: { type: 'Point', coordinates: [lng, lat] } } : {}) });
const me = (req) => User.findById(req.auth.id);

export const userAccountRouter = Router();

userAccountRouter.get('/me', async (req, res) => ok(res, serializeUser(await User.findById(req.auth.id).lean())));

userAccountRouter.post('/me/onboarding', validate({ body: z.object({ name, email: email.optional(), referralCode: z.string().trim().toUpperCase().regex(/^W2C[A-Z0-9]{6}$/, 'Invalid referral code').optional(), homeCityId: objectId.optional() }).strict() }), async (req, res) => {
  const { name: n, email: e, referralCode, homeCityId } = req.valid.body;
  if (homeCityId && !(await City.exists({ _id: homeCityId, isActive: true }))) throw badRequest('Choose a supported city.');
  const user = await withTransaction(async (session) => {
    const u = await User.findById(req.auth.id).session(session);
    if (u.profileCompleted) throw conflict('Your profile is already set up.', 'ALREADY_ONBOARDED');
    u.name = n;
    if (e) u.email = e;
    if (homeCityId) u.homeCityId = homeCityId;
    u.profileCompleted = true;
    await u.save({ session });
    if (referralCode) await attachReferral(u, referralCode, session);
    return u;
  });
  ok(res, serializeUser(user.toObject()));
});

userAccountRouter.patch('/me', validate({ body: z.object({ name: name.optional(), email: email.optional().or(z.literal('')), homeCityId: objectId.nullable().optional() }).strict() }), async (req, res) => {
  const set = { ...req.valid.body };
  if (set.email === '') set.email = undefined;
  if (set.name) {
    // The verified name must keep matching the licence; changes go through support.
    const current = await User.findById(req.auth.id).select('name kyc.status').lean();
    if (['pending', 'approved'].includes(current.kyc?.status) && set.name !== current.name) {
      throw conflict('Your name is locked after verification. Contact support to change it.', 'NAME_LOCKED');
    }
  }
  const user = await User.findByIdAndUpdate(req.auth.id, { $set: set }, { new: true, runValidators: true }).lean();
  ok(res, serializeUser(user));
});

userAccountRouter.put('/me/notification-prefs', validate({ body: z.object({ push: z.boolean(), sms: z.boolean(), email: z.boolean(), promotional: z.boolean() }).strict() }), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.auth.id, { $set: { notificationPrefs: req.valid.body } }, { new: true }).lean();
  ok(res, user.notificationPrefs);
});

// ---------------------------------------------------------------- addresses
userAccountRouter.post('/me/addresses', validate({ body: addressSchema }), async (req, res) => {
  const user = await me(req);
  if (user.addresses.length >= 10) throw badRequest('You can save up to 10 addresses.');
  const addr = toAddress(req.valid.body);
  if (addr.isDefault || user.addresses.length === 0) {
    user.addresses.forEach((a) => (a.isDefault = false));
    addr.isDefault = true;
  }
  user.addresses.push(addr);
  await user.save();
  created(res, serializeUser(user.toObject()).addresses.at(-1));
});

userAccountRouter.patch('/me/addresses/:id', validate({ params: z.object({ id: objectId }), body: addressSchema.partial() }), async (req, res) => {
  const user = await me(req);
  const addr = user.addresses.id(req.valid.params.id);
  if (!addr) throw notFound('Address');
  const patch = toAddress(req.valid.body);
  if (patch.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  Object.assign(addr, patch);
  await user.save();
  ok(res, serializeUser(user.toObject()).addresses.find((a) => String(a.id) === req.valid.params.id));
});

userAccountRouter.delete('/me/addresses/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const user = await me(req);
  const addr = user.addresses.id(req.valid.params.id);
  if (!addr) throw notFound('Address');
  const wasDefault = addr.isDefault;
  addr.deleteOne();
  if (wasDefault && user.addresses[0]) user.addresses[0].isDefault = true;
  await user.save();
  noContent(res);
});

// ---------------------------------------------------------------- KYC
userAccountRouter.get('/me/kyc', async (req, res) => {
  const [user, sub] = await Promise.all([User.findById(req.auth.id).select('kyc').lean(), latestSubmission('user', req.auth.id)]);
  ok(res, { status: user.kyc?.status || 'not_submitted', rejectionReason: user.kyc?.rejectionReason || null, submission: serializeSubmission(sub) });
});

userAccountRouter.post('/me/kyc', validate({ body: userKycSchema }), async (req, res) => {
  const sub = await submitKyc(req, 'user', req.valid.body);
  created(res, serializeSubmission(sub.toObject()));
});

// ---------------------------------------------------------------- saved payment methods (Razorpay tokens)
userAccountRouter.get('/me/payment-methods', async (req, res) => {
  const user = await User.findById(req.auth.id).select('razorpayCustomerId').lean();
  if (!user.razorpayCustomerId) return ok(res, []);
  const tokens = await listSavedTokens(user.razorpayCustomerId);
  ok(res, (tokens.items || []).map((t) => ({
    id: t.id,
    method: t.method,
    card: t.card ? { network: t.card.network, last4: t.card.last4, issuer: t.card.issuer, type: t.card.type, expiryMonth: t.card.expiry_month, expiryYear: t.card.expiry_year } : null,
    vpa: t.vpa ? { username: t.vpa.username, handle: t.vpa.handle } : null,
    createdAt: t.created_at ? new Date(t.created_at * 1000) : null,
  })));
});

userAccountRouter.delete('/me/payment-methods/:tokenId', validate({ params: z.object({ tokenId: z.string().regex(/^token_[A-Za-z0-9]{6,30}$/) }) }), async (req, res) => {
  const user = await User.findById(req.auth.id).select('razorpayCustomerId').lean();
  if (!user.razorpayCustomerId) throw notFound('Payment method');
  await deleteSavedToken(user.razorpayCustomerId, req.valid.params.tokenId);
  noContent(res);
});

// ---------------------------------------------------------------- wallet & referrals
userAccountRouter.get('/wallet', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const [user, { items, meta }] = await Promise.all([
    User.findById(req.auth.id).select('walletBalancePaise').lean(),
    paginate(LedgerEntry, { 'owner.realm': 'user', 'owner.id': req.auth.id }, req.valid.query),
  ]);
  ok(res, { balancePaise: user.walletBalancePaise, entries: items.map(serializeLedger) }, meta);
});

userAccountRouter.get('/referrals', async (req, res) => {
  const [user, settings, referrals] = await Promise.all([
    User.findById(req.auth.id).select('referralCode').lean(),
    getSettings(),
    Referral.find({ referrerId: req.auth.id }).sort({ createdAt: -1 }).limit(100).populate('refereeId', 'name').lean(),
  ]);
  ok(res, {
    code: user.referralCode,
    enabled: settings.referral.enabled,
    referrerRewardPaise: settings.referral.referrerRewardPaise,
    refereeRewardPaise: settings.referral.refereeRewardPaise,
    referrals: referrals.map((r) => ({ id: r._id, name: r.refereeId?.name?.split(' ')[0] || 'Friend', status: r.status, rewardPaise: r.referrerRewardPaise || 0, createdAt: r.createdAt })),
    totalEarnedPaise: referrals.reduce((s, r) => s + (r.status === 'rewarded' ? r.referrerRewardPaise || 0 : 0), 0),
  });
});

// ---------------------------------------------------------------- account deletion
userAccountRouter.delete('/me', validate({ body: z.object({ confirm: z.literal('DELETE') }).strict() }), async (req, res) => {
  if (await Booking.exists({ userId: req.auth.id, status: { $in: ACTIVE_BOOKING_STATUSES } })) {
    throw conflict('You have upcoming or active trips. Complete or cancel them before deleting your account.', 'HAS_ACTIVE_BOOKINGS');
  }
  const user = await User.findById(req.auth.id);
  await User.updateOne({ _id: user._id }, {
    $set: { status: 'deleted', deletedAt: new Date(), deletedPhone: user.phone, phone: null, name: 'Deleted user', email: null, addresses: [] },
  });
  await revokeAllSessions('user', user._id, 'account_deleted');
  await audit(req, 'user.deleted', { type: 'user', id: user._id });
  noContent(res);
});

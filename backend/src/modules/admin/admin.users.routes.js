import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../core/http.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery, escapeRegex } from '../../core/pagination.js';
import { normalizeIndianMobile } from '../../core/phone.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { revokeAllSessions } from '../auth/token.service.js';
import { User } from '../users/user.model.js';
import { serializeUser } from '../users/user.serializer.js';
import { Vendor, VendorBankAccount } from '../vendors/vendor.model.js';
import { serializeVendor } from '../vendors/vendor.serializer.js';
import { serializeBank } from '../vendors/vendor.routes.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { reviewKyc, serializeSubmission, latestSubmission } from '../kyc/kyc.service.js';
import { Booking, ACTIVE_BOOKING_STATUSES } from '../bookings/booking.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { refreshVendorListings } from '../vehicles/vehicle.service.js';
import { creditUserWallet, serializeLedger } from '../wallet/wallet.service.js';
import { LedgerEntry } from '../wallet/wallet.model.js';
import { AuditLog } from '../../core/audit.js';
import { notifyLater } from '../notifications/notification.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const idParams = z.object({ id: objectId });

function searchFilter(q) {
  if (!q) return {};
  const phone = normalizeIndianMobile(q);
  if (phone) return { phone };
  return { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }] };
}

// ================================================================= users
export const adminUsersRouter = Router();

adminUsersRouter.get('/', requirePermission('users.read'), validate({ query: z.object({ ...paginationQuery, q: z.string().trim().max(100).optional(), status: z.enum(['active', 'pending_approval', 'suspended', 'deleted']).optional(), kyc: z.enum(['not_submitted', 'pending', 'approved', 'rejected']).optional() }) }), async (req, res) => {
  const { page, limit, q, status, kyc } = req.valid.query;
  const filter = { ...searchFilter(q) };
  if (status) filter.status = status;
  if (kyc) filter['kyc.status'] = kyc;
  const { items, meta } = await paginate(User, filter, { page, limit, select: 'phone name email status kyc stats walletBalancePaise createdAt lastLoginAt' });
  ok(res, items.map((u) => ({ id: u._id, phone: u.phone, name: u.name, email: u.email, status: u.status, kycStatus: u.kyc?.status, trips: u.stats?.tripsCompleted || 0, walletBalancePaise: u.walletBalancePaise, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })), meta);
});

adminUsersRouter.get('/:id', requirePermission('users.read'), validate({ params: idParams }), async (req, res) => {
  const u = await User.findById(req.valid.params.id).lean();
  if (!u) throw notFound('User');
  const [bookings, ledger, history, kyc] = await Promise.all([
    Booking.find({ userId: u._id }).sort({ createdAt: -1 }).limit(20).select('ref status startAt endAt vehicleSnapshot.title pricing.totalPaise').lean(),
    LedgerEntry.find({ 'owner.realm': 'user', 'owner.id': u._id }).sort({ createdAt: -1 }).limit(20).lean(),
    AuditLog.find({ $or: [{ 'entity.id': u._id }, { 'actor.id': u._id }] }).sort({ createdAt: -1 }).limit(30).lean(),
    latestSubmission('user', u._id),
  ]);
  ok(res, {
    ...serializeUser(u),
    statusReason: u.statusReason,
    lastLoginAt: u.lastLoginAt,
    kycSubmission: serializeSubmission(kyc),
    bookings: bookings.map((b) => ({ id: b._id, ref: b.ref, status: b.status, startAt: b.startAt, endAt: b.endAt, vehicle: b.vehicleSnapshot?.title, totalPaise: b.pricing?.totalPaise })),
    ledger: ledger.map(serializeLedger),
    history: history.map((h) => ({ action: h.action, actor: h.actor, reason: h.reason, at: h.createdAt })),
  });
});

adminUsersRouter.post('/:id/status', requirePermission('users.manage'), validate({ params: idParams, body: z.object({ action: z.enum(['approve', 'suspend', 'reactivate']), reason: z.string().trim().min(3).max(300) }).strict() }), async (req, res) => {
  const { action, reason } = req.valid.body;
  const u = await User.findById(req.valid.params.id);
  if (!u || u.status === 'deleted') throw notFound('User');
  const map = { approve: ['pending_approval', 'active'], suspend: [null, 'suspended'], reactivate: ['suspended', 'active'] };
  const [from, to] = map[action];
  if (from && u.status !== from) throw conflict(`User is ${u.status}.`, 'INVALID_STATE');
  if (action === 'suspend' && (await Booking.exists({ userId: u._id, status: 'ongoing' }))) throw conflict('This user has a trip in progress. Resolve it before suspending.', 'HAS_ONGOING_TRIP');
  u.status = to;
  u.statusReason = reason;
  await u.save();
  if (to === 'suspended') await revokeAllSessions('user', u._id, 'suspended');
  await audit(req, `user.${action}`, { type: 'user', id: u._id }, { reason });
  ok(res, serializeUser(u.toObject()));
});

adminUsersRouter.post('/:id/wallet-adjustment', requirePermission('refunds.manage'), validate({ params: idParams, body: z.object({ amountPaise: z.number().int().min(100).max(10_000_000), reason: z.string().trim().min(5).max(300) }).strict() }), async (req, res) => {
  const u = await User.exists({ _id: req.valid.params.id });
  if (!u) throw notFound('User');
  await withTransaction(async (session) => {
    await creditUserWallet(req.valid.params.id, req.valid.body.amountPaise, 'admin_adjustment', { note: req.valid.body.reason, by: { realm: 'admin', id: req.auth.id } }, session);
    await audit(req, 'user.wallet_credited', { type: 'user', id: req.valid.params.id }, { reason: req.valid.body.reason, changes: { amountPaise: req.valid.body.amountPaise }, session });
  });
  ok(res, serializeUser(await User.findById(req.valid.params.id).lean()));
});

// ================================================================= vendors
export const adminVendorsRouter = Router();

adminVendorsRouter.get('/', requirePermission('vendors.read'), validate({ query: z.object({ ...paginationQuery, q: z.string().trim().max(100).optional(), status: z.enum(['onboarding', 'pending_approval', 'approved', 'rejected', 'suspended', 'deleted']).optional() }) }), async (req, res) => {
  const { page, limit, q, status } = req.valid.query;
  const filter = { ...searchFilter(q) };
  if (q && !filter.phone) filter.$or.push({ businessName: new RegExp(escapeRegex(q), 'i') });
  if (status) filter.status = status;
  const sort = status === 'pending_approval' ? { submittedAt: 1 } : { createdAt: -1 };
  const { items, meta } = await paginate(Vendor, filter, { page, limit, sort });
  const counts = await Vehicle.aggregate([{ $match: { vendorId: { $in: items.map((v) => v._id) } } }, { $group: { _id: '$vendorId', total: { $sum: 1 }, listed: { $sum: { $cond: ['$isListed', 1, 0] } } } }]);
  const cMap = new Map(counts.map((c) => [String(c._id), c]));
  ok(res, items.map((v) => ({ ...serializeVendor(v), submittedAt: v.submittedAt, vehicles: { total: cMap.get(String(v._id))?.total || 0, listed: cMap.get(String(v._id))?.listed || 0 } })), meta);
});

adminVendorsRouter.get('/:id', requirePermission('vendors.read'), validate({ params: idParams }), async (req, res) => {
  const v = await Vendor.findById(req.valid.params.id).lean();
  if (!v) throw notFound('Host');
  const [bank, kyc, vehicles, bookings, history] = await Promise.all([
    VendorBankAccount.findOne({ vendorId: v._id, isActive: true }).lean(),
    latestSubmission('vendor', v._id),
    Vehicle.find({ vendorId: v._id }).select('model registrationNumber approval status isListed rating stats').populate('brandId', 'name').lean(),
    Booking.aggregate([{ $match: { vendorId: v._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    AuditLog.find({ $or: [{ 'entity.id': v._id }, { 'actor.id': v._id }] }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  ok(res, {
    ...serializeVendor(v),
    submittedAt: v.submittedAt,
    bank: serializeBank(bank),
    kycSubmission: serializeSubmission(kyc),
    vehicles: vehicles.map((x) => ({ id: x._id, title: `${x.brandId?.name || ''} ${x.model}`.trim(), registrationNumber: x.registrationNumber, approval: x.approval?.status, status: x.status, isListed: x.isListed, rating: x.rating, trips: x.stats?.trips || 0 })),
    bookingCounts: Object.fromEntries(bookings.map((b) => [b._id, b.n])),
    history: history.map((h) => ({ action: h.action, actor: h.actor, reason: h.reason, at: h.createdAt })),
  });
});

adminVendorsRouter.post('/:id/decision', requirePermission('vendors.manage'), validate({ params: idParams, body: z.object({ action: z.enum(['approve', 'reject', 'suspend', 'reactivate']), reason: z.string().trim().max(500).optional() }).strict() }), async (req, res) => {
  const { action, reason } = req.valid.body;
  const v = await withTransaction(async (session) => {
    const doc = await Vendor.findById(req.valid.params.id).session(session);
    if (!doc) throw notFound('Host');
    if (action !== 'approve' && !reason) throw badRequest('Give a reason.', undefined, 'REASON_REQUIRED');
    if (action === 'approve') {
      if (!['pending_approval', 'rejected'].includes(doc.status)) throw conflict(`Host is ${doc.status}.`, 'INVALID_STATE');
      if (doc.kyc?.status !== 'approved') throw conflict('Approve the host’s KYC first.', 'KYC_NOT_APPROVED');
      const bank = await VendorBankAccount.findOne({ vendorId: doc._id, isActive: true }).session(session);
      if (bank?.verification?.status !== 'verified') throw conflict('Verify the host’s bank account first.', 'BANK_NOT_VERIFIED');
      doc.status = 'approved';
    } else if (action === 'reject') {
      if (doc.status !== 'pending_approval') throw conflict(`Host is ${doc.status}.`, 'INVALID_STATE');
      doc.status = 'rejected';
    } else if (action === 'suspend') {
      if (await Booking.exists({ vendorId: doc._id, status: 'ongoing' }).session(session)) throw conflict('This host has trips in progress. Resolve them first.', 'HAS_ONGOING_TRIP');
      doc.status = 'suspended';
    } else {
      if (doc.status !== 'suspended') throw conflict('Host is not suspended.', 'INVALID_STATE');
      doc.status = 'approved';
    }
    doc.statusReason = reason;
    doc.reviewedAt = new Date();
    doc.reviewedBy = req.auth.id;
    await doc.save({ session });
    await refreshVendorListings(doc._id, session);
    await audit(req, `vendor.${action}`, { type: 'vendor', id: doc._id }, { reason, session });
    return doc;
  });
  if (action === 'suspend') await revokeAllSessions('vendor', v._id, 'suspended');
  if (action === 'approve') notifyLater('vendor.approved', { realm: 'vendor', id: v._id }, {});
  if (action === 'reject') notifyLater('vendor.rejected', { realm: 'vendor', id: v._id }, { reason });
  const upcoming = action === 'suspend' ? await Booking.countDocuments({ vendorId: v._id, status: { $in: ACTIVE_BOOKING_STATUSES } }) : 0;
  ok(res, { ...serializeVendor(v.toObject()), activeBookingsNeedingAttention: upcoming });
});

adminVendorsRouter.post('/:id/bank/verify', requirePermission('vendors.bank.review'), validate({ params: idParams, body: z.object({ decision: z.enum(['verified', 'rejected']), reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  const { decision, reason } = req.valid.body;
  if (decision === 'rejected' && !reason) throw badRequest('Give a reason.', undefined, 'REASON_REQUIRED');
  const bank = await VendorBankAccount.findOneAndUpdate({ vendorId: req.valid.params.id, isActive: true }, { $set: { verification: { status: decision, reviewedBy: req.auth.id, reviewedAt: new Date(), reason } } }, { new: true }).lean();
  if (!bank) throw notFound('Bank account');
  if (decision === 'rejected') await Vendor.updateOne({ _id: req.valid.params.id }, { $pull: { completedSteps: 'bank' } });
  await audit(req, `vendor.bank_${decision}`, { type: 'vendor_bank_account', id: bank._id }, { reason });
  ok(res, serializeBank(bank));
});

// ================================================================= KYC queue
export const adminKycRouter = Router();
adminKycRouter.use(requirePermission('kyc.review'));

adminKycRouter.get('/', validate({ query: z.object({ ...paginationQuery, status: z.enum(['pending', 'approved', 'rejected']).default('pending'), subjectType: z.enum(['user', 'vendor']).optional() }) }), async (req, res) => {
  const { page, limit, status, subjectType } = req.valid.query;
  const filter = { status };
  if (subjectType) filter.subjectType = subjectType;
  const { items, meta } = await paginate(KycSubmission, filter, { page, limit, sort: { createdAt: status === 'pending' ? 1 : -1 } });
  const [users, vendors] = await Promise.all([
    User.find({ _id: { $in: items.filter((i) => i.subjectType === 'user').map((i) => i.subjectId) } }).select('name phone').lean(),
    Vendor.find({ _id: { $in: items.filter((i) => i.subjectType === 'vendor').map((i) => i.subjectId) } }).select('name businessName phone').lean(),
  ]);
  const names = new Map([...users, ...vendors].map((x) => [String(x._id), { name: x.businessName || x.name, phone: x.phone }]));
  ok(res, items.map((s) => ({ ...serializeSubmission(s), subject: names.get(String(s.subjectId)) || null })), meta);
});

adminKycRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const s = await KycSubmission.findById(req.valid.params.id).lean();
  if (!s) throw notFound('KYC submission');
  const Model = s.subjectType === 'user' ? User : Vendor;
  const subject = await Model.findById(s.subjectId).select('name businessName phone email dateOfBirth createdAt').lean();
  await audit(req, 'kyc.viewed', { type: 'kyc_submission', id: s._id });
  ok(res, { ...serializeSubmission(s, { reveal: true }), subject });
});

adminKycRouter.post('/:id/review', validate({
  params: idParams,
  body: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional(), notes: z.string().trim().max(1000).optional(), checks: z.object({ licenceValid: z.boolean().optional(), idValid: z.boolean(), selfieMatches: z.boolean(), ageEligible: z.boolean() }).strict().optional() }).strict(),
}), async (req, res) => {
  const s = await reviewKyc(req, req.valid.params.id, req.valid.body);
  ok(res, serializeSubmission(s.toObject()));
});

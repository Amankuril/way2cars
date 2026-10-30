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
import { serializeBank, bankBodySchema, matchingBankNumbers, replaceBankAccount } from '../vendors/vendor.routes.js';
import { decrypt } from '../../core/crypto.js';
import { getSettings } from '../settings/settings.service.js';
import { commissionBpsFor, hostVisibilityFor } from '../vendors/vendor.model.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { reviewKyc, reviewKycInTransaction, serializeSubmission, latestSubmission, submitKyc, vendorKycSchema } from '../kyc/kyc.service.js';
import { Booking, ACTIVE_BOOKING_STATUSES } from '../bookings/booking.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { refreshVendorListings } from '../vehicles/vehicle.service.js';
import { creditUserWallet, debitUserWallet, serializeLedger } from '../wallet/wallet.service.js';
import { AdminUser } from '../admin/admin.model.js';
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

/**
 * Wallet credit (refund / goodwill / adjustment) or debit (correction) by finance or operations. A reason
 * is mandatory and is shown to the renter in their wallet history; every entry records who made it.
 */
adminUsersRouter.post('/:id/wallet-adjustment', requirePermission('refunds.manage'), validate({
  params: idParams,
  body: z.object({
    direction: z.enum(['credit', 'debit']).default('credit'),
    category: z.enum(['refund', 'adjustment', 'goodwill']).default('adjustment'),
    amountPaise: z.number().int().min(100).max(10_000_000),
    reason: z.string().trim().min(5, 'Enter a reason (at least 5 characters)').max(300),
    bookingRef: z.string().trim().toUpperCase().max(20).optional(),
  }).strict(),
}), async (req, res) => {
  const { direction, category, amountPaise, reason, bookingRef } = req.valid.body;
  const u = await User.exists({ _id: req.valid.params.id });
  if (!u) throw notFound('User');
  const booking = bookingRef ? await Booking.findOne({ ref: bookingRef, userId: req.valid.params.id }).select('_id').lean() : null;
  if (bookingRef && !booking) throw badRequest('No booking with this reference belongs to this customer.', undefined, 'BOOKING_NOT_FOUND');
  const opts = { note: reason, category, bookingId: booking?._id, by: { realm: 'admin', id: req.auth.id } };
  await withTransaction(async (session) => {
    if (direction === 'credit') await creditUserWallet(req.valid.params.id, amountPaise, 'admin_adjustment', opts, session);
    else await debitUserWallet(req.valid.params.id, amountPaise, 'admin_adjustment', opts, session);
    await audit(req, `user.wallet_${direction === 'credit' ? 'credited' : 'debited'}`, { type: 'user', id: req.valid.params.id }, { reason, changes: { amountPaise, category, bookingRef }, session });
  });
  if (direction === 'credit') notifyLater('wallet.credited', { realm: 'user', id: req.valid.params.id }, { amountPaise, reason });
  ok(res, serializeUser(await User.findById(req.valid.params.id).lean()));
});

const withAdmins = async (rows) => {
  const admins = await AdminUser.find({ _id: { $in: rows.filter((r) => r.createdBy?.realm === 'admin').map((r) => r.createdBy.id) } }).select('name email').lean();
  const aMap = new Map(admins.map((a) => [String(a._id), a.name || a.email]));
  const bookings = await Booking.find({ _id: { $in: rows.map((r) => r.bookingId).filter(Boolean) } }).select('ref').lean();
  const bMap = new Map(bookings.map((b) => [String(b._id), b.ref]));
  return rows.map((r) => ({ ...serializeLedger(r), createdBy: r.createdBy?.realm === 'admin' ? { realm: 'admin', name: aMap.get(String(r.createdBy.id)) || 'Admin' } : r.createdBy ? { realm: r.createdBy.realm } : null, bookingRef: r.bookingId ? bMap.get(String(r.bookingId)) : null }));
};

/** A renter's full wallet history (paginated). */
adminUsersRouter.get('/:id/wallet', requirePermission('users.read'), validate({ params: idParams, query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await paginate(LedgerEntry, { 'owner.realm': 'user', 'owner.id': req.valid.params.id }, { ...req.valid.query, sort: { createdAt: -1 } });
  ok(res, await withAdmins(items), meta);
});

/** Every manual wallet credit / debit across customers (finance review). */
export const adminWalletRouter = Router();
adminWalletRouter.get('/transactions', requirePermission('refunds.manage'), validate({ query: z.object({ ...paginationQuery, direction: z.enum(['credit', 'debit']).optional(), category: z.enum(['refund', 'adjustment', 'goodwill']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }), async (req, res) => {
  const { page, limit, direction, category, from, to } = req.valid.query;
  const filter = { 'owner.realm': 'user', type: 'admin_adjustment' };
  if (direction) filter.direction = direction;
  if (category) filter.category = category;
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  const { items, meta } = await paginate(LedgerEntry, filter, { page, limit, sort: { createdAt: -1 } });
  const users = await User.find({ _id: { $in: items.map((i) => i.owner.id) } }).select('name phone').lean();
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  const rows = await withAdmins(items);
  ok(res, rows.map((r, i) => ({ ...r, user: { id: items[i].owner.id, name: uMap.get(String(items[i].owner.id))?.name, phone: uMap.get(String(items[i].owner.id))?.phone } })), meta);
});

// ================================================================= vendors
export const adminVendorsRouter = Router();

adminVendorsRouter.get('/', requirePermission('vendors.read'), validate({ query: z.object({ ...paginationQuery, q: z.string().trim().max(100).optional(), status: z.enum(['onboarding', 'pending_approval', 'approved', 'rejected', 'suspended', 'deleted']).optional(), notStatus: z.enum(['pending_approval', 'deleted']).optional() }) }), async (req, res) => {
  const { page, limit, q, status, notStatus } = req.valid.query;
  const filter = { ...searchFilter(q), isCompany: { $ne: true } };
  if (q && !filter.phone) filter.$or.push({ businessName: new RegExp(escapeRegex(q), 'i') });
  if (status) filter.status = status;
  else if (notStatus) filter.status = { $ne: notStatus };
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
  const settings = await getSettings();
  ok(res, {
    ...serializeVendor(v),
    submittedAt: v.submittedAt,
    effectiveCommissionBps: commissionBpsFor(v, settings),
    effectiveHostVisibility: hostVisibilityFor(v, settings),
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

/** Commission override for one host (null → platform default). Finance sets the money split. */
adminVendorsRouter.patch('/:id/commission', requirePermission('payouts.manage'), validate({ params: idParams, body: z.object({ commissionBps: z.number().int().min(0).max(9000).nullable(), reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  const v = await Vendor.findOneAndUpdate({ _id: req.valid.params.id, isCompany: { $ne: true } }, { $set: { commissionBps: req.valid.body.commissionBps } }, { new: true }).lean();
  if (!v) throw notFound('Host');
  await audit(req, 'vendor.commission_updated', { type: 'vendor', id: v._id }, { changes: { commissionBps: req.valid.body.commissionBps }, reason: req.valid.body.reason });
  ok(res, { ...serializeVendor(v), effectiveCommissionBps: commissionBpsFor(v, await getSettings()) });
});

/** What this host may see about renters and money (unset keys follow platform settings). */
const visibilityFlag = z.boolean().nullable();
adminVendorsRouter.patch('/:id/visibility', requirePermission('vendors.manage'), validate({ params: idParams, body: z.object({ renterName: visibilityFlag, renterPhone: visibilityFlag, renterKycStatus: visibilityFlag, bookingAmounts: visibilityFlag, paymentStatus: visibilityFlag }).partial().strict() }), async (req, res) => {
  const set = {};
  const unset = {};
  for (const [k, val] of Object.entries(req.valid.body)) (val === null ? unset : set)[`hostVisibility.${k}`] = val === null ? 1 : val;
  const v = await Vendor.findOneAndUpdate({ _id: req.valid.params.id, isCompany: { $ne: true } }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true }).lean();
  if (!v) throw notFound('Host');
  await audit(req, 'vendor.visibility_updated', { type: 'vendor', id: v._id }, { changes: req.valid.body });
  ok(res, { ...serializeVendor(v), effectiveHostVisibility: hostVisibilityFor(v, await getSettings()) });
});

/**
 * Operations upload a host's KYC documents for them (papers collected at the office) and, with
 * `approve`, verify them in the same step.
 */
adminVendorsRouter.post('/:id/kyc', requirePermission('vendors.manage'), requirePermission('kyc.review'), validate({
  params: idParams,
  body: vendorKycSchema.extend({ selfieFileId: objectId.optional(), approve: z.boolean().default(false), notes: z.string().trim().max(500).optional() }),
}), async (req, res) => {
  const v = await Vendor.findOne({ _id: req.valid.params.id, isCompany: { $ne: true } }).select('_id status').lean();
  if (!v || v.status === 'deleted') throw notFound('Host');
  const { approve, notes, ...body } = req.valid.body;
  const sub = await submitKyc(req, 'vendor', body, { subjectId: v._id });
  if (approve) await reviewKyc(req, sub._id, { decision: 'approve', notes: notes || 'Documents collected and verified by operations', checks: { idValid: true, selfieMatches: true, ageEligible: true } });
  await audit(req, 'vendor.kyc_uploaded_by_admin', { type: 'vendor', id: v._id }, { changes: { approved: approve } });
  ok(res, serializeSubmission(await latestSubmission('vendor', v._id)));
});

/** Admin enters or replaces a host's bank account (e.g. from a cancelled cheque) — recorded as verified. */
adminVendorsRouter.put('/:id/bank', requirePermission('vendors.bank.review'), validate({ params: idParams, body: matchingBankNumbers(bankBodySchema.extend({ proofFileId: objectId.optional() })) }), async (req, res) => {
  const v = await Vendor.findOne({ _id: req.valid.params.id, isCompany: { $ne: true } }).select('_id').lean();
  if (!v) throw notFound('Host');
  const bank = await replaceBankAccount(req, v._id, req.valid.body, { verifiedBy: req.auth.id });
  ok(res, serializeBank(bank.toObject()));
});

/** Full account number for settling a host — finance only, audited. */
adminVendorsRouter.get('/:id/bank/details', requirePermission('payouts.manage'), validate({ params: idParams }), async (req, res) => {
  const bank = await VendorBankAccount.findOne({ vendorId: req.valid.params.id, isActive: true }).lean();
  if (!bank) throw notFound('Bank account');
  await audit(req, 'vendor.bank_details_viewed', { type: 'vendor_bank_account', id: bank._id });
  ok(res, { accountHolderName: bank.accountHolderName, accountNumber: decrypt(bank.accountNumberEnc), ifsc: bank.ifsc, bankName: bank.bankName, upiId: bank.upiId, verification: bank.verification?.status });
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

/**
 * One-step review of a host request (Admin → Host requests).
 * approve: approves the pending KYC submission (the reviewer attests the ID, selfie and age checks
 *          by approving), verifies the pending bank account and approves the host — all or nothing.
 * reject:  sends the request back with a reason; `reopen` marks which steps the host must redo.
 */
adminVendorsRouter.post('/:id/review', requirePermission('vendors.manage'), requirePermission('kyc.review'), requirePermission('vendors.bank.review'), validate({
  params: idParams,
  body: z.object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(500).optional(),
    reopen: z.object({ kyc: z.boolean().default(false), bank: z.boolean().default(false) }).strict().default({}),
  }).strict(),
}), async (req, res) => {
  const { decision, reason, reopen } = req.valid.body;
  if (decision === 'reject' && !reason) throw badRequest('Give the host a reason so they can fix it.', undefined, 'REASON_REQUIRED');
  const v = await withTransaction(async (session) => {
    const doc = await Vendor.findById(req.valid.params.id).session(session);
    if (!doc) throw notFound('Host');
    if (doc.status !== 'pending_approval') throw conflict(`Host is ${doc.status.replace('_', ' ')}, not waiting for review.`, 'INVALID_STATE');
    const sub = doc.kyc?.submissionId ? await KycSubmission.findById(doc.kyc.submissionId).session(session) : null;
    const bank = await VendorBankAccount.findOne({ vendorId: doc._id, isActive: true }).session(session);
    const reviewedAt = new Date();

    if (decision === 'approve') {
      if (!sub || sub.status === 'rejected') throw conflict('The host has no KYC to approve. Reject the request and ask them to submit it.', 'KYC_MISSING');
      if (!bank || bank.verification?.status === 'rejected') throw conflict('The host has no bank account to verify. Reject the request and ask them to add it.', 'BANK_MISSING');
      if (sub.status === 'pending') {
        await reviewKycInTransaction(req, sub, { decision: 'approve', checks: { idValid: true, selfieMatches: true, ageEligible: true }, notes: 'Approved with the host request' }, session);
      }
      if (bank.verification?.status !== 'verified') {
        bank.verification = { status: 'verified', reviewedBy: req.auth.id, reviewedAt, reason: undefined };
        await bank.save({ session });
        await audit(req, 'vendor.bank_verified', { type: 'vendor_bank_account', id: bank._id }, { session });
      }
      doc.status = 'approved';
      doc.kyc.status = 'approved';
    } else {
      if (reopen.kyc && sub?.status === 'pending') await reviewKycInTransaction(req, sub, { decision: 'reject', reason }, session);
      if (reopen.bank && bank) {
        bank.verification = { status: 'rejected', reviewedBy: req.auth.id, reviewedAt, reason };
        await bank.save({ session });
        await Vendor.updateOne({ _id: doc._id }, { $pull: { completedSteps: 'bank' } }, { session });
        await audit(req, 'vendor.bank_rejected', { type: 'vendor_bank_account', id: bank._id }, { reason, session });
      }
      doc.status = 'rejected';
    }
    doc.statusReason = decision === 'reject' ? reason : undefined;
    doc.reviewedAt = reviewedAt;
    doc.reviewedBy = req.auth.id;
    await doc.save({ session });
    await refreshVendorListings(doc._id, session);
    await audit(req, decision === 'approve' ? 'vendor.approve' : 'vendor.reject', { type: 'vendor', id: doc._id }, { reason, changes: { oneStep: true, reopen }, session });
    return doc;
  });
  notifyLater(decision === 'approve' ? 'vendor.approved' : 'vendor.rejected', { realm: 'vendor', id: v._id }, decision === 'approve' ? {} : { reason });
  ok(res, serializeVendor(v.toObject()));
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

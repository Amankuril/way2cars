import { Router } from 'express';
import { z } from 'zod';
import { ok, created } from '../../core/http.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { decrypt } from '../../core/crypto.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission, requireApprovedVendor } from '../../middleware/auth.js';
import { notify } from '../notifications/notification.service.js';
import { getSettings } from '../settings/settings.service.js';
import { lockForPayout, settlePayout, releaseVendorEarning } from '../wallet/wallet.service.js';
import { LedgerEntry } from '../wallet/wallet.model.js';
import { Vendor, VendorBankAccount } from '../vendors/vendor.model.js';
import { Booking } from '../bookings/booking.model.js';
import { PayoutRequest } from './payout.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const serialize = (p) => ({ id: p._id, amountPaise: p.amountPaise, status: p.status, bank: p.bankSnapshot, utr: p.utr, paidAt: p.paidAt, rejectionReason: p.rejectionReason, createdAt: p.createdAt, reviewedAt: p.reviewedAt });

// ================================================================= vendor
export const vendorEarningsRouter = Router();

vendorEarningsRouter.get('/summary', async (req, res) => {
  const [vendor, settings, monthly, upcoming] = await Promise.all([
    Vendor.findById(req.auth.id).select('wallet').lean(),
    getSettings(),
    LedgerEntry.aggregate([
      { $match: { 'owner.realm': 'vendor', 'owner.id': req.auth.id, type: 'trip_earning', createdAt: { $gte: new Date(Date.now() - 365 * 86400_000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } }, earnedPaise: { $sum: '$amountPaise' }, trips: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { vendorId: req.auth.id, status: { $in: ['confirmed', 'ongoing', 'return_pending'] } } },
      { $group: { _id: null, rentalPaise: { $sum: '$pricing.rentalPaise' }, count: { $sum: 1 } } },
    ]),
  ]);
  ok(res, {
    wallet: vendor.wallet,
    payoutHoldDays: settings.payouts.holdDays,
    minWithdrawalPaise: settings.payouts.minWithdrawalPaise,
    commissionBps: settings.commissionBps,
    monthly: monthly.map((m) => ({ month: m._id, earnedPaise: m.earnedPaise, trips: m.trips })),
    upcoming: { bookings: upcoming[0]?.count || 0, grossRentalPaise: upcoming[0]?.rentalPaise || 0 },
  });
});

vendorEarningsRouter.get('/payouts', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await paginate(PayoutRequest, { vendorId: req.auth.id }, req.valid.query);
  ok(res, items.map(serialize), meta);
});

vendorEarningsRouter.post('/payouts', requireApprovedVendor, validate({ body: z.object({ amountPaise: z.number().int().min(100) }).strict() }), async (req, res) => {
  const { payouts } = await getSettings();
  const amount = req.valid.body.amountPaise;
  if (amount < payouts.minWithdrawalPaise) throw badRequest(`Minimum withdrawal is ₹${payouts.minWithdrawalPaise / 100}.`, undefined, 'BELOW_MINIMUM');
  const bank = await VendorBankAccount.findOne({ vendorId: req.auth.id, isActive: true }).lean();
  if (!bank) throw badRequest('Add your bank account first.', undefined, 'BANK_MISSING');
  if (bank.verification?.status !== 'verified') throw conflict('Your bank account is awaiting verification.', 'BANK_UNVERIFIED');
  if (await PayoutRequest.exists({ vendorId: req.auth.id, status: { $in: ['requested', 'approved'] } })) throw conflict('You already have a withdrawal in progress.', 'PAYOUT_IN_PROGRESS');
  const p = await withTransaction(async (session) => {
    const [doc] = await PayoutRequest.create([{ vendorId: req.auth.id, amountPaise: amount, bankAccountId: bank._id, bankSnapshot: { accountHolderName: bank.accountHolderName, accountNumberLast4: bank.accountNumberLast4, ifsc: bank.ifsc, bankName: bank.bankName } }], { session });
    await lockForPayout(req.auth.id, amount, doc._id, session);
    await audit(req, 'payout.requested', { type: 'payout_request', id: doc._id }, { changes: { amountPaise: amount }, session });
    return doc;
  });
  created(res, serialize(p));
});

// ================================================================= admin (finance)
export const adminPayoutRouter = Router();
adminPayoutRouter.use(requirePermission('payouts.manage'));

adminPayoutRouter.get('/', validate({ query: z.object({ ...paginationQuery, status: z.enum(['requested', 'approved', 'paid', 'rejected']).optional(), vendorId: objectId.optional() }) }), async (req, res) => {
  const { page, limit, status, vendorId } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (vendorId) filter.vendorId = vendorId;
  const { items, meta } = await paginate(PayoutRequest, filter, { page, limit, sort: { createdAt: status === 'requested' ? 1 : -1 }, populate: { path: 'vendorId', select: 'name businessName phone' } });
  ok(res, items.map((p) => ({ ...serialize(p), vendor: p.vendorId })), meta);
});

/** Full bank details for executing the transfer — finance only, audited. */
adminPayoutRouter.get('/:id/bank-details', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const p = await PayoutRequest.findById(req.valid.params.id).lean();
  if (!p) throw notFound('Payout request');
  const bank = await VendorBankAccount.findById(p.bankAccountId).lean();
  await audit(req, 'payout.bank_details_viewed', { type: 'payout_request', id: p._id });
  ok(res, { accountHolderName: bank.accountHolderName, accountNumber: decrypt(bank.accountNumberEnc), ifsc: bank.ifsc, bankName: bank.bankName, upiId: bank.upiId });
});

adminPayoutRouter.post('/:id/decision', validate({
  params: z.object({ id: objectId }),
  body: z.discriminatedUnion('action', [
    z.object({ action: z.literal('approve') }).strict(),
    z.object({ action: z.literal('mark_paid'), utr: z.string().trim().regex(/^[A-Za-z0-9]{8,40}$/, 'Enter the bank UTR / reference'), note: z.string().trim().max(300).optional() }).strict(),
    z.object({ action: z.literal('reject'), reason: z.string().trim().min(5).max(300) }).strict(),
  ]),
}), async (req, res) => {
  const body = req.valid.body;
  const p = await withTransaction(async (session) => {
    const doc = await PayoutRequest.findById(req.valid.params.id).session(session);
    if (!doc) throw notFound('Payout request');
    const allowed = { approve: ['requested'], mark_paid: ['requested', 'approved'], reject: ['requested', 'approved'] };
    if (!allowed[body.action].includes(doc.status)) throw conflict(`This request is already ${doc.status}.`, 'INVALID_PAYOUT_STATE');
    doc.reviewedBy = req.auth.id;
    doc.reviewedAt = new Date();
    if (body.action === 'approve') doc.status = 'approved';
    if (body.action === 'mark_paid') {
      doc.status = 'paid';
      doc.utr = body.utr;
      doc.paidAt = new Date();
      doc.note = body.note;
      await settlePayout(doc.vendorId, doc.amountPaise, doc._id, 'paid', session);
    }
    if (body.action === 'reject') {
      doc.status = 'rejected';
      doc.rejectionReason = body.reason;
      await settlePayout(doc.vendorId, doc.amountPaise, doc._id, 'rejected', session);
    }
    await doc.save({ session });
    await audit(req, `payout.${doc.status}`, { type: 'payout_request', id: doc._id }, { reason: body.reason, changes: { utr: body.utr, amountPaise: doc.amountPaise }, session });
    return doc;
  });
  if (p.status === 'paid') await notify('vendor.payout_paid', { realm: 'vendor', id: p.vendorId }, { amountPaise: p.amountPaise, utr: p.utr });
  if (p.status === 'rejected') await notify('vendor.payout_rejected', { realm: 'vendor', id: p.vendorId }, { reason: p.rejectionReason });
  ok(res, serialize(p.toObject()));
});

/** Job: release host earnings whose hold period has passed. */
export async function releaseDueEarnings() {
  const due = await LedgerEntry.find({ type: 'trip_earning', released: false, releaseAt: { $lte: new Date() } }).limit(200).lean();
  for (const e of due) {
    const v = await withTransaction((session) => releaseVendorEarning(e, session)).catch(() => null);
    if (v) await notify('vendor.earning_released', { realm: 'vendor', id: e.owner.id }, { amountPaise: e.amountPaise }, { dedupeKey: `release:${e._id}` });
  }
  return due.length;
}

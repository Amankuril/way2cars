import { Router } from 'express';
import { z } from 'zod';
import { ok, created } from '../../core/http.js';
import { notFound } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { encrypt, decrypt } from '../../core/crypto.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery, escapeRegex } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { Investor, InvestorPayout } from './investor.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { LedgerEntry } from '../wallet/wallet.model.js';
import { payInvestor, serializeLedger } from '../wallet/wallet.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const idParams = z.object({ id: objectId });

const investorBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').optional().or(z.literal('')),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN').optional().or(z.literal('')),
  bank: z.object({
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().regex(/^\d{9,18}$/, 'Enter a valid account number'),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC'),
    bankName: z.string().trim().max(100).optional(),
    upiId: z.string().trim().regex(/^[\w.-]{2,64}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID').optional().or(z.literal('')),
  }).strict().optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
}).strict();

const serialize = (i) => ({
  id: i._id,
  name: i.name,
  phone: i.phone,
  email: i.email,
  panMasked: i.panMasked,
  bank: i.bank?.accountNumberLast4 ? { accountHolderName: i.bank.accountHolderName, accountNumberMasked: `XXXXXX${i.bank.accountNumberLast4}`, ifsc: i.bank.ifsc, bankName: i.bank.bankName, upiId: i.bank.upiId } : null,
  notes: i.notes,
  isActive: i.isActive,
  wallet: i.wallet,
  createdAt: i.createdAt,
});

function toDoc(body) {
  const { pan, bank, ...rest } = body;
  const doc = { ...rest };
  if (pan !== undefined) Object.assign(doc, pan ? { panEnc: encrypt(pan), panMasked: `XXXXXX${pan.slice(-4)}` } : { panEnc: undefined, panMasked: undefined });
  if (bank) doc.bank = { accountHolderName: bank.accountHolderName, accountNumberEnc: encrypt(bank.accountNumber), accountNumberLast4: bank.accountNumber.slice(-4), ifsc: bank.ifsc, bankName: bank.bankName, upiId: bank.upiId || undefined };
  return doc;
}

/** Investors of fleet cars: profiles, bank details, cars, earnings and payouts (finance). */
export const adminInvestorRouter = Router();

adminInvestorRouter.get('/', requirePermission('payments.read'), validate({ query: z.object({ ...paginationQuery, q: z.string().trim().max(100).optional(), active: z.enum(['true', 'false']).optional() }) }), async (req, res) => {
  const { page, limit, q, active } = req.valid.query;
  const filter = {};
  if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { phone: new RegExp(escapeRegex(q)) }];
  if (active) filter.isActive = active === 'true';
  const { items, meta } = await paginate(Investor, filter, { page, limit, sort: { name: 1 } });
  const cars = await Vehicle.aggregate([{ $match: { 'investor.investorId': { $in: items.map((i) => i._id) } } }, { $group: { _id: '$investor.investorId', n: { $sum: 1 } } }]);
  const cMap = new Map(cars.map((c) => [String(c._id), c.n]));
  ok(res, items.map((i) => ({ ...serialize(i), cars: cMap.get(String(i._id)) || 0 })), meta);
});

adminInvestorRouter.post('/', requirePermission('payouts.manage'), validate({ body: investorBody }), async (req, res) => {
  const inv = await Investor.create(toDoc(req.valid.body));
  await audit(req, 'investor.created', { type: 'investor', id: inv._id }, { changes: { name: inv.name } });
  created(res, serialize(inv.toObject()));
});

adminInvestorRouter.get('/:id', requirePermission('payments.read'), validate({ params: idParams }), async (req, res) => {
  const inv = await Investor.findById(req.valid.params.id).lean();
  if (!inv) throw notFound('Investor');
  const [cars, ledger, payouts] = await Promise.all([
    Vehicle.find({ 'investor.investorId': inv._id }).select('model variant registrationNumber investor isListed stats').populate('brandId', 'name').lean(),
    LedgerEntry.find({ 'owner.realm': 'investor', 'owner.id': inv._id }).sort({ createdAt: -1 }).limit(100).populate('bookingId', 'ref').lean(),
    InvestorPayout.find({ investorId: inv._id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  ok(res, {
    ...serialize(inv),
    cars: cars.map((c) => ({ id: c._id, title: [c.brandId?.name, c.model, c.variant].filter(Boolean).join(' '), registrationNumber: c.registrationNumber, shareBps: c.investor?.shareBps, isListed: c.isListed, trips: c.stats?.trips || 0 })),
    ledger: ledger.map((e) => ({ ...serializeLedger({ ...e, bookingId: e.bookingId?._id }), bookingRef: e.bookingId?.ref })),
    payouts: payouts.map((p) => ({ id: p._id, amountPaise: p.amountPaise, utr: p.utr, note: p.note, paidAt: p.paidAt, bank: p.bankSnapshot })),
  });
});

adminInvestorRouter.patch('/:id', requirePermission('payouts.manage'), validate({ params: idParams, body: investorBody.partial() }), async (req, res) => {
  const inv = await Investor.findByIdAndUpdate(req.valid.params.id, { $set: toDoc(req.valid.body) }, { new: true, runValidators: true }).lean();
  if (!inv) throw notFound('Investor');
  await audit(req, 'investor.updated', { type: 'investor', id: inv._id }, { changes: { fields: Object.keys(req.valid.body), bankChanged: Boolean(req.valid.body.bank) } });
  ok(res, serialize(inv));
});

/** Full bank details for making the transfer — audited. */
adminInvestorRouter.get('/:id/bank-details', requirePermission('payouts.manage'), validate({ params: idParams }), async (req, res) => {
  const inv = await Investor.findById(req.valid.params.id).lean();
  if (!inv?.bank?.accountNumberEnc) throw notFound('Bank details');
  await audit(req, 'investor.bank_details_viewed', { type: 'investor', id: inv._id });
  ok(res, { accountHolderName: inv.bank.accountHolderName, accountNumber: decrypt(inv.bank.accountNumberEnc), ifsc: inv.bank.ifsc, bankName: inv.bank.bankName, upiId: inv.bank.upiId });
});

/** Records a bank transfer to the investor and reduces their unpaid balance. */
adminInvestorRouter.post('/:id/payouts', requirePermission('payouts.manage'), validate({
  params: idParams,
  body: z.object({ amountPaise: z.number().int().min(100), utr: z.string().trim().regex(/^[A-Za-z0-9]{8,40}$/, 'Enter the bank UTR / reference'), note: z.string().trim().max(300).optional() }).strict(),
}), async (req, res) => {
  const inv = await Investor.findById(req.valid.params.id).lean();
  if (!inv) throw notFound('Investor');
  const { amountPaise, utr, note } = req.valid.body;
  const p = await withTransaction(async (session) => {
    const [doc] = await InvestorPayout.create([{ investorId: inv._id, amountPaise, utr, note, paidBy: req.auth.id, paidAt: new Date(), bankSnapshot: inv.bank ? { accountHolderName: inv.bank.accountHolderName, accountNumberLast4: inv.bank.accountNumberLast4, ifsc: inv.bank.ifsc, bankName: inv.bank.bankName } : undefined }], { session });
    await payInvestor(inv._id, amountPaise, doc._id, { realm: 'admin', id: req.auth.id }, session);
    await audit(req, 'investor.paid', { type: 'investor', id: inv._id }, { changes: { amountPaise, utr }, session });
    return doc;
  });
  created(res, { id: p._id, amountPaise: p.amountPaise, utr: p.utr, paidAt: p.paidAt });
});

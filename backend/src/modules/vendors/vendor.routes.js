import { Router } from 'express';
import { z } from 'zod';
import { ok, created } from '../../core/http.js';
import { badRequest, conflict } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { encrypt } from '../../core/crypto.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { Vendor, VendorBankAccount, VENDOR_ONBOARDING_STEPS } from './vendor.model.js';
import { serializeVendor } from './vendor.serializer.js';
import { submitKyc, vendorKycSchema, latestSubmission, serializeSubmission } from '../kyc/kyc.service.js';
import { claimFiles, attachFiles } from '../files/files.service.js';
import { City } from '../catalog/catalog.model.js';
import { LedgerEntry } from '../wallet/wallet.model.js';
import { serializeLedger } from '../wallet/wallet.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const name = z.string().trim().min(2).max(100).regex(/^[\p{L} .'-]+$/u, 'Use letters only');

export const serializeBank = (b) => b && ({
  id: b._id,
  accountHolderName: b.accountHolderName,
  accountNumberMasked: `XXXXXX${b.accountNumberLast4}`,
  ifsc: b.ifsc,
  bankName: b.bankName,
  upiId: b.upiId,
  proofFileId: b.proofFileId,
  verification: { status: b.verification?.status, reason: b.verification?.reason, reviewedAt: b.verification?.reviewedAt },
  createdAt: b.createdAt,
});

const editable = (v) => ['onboarding', 'rejected', 'pending_approval', 'approved'].includes(v.status);

export const vendorAccountRouter = Router();

vendorAccountRouter.get('/me', async (req, res) => ok(res, serializeVendor(await Vendor.findById(req.auth.id).lean())));

vendorAccountRouter.put('/me/profile', validate({ body: z.object({ name, email: z.string().trim().toLowerCase().email().max(200) }).strict() }), async (req, res) => {
  const v = await Vendor.findByIdAndUpdate(req.auth.id, { $set: req.valid.body, $addToSet: { completedSteps: 'profile' } }, { new: true, runValidators: true }).lean();
  ok(res, serializeVendor(v));
});

vendorAccountRouter.put('/me/business', validate({
  body: z.object({
    businessType: z.enum(['individual', 'company']),
    businessName: z.string().trim().max(150).optional(),
    gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN').optional().or(z.literal('')),
    cityId: objectId,
    address: z.object({ line1: z.string().trim().min(3).max(200), line2: z.string().trim().max(200).optional(), city: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(80), pincode: z.string().regex(/^\d{6}$/) }).strict(),
  }).strict().refine((b) => b.businessType === 'individual' || b.businessName, { message: 'Company name is required', path: ['businessName'] }),
}), async (req, res) => {
  const body = req.valid.body;
  if (!(await City.exists({ _id: body.cityId, isActive: true }))) throw badRequest('Choose a supported city.');
  const current = await Vendor.findById(req.auth.id).select('status').lean();
  if (!editable(current)) throw conflict('Your account cannot be edited right now.');
  const set = { ...body, gstin: body.gstin || undefined };
  const v = await Vendor.findByIdAndUpdate(req.auth.id, { $set: set, $addToSet: { completedSteps: 'business' } }, { new: true, runValidators: true }).lean();
  ok(res, serializeVendor(v));
});

vendorAccountRouter.get('/me/kyc', async (req, res) => {
  const [v, sub] = await Promise.all([Vendor.findById(req.auth.id).select('kyc').lean(), latestSubmission('vendor', req.auth.id)]);
  ok(res, { status: v.kyc?.status || 'not_submitted', rejectionReason: v.kyc?.rejectionReason || null, submission: serializeSubmission(sub) });
});
vendorAccountRouter.post('/me/kyc', validate({ body: vendorKycSchema }), async (req, res) => {
  created(res, serializeSubmission((await submitKyc(req, 'vendor', req.valid.body)).toObject()));
});

vendorAccountRouter.get('/me/bank', async (req, res) => {
  const b = await VendorBankAccount.findOne({ vendorId: req.auth.id, isActive: true }).lean();
  ok(res, serializeBank(b));
});

/** Replacing bank details always resets verification — payouts wait for finance to verify again. */
vendorAccountRouter.put('/me/bank', validate({
  body: z.object({
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().regex(/^\d{9,18}$/, 'Enter a valid account number'),
    confirmAccountNumber: z.string(),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC'),
    bankName: z.string().trim().max(100).optional(),
    upiId: z.string().trim().regex(/^[\w.-]{2,64}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID').optional().or(z.literal('')),
    proofFileId: objectId,
  }).strict().refine((b) => b.accountNumber === b.confirmAccountNumber, { message: 'Account numbers do not match', path: ['confirmAccountNumber'] }),
}), async (req, res) => {
  const b = req.valid.body;
  const bank = await withTransaction(async (session) => {
    await claimFiles(req.auth, [b.proofFileId], ['bank_proof'], { session });
    await VendorBankAccount.updateMany({ vendorId: req.auth.id, isActive: true }, { $set: { isActive: false } }, { session });
    const [acc] = await VendorBankAccount.create([{
      vendorId: req.auth.id,
      accountHolderName: b.accountHolderName,
      accountNumberEnc: encrypt(b.accountNumber),
      accountNumberLast4: b.accountNumber.slice(-4),
      ifsc: b.ifsc,
      bankName: b.bankName,
      upiId: b.upiId || undefined,
      proofFileId: b.proofFileId,
    }], { session });
    await attachFiles([b.proofFileId], { type: 'vendor_bank_account', id: acc._id }, session);
    await Vendor.updateOne({ _id: req.auth.id }, { $set: { bankAccountId: acc._id }, $addToSet: { completedSteps: 'bank' } }, { session });
    await audit(req, 'vendor.bank_updated', { type: 'vendor_bank_account', id: acc._id }, { session });
    return acc;
  });
  ok(res, serializeBank(bank.toObject()));
});

vendorAccountRouter.post('/me/onboarding/submit', async (req, res) => {
  const v = await Vendor.findById(req.auth.id);
  const missing = VENDOR_ONBOARDING_STEPS.filter((s) => !v.completedSteps.includes(s));
  if (missing.length) throw badRequest('Complete every onboarding step first.', { missing }, 'ONBOARDING_INCOMPLETE');
  if (!['onboarding', 'rejected'].includes(v.status)) throw conflict('Your application is already submitted.', 'ALREADY_SUBMITTED');
  v.status = 'pending_approval';
  v.submittedAt = new Date();
  v.statusReason = undefined;
  await v.save();
  await audit(req, 'vendor.submitted', { type: 'vendor', id: v._id });
  ok(res, serializeVendor(v.toObject()));
});

vendorAccountRouter.put('/me/notification-prefs', validate({ body: z.object({ push: z.boolean(), sms: z.boolean(), email: z.boolean(), promotional: z.boolean() }).strict() }), async (req, res) => {
  const v = await Vendor.findByIdAndUpdate(req.auth.id, { $set: { notificationPrefs: req.valid.body } }, { new: true }).lean();
  ok(res, v.notificationPrefs);
});

vendorAccountRouter.get('/earnings/ledger', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await paginate(LedgerEntry, { 'owner.realm': 'vendor', 'owner.id': req.auth.id }, req.valid.query);
  ok(res, items.map(serializeLedger), meta);
});

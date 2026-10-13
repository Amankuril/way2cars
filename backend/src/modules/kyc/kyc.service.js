import { z } from 'zod';
import { withTransaction } from '../../core/db.js';
import { encrypt, decrypt } from '../../core/crypto.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { claimFiles, attachFiles, registerFileAccessRule } from '../files/files.service.js';
import { notifyLater } from '../notifications/notification.service.js';
import { KycSubmission, ID_PROOF_TYPES } from './kyc.model.js';
import { User } from '../users/user.model.js';
import { Vendor } from '../vendors/vendor.model.js';

const fileId = z.string().regex(/^[a-f0-9]{24}$/);
const ID_FORMATS = {
  aadhaar: /^\d{12}$/,
  passport: /^[A-Z][0-9]{7}$/,
  voter_id: /^[A-Z]{3}[0-9]{7}$/,
};

export const userKycSchema = z.object({
  licenceNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[0-9]{2}[ -]?[0-9]{4}[0-9]{7}$/, 'Enter a valid driving licence number, e.g. MH1420110012345'),
  licenceExpiry: z.coerce.date(),
  licenceFrontFileId: fileId,
  licenceBackFileId: fileId,
  idProofType: z.enum(ID_PROOF_TYPES),
  idProofNumber: z.string().trim().toUpperCase().max(20),
  idProofFrontFileId: fileId,
  idProofBackFileId: fileId.optional(),
  selfieFileId: fileId,
  dateOfBirth: z.coerce.date(),
}).strict();

export const vendorKycSchema = z.object({
  idProofType: z.enum(ID_PROOF_TYPES),
  idProofNumber: z.string().trim().toUpperCase().max(20),
  idProofFrontFileId: fileId,
  idProofBackFileId: fileId.optional(),
  panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN'),
  panFileId: fileId,
  selfieFileId: fileId,
  dateOfBirth: z.coerce.date(),
}).strict();

const mask = (v, keep = 4) => `${'•'.repeat(Math.max(v.length - keep, 0))}${v.slice(-keep)}`;
const yearsBetween = (a, b) => (b - a) / (365.25 * 86400_000);

function validateId(type, number) {
  const normalized = number.replace(/\s|-/g, '');
  if (!ID_FORMATS[type].test(normalized)) throw badRequest(`Enter a valid ${type.replace('_', ' ')} number.`, undefined, 'KYC_ID_INVALID');
  // Aadhaar: never persist the full number.
  return type === 'aadhaar'
    ? { numberMasked: `XXXX XXXX ${normalized.slice(-4)}` }
    : { numberEnc: encrypt(normalized), numberMasked: mask(normalized) };
}

const MODELS = { user: User, vendor: Vendor };

/** Creates a new KYC submission (any previous pending one is superseded). */
export async function submitKyc(req, realm, body) {
  const now = new Date();
  const age = yearsBetween(body.dateOfBirth, now);
  if (realm === 'user') {
    if (age < 21) throw badRequest('Drivers must be at least 21 years old.', undefined, 'KYC_UNDERAGE');
    if (body.licenceExpiry < new Date(now.getTime() + 30 * 86400_000)) throw badRequest('Your driving licence must be valid for at least 30 more days.', undefined, 'KYC_LICENCE_EXPIRING');
  } else if (age < 18) {
    throw badRequest('Hosts must be at least 18 years old.', undefined, 'KYC_UNDERAGE');
  }
  const account = await MODELS[realm].findById(req.auth.id).select('kyc').lean();
  if (account.kyc?.status === 'approved') throw conflict('Your verification is already approved.', 'KYC_ALREADY_APPROVED');

  const docPurposes = ['kyc_document'];
  const ids = [body.idProofFrontFileId, body.idProofBackFileId, body.licenceFrontFileId, body.licenceBackFileId, body.panFileId].filter(Boolean);

  return withTransaction(async (session) => {
    await claimFiles(req.auth, ids, docPurposes, { session });
    await claimFiles(req.auth, [body.selfieFileId], ['kyc_selfie'], { session });

    await KycSubmission.updateMany({ subjectType: realm, subjectId: req.auth.id, status: 'pending' }, { $set: { status: 'superseded' } }, { session });
    const doc = {
      subjectType: realm,
      subjectId: req.auth.id,
      idProof: { type: body.idProofType, ...validateId(body.idProofType, body.idProofNumber), frontFileId: body.idProofFrontFileId, backFileId: body.idProofBackFileId },
      selfieFileId: body.selfieFileId,
      dateOfBirth: body.dateOfBirth,
    };
    if (realm === 'user') {
      const lic = body.licenceNumber.replace(/[ -]/g, '');
      doc.licence = { numberEnc: encrypt(lic), numberMasked: mask(lic), expiry: body.licenceExpiry, frontFileId: body.licenceFrontFileId, backFileId: body.licenceBackFileId };
    } else {
      doc.pan = { numberEnc: encrypt(body.panNumber), numberMasked: mask(body.panNumber), fileId: body.panFileId };
    }
    const [submission] = await KycSubmission.create([doc], { session });
    await attachFiles([...ids, body.selfieFileId], { type: 'kyc_submission', id: submission._id }, session);

    const set = { kyc: { status: 'pending', submissionId: submission._id, submittedAt: now, licenceExpiry: body.licenceExpiry } };
    if (realm === 'user') set.dateOfBirth = body.dateOfBirth;
    const update = { $set: set };
    if (realm === 'vendor') update.$addToSet = { completedSteps: 'kyc' };
    await MODELS[realm].updateOne({ _id: req.auth.id }, update, { session });
    await audit(req, 'kyc.submitted', { type: 'kyc_submission', id: submission._id }, { session });
    return submission;
  });
}

export function serializeSubmission(s, { reveal = false } = {}) {
  if (!s) return null;
  const out = {
    id: s._id,
    subjectType: s.subjectType,
    subjectId: s.subjectId,
    status: s.status,
    dateOfBirth: s.dateOfBirth,
    licence: s.licence?.numberMasked ? { numberMasked: s.licence.numberMasked, expiry: s.licence.expiry, frontFileId: s.licence.frontFileId, backFileId: s.licence.backFileId } : null,
    idProof: s.idProof?.type ? { type: s.idProof.type, numberMasked: s.idProof.numberMasked, frontFileId: s.idProof.frontFileId, backFileId: s.idProof.backFileId } : null,
    pan: s.pan?.numberMasked ? { numberMasked: s.pan.numberMasked, fileId: s.pan.fileId } : null,
    selfieFileId: s.selfieFileId,
    review: s.review ? { at: s.review.at, reason: s.review.reason, checks: s.review.checks, notes: reveal ? s.review.notes : undefined } : null,
    createdAt: s.createdAt,
  };
  if (reveal) {
    // Reviewers see full numbers to compare with the document images.
    if (s.licence?.numberEnc) out.licence.number = decrypt(s.licence.numberEnc);
    if (s.idProof?.numberEnc) out.idProof.number = decrypt(s.idProof.numberEnc);
    if (s.pan?.numberEnc) out.pan.number = decrypt(s.pan.numberEnc);
  }
  return out;
}

export async function latestSubmission(realm, subjectId) {
  return KycSubmission.findOne({ subjectType: realm, subjectId, status: { $ne: 'superseded' } }).sort({ createdAt: -1 }).lean();
}

/** Admin decision. Approval requires the reviewer to confirm every manual check. */
export async function reviewKyc(req, submissionId, { decision, reason, notes, checks }) {
  return withTransaction(async (session) => {
    const sub = await KycSubmission.findById(submissionId).session(session);
    if (!sub) throw notFound('KYC submission');
    if (sub.status !== 'pending') throw conflict('This submission has already been reviewed.', 'KYC_ALREADY_REVIEWED');
    if (decision === 'approve') {
      const required = sub.subjectType === 'user' ? ['licenceValid', 'idValid', 'selfieMatches', 'ageEligible'] : ['idValid', 'selfieMatches', 'ageEligible'];
      const missing = required.filter((k) => !checks?.[k]);
      if (missing.length) throw badRequest('Confirm every verification check before approving.', { missing }, 'KYC_CHECKS_INCOMPLETE');
    } else if (!reason) {
      throw badRequest('Give the applicant a reason so they can fix it.', undefined, 'KYC_REASON_REQUIRED');
    }
    sub.status = decision === 'approve' ? 'approved' : 'rejected';
    sub.review = { by: req.auth.id, at: new Date(), reason: decision === 'reject' ? reason : undefined, notes, checks };
    await sub.save({ session });
    await MODELS[sub.subjectType].updateOne(
      { _id: sub.subjectId, 'kyc.submissionId': sub._id },
      { $set: { 'kyc.status': sub.status, 'kyc.reviewedAt': new Date(), 'kyc.rejectionReason': decision === 'reject' ? reason : null } },
      { session },
    );
    if (decision === 'reject' && sub.subjectType === 'vendor') {
      await Vendor.updateOne({ _id: sub.subjectId }, { $pull: { completedSteps: 'kyc' } }, { session });
    }
    await audit(req, `kyc.${sub.status}`, { type: 'kyc_submission', id: sub._id }, { reason, changes: { subjectType: sub.subjectType, subjectId: sub.subjectId, checks }, session });
    return sub;
  }).then((sub) => {
    if (sub.subjectType === 'user') notifyLater(sub.status === 'approved' ? 'kyc.approved' : 'kyc.rejected', { realm: 'user', id: sub.subjectId }, { reason });
    return sub;
  });
}

// Owners read their own KYC files via the default owner rule; nobody else except permitted admins.
registerFileAccessRule('kyc_document', async () => false);
registerFileAccessRule('kyc_selfie', async () => false);

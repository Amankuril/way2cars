import mongoose from 'mongoose';

export const ID_PROOF_TYPES = ['aadhaar', 'passport', 'voter_id'];
const oid = mongoose.Schema.Types.ObjectId;

const schema = new mongoose.Schema(
  {
    subjectType: { type: String, enum: ['user', 'vendor'], required: true },
    subjectId: { type: oid, required: true },
    // Driving licence — required for renters.
    licence: {
      numberEnc: String,
      numberMasked: String,
      expiry: Date,
      frontFileId: { type: oid, ref: 'File' },
      backFileId: { type: oid, ref: 'File' },
    },
    // Government ID. Aadhaar: only the last 4 digits are kept (masked Aadhaar recommended).
    idProof: {
      type: { type: String, enum: ID_PROOF_TYPES },
      numberEnc: String,
      numberMasked: String,
      frontFileId: { type: oid, ref: 'File' },
      backFileId: { type: oid, ref: 'File' },
    },
    // PAN — required for hosts (payouts / TDS).
    pan: { numberEnc: String, numberMasked: String, fileId: { type: oid, ref: 'File' } },
    selfieFileId: { type: oid, ref: 'File' },
    dateOfBirth: Date,
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'superseded'], default: 'pending' },
    review: {
      by: { type: oid, ref: 'AdminUser' },
      at: Date,
      reason: String,
      notes: String,
      checks: { licenceValid: Boolean, idValid: Boolean, selfieMatches: Boolean, ageEligible: Boolean },
    },
    // Integration boundary for automated verification (face match, DL check) — no provider yet.
    automated: { provider: String, status: String, score: Number, ref: String },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ subjectType: 1, subjectId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });

export const KycSubmission = mongoose.model('KycSubmission', schema, 'kyc_submissions');

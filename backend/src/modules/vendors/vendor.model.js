import mongoose from 'mongoose';
import { geoPoint, kycSummary, notificationPrefs } from '../../core/schemas.js';

export const VENDOR_ONBOARDING_STEPS = ['profile', 'business', 'kyc', 'bank'];

const schema = new mongoose.Schema(
  {
    phone: { type: String, trim: true },
    deletedPhone: String,
    name: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    avatarFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    businessType: { type: String, enum: ['individual', 'company'], default: 'individual' },
    businessName: { type: String, trim: true, maxlength: 150 },
    gstin: { type: String, trim: true, uppercase: true, match: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      location: geoPoint,
    },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
    // onboarding → pending_approval → approved | rejected; suspended at any time by admins
    status: {
      type: String,
      enum: ['onboarding', 'pending_approval', 'approved', 'rejected', 'suspended', 'deleted'],
      default: 'onboarding',
      index: true,
    },
    statusReason: String,
    completedSteps: { type: [String], default: [] },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    kyc: { type: kycSummary, default: () => ({}) },
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorBankAccount' },
    wallet: {
      pendingPaise: { type: Number, default: 0, min: 0 }, // earned, inside hold period
      availablePaise: { type: Number, default: 0, min: 0 }, // withdrawable
      lockedPaise: { type: Number, default: 0, min: 0 }, // requested for withdrawal
      lifetimeEarnedPaise: { type: Number, default: 0, min: 0 },
      lifetimePaidOutPaise: { type: Number, default: 0, min: 0 },
    },
    rating: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    responseStats: { accepted: { type: Number, default: 0 }, rejected: { type: Number, default: 0 } },
    notificationPrefs: { type: notificationPrefs, default: () => ({}) },
    lastLoginAt: Date,
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
schema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
schema.index({ status: 1, submittedAt: -1 });
schema.index({ name: 'text', businessName: 'text', email: 'text' });

export const Vendor = mongoose.model('Vendor', schema, 'vendor_accounts');

const bank = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    accountHolderName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumberEnc: { type: String, required: true }, // AES-GCM, see core/crypto
    accountNumberLast4: { type: String, required: true },
    ifsc: { type: String, required: true, uppercase: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
    bankName: String,
    upiId: { type: String, trim: true, maxlength: 100 },
    proofFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' }, // cancelled cheque / passbook
    verification: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
      reviewedAt: Date,
      reason: String,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);
export const VendorBankAccount = mongoose.model('VendorBankAccount', bank, 'vendor_bank_accounts');

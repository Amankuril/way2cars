import mongoose from 'mongoose';
import { geoPoint, kycSummary, notificationPrefs } from '../../core/schemas.js';

const address = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    pincode: { type: String, trim: true, match: /^\d{6}$/ },
    location: geoPoint,
    placeId: String,
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const schema = new mongoose.Schema(
  {
    phone: { type: String, trim: true }, // null after account deletion
    deletedPhone: String,
    name: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    dateOfBirth: Date,
    avatarFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    status: { type: String, enum: ['active', 'pending_approval', 'suspended', 'deleted'], default: 'active', index: true },
    statusReason: String,
    profileCompleted: { type: Boolean, default: false },
    addresses: { type: [address], default: [] },
    kyc: { type: kycSummary, default: () => ({}) },
    walletBalancePaise: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, required: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    razorpayCustomerId: String,
    notificationPrefs: { type: notificationPrefs, default: () => ({}) },
    stats: {
      tripsCompleted: { type: Number, default: 0 },
      totalSpentPaise: { type: Number, default: 0 },
    },
    homeCityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
    lastLoginAt: Date,
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
schema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
schema.index({ referralCode: 1 }, { unique: true });
schema.index({ 'kyc.status': 1, updatedAt: -1 });
schema.index({ createdAt: -1 });
schema.index({ name: 'text', email: 'text' });

export const User = mongoose.model('User', schema, 'user_accounts');

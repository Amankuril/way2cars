import mongoose from 'mongoose';

/** Reusable sub-schemas shared by several models. */

export const geoPoint = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number], // [lng, lat]
      validate: {
        validator: (v) => !v || (v.length === 2 && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90),
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false },
);

export const KYC_STATUSES = ['not_submitted', 'pending', 'approved', 'rejected'];
export const kycSummary = new mongoose.Schema(
  {
    status: { type: String, enum: KYC_STATUSES, default: 'not_submitted' },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'KycSubmission' },
    submittedAt: Date,
    reviewedAt: Date,
    rejectionReason: String,
    licenceExpiry: Date,
  },
  { _id: false },
);

export const notificationPrefs = new mongoose.Schema(
  {
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    promotional: { type: Boolean, default: true },
  },
  { _id: false },
);

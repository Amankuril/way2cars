import mongoose from 'mongoose';

/**
 * Platform-wide business settings, editable by super admins. Stored as a single document
 * (_id: 'platform'). Every change bumps `version` and is audited.
 */
const tier = new mongoose.Schema(
  { minHoursBeforeStart: { type: Number, required: true, min: 0 }, refundBps: { type: Number, required: true, min: 0, max: 10000 } },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    _id: { type: String, default: 'platform' },
    version: { type: Number, default: 1 },
    tax: {
      rentalGstBps: { type: Number, default: 1800, min: 0, max: 5000 },
      gstin: { type: String, default: '' },
      legalName: { type: String, default: 'WAY2CARS Technology Pvt Ltd' },
      registeredAddress: { type: String, default: '' },
      stateCode: { type: String, default: '' },
      sacCode: { type: String, default: '996601' },
    },
    fees: {
      convenienceFeePaise: { type: Number, default: 9900, min: 0 },
      deliveryBaseFeePaise: { type: Number, default: 29900, min: 0 },
      deliveryPerKmPaise: { type: Number, default: 1500, min: 0 },
      deliveryMaxKm: { type: Number, default: 25, min: 0 },
    },
    commissionBps: { type: Number, default: 2000, min: 0, max: 9000 },
    booking: {
      holdMinutes: { type: Number, default: 15, min: 5, max: 60 },
      minDurationHours: { type: Number, default: 4, min: 1, max: 48 },
      maxDurationDays: { type: Number, default: 30, min: 1, max: 180 },
      minLeadMinutes: { type: Number, default: 60, min: 0 },
      maxAdvanceDays: { type: Number, default: 90, min: 1 },
      bufferMinutes: { type: Number, default: 60, min: 0, max: 720 },
      vendorApprovalSlaMinutes: { type: Number, default: 120, min: 10 },
      pickupWindowMinutesBefore: { type: Number, default: 30, min: 0 },
      kycRequired: { type: Boolean, default: true },
      requireUserApproval: { type: Boolean, default: false },
    },
    cancellation: {
      tiers: {
        type: [tier],
        default: () => [
          { minHoursBeforeStart: 24, refundBps: 10000 },
          { minHoursBeforeStart: 6, refundBps: 5000 },
          { minHoursBeforeStart: 0, refundBps: 0 },
        ],
      },
      feePaise: { type: Number, default: 0, min: 0 },
    },
    trip: {
      lateGraceMinutes: { type: Number, default: 30, min: 0 },
      lateFeeMultiplierBps: { type: Number, default: 15000, min: 10000 },
      fuelChargePerEighthPaise: { type: Number, default: 40000, min: 0 },
      returnReviewHours: { type: Number, default: 24, min: 1 },
      minPickupPhotos: { type: Number, default: 4, min: 1, max: 12 },
    },
    payouts: {
      holdDays: { type: Number, default: 3, min: 0, max: 60 },
      minWithdrawalPaise: { type: Number, default: 50000, min: 100 },
    },
    referral: {
      enabled: { type: Boolean, default: true },
      referrerRewardPaise: { type: Number, default: 20000, min: 0 },
      refereeRewardPaise: { type: Number, default: 10000, min: 0 },
    },
    loyalty: {
      enabled: { type: Boolean, default: true },
      earnBps: { type: Number, default: 200, min: 0, max: 2000 },
    },
    wallet: { maxRedeemBps: { type: Number, default: 2000, min: 0, max: 10000 } },
    support: {
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      emergencyPhone: { type: String, default: '112' },
      roadsidePhone: { type: String, default: '' },
      hours: { type: String, default: '24×7' },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, versionKey: false, minimize: false },
);

export const Settings = mongoose.model('Settings', schema, 'admin_settings');

import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

const schema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z0-9]{4,20}$/ },
    title: { type: String, required: true, maxlength: 80 },
    description: { type: String, maxlength: 300 },
    campaign: { type: String, enum: ['discount', 'referral', 'festival', 'first_ride'], default: 'discount' },
    type: { type: String, enum: ['percent', 'flat'], required: true },
    valueBps: { type: Number, min: 1, max: 10000 },
    valuePaise: { type: Number, min: 100 },
    maxDiscountPaise: { type: Number, min: 0 },
    minRentalPaise: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    usageLimit: { type: Number, min: 1 }, // total redemptions; null = unlimited
    usedCount: { type: Number, default: 0 }, // reserved + redeemed
    perUserLimit: { type: Number, default: 1, min: 1 },
    firstBookingOnly: { type: Boolean, default: false },
    cityIds: [{ type: oid, ref: 'City' }],
    categoryIds: [{ type: oid, ref: 'Category' }],
    userIds: [{ type: oid, ref: 'User' }], // restrict to specific users (e.g. goodwill coupons)
    isPublic: { type: Boolean, default: true }, // listed under offers
    isActive: { type: Boolean, default: true },
    createdBy: { type: oid, ref: 'AdminUser' },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ code: 1 }, { unique: true });
schema.index({ isActive: 1, isPublic: 1, endsAt: 1 });
export const Coupon = mongoose.model('Coupon', schema, 'admin_coupons');

const redemption = new mongoose.Schema(
  {
    couponId: { type: oid, ref: 'Coupon', required: true },
    code: String,
    userId: { type: oid, ref: 'User', required: true },
    bookingId: { type: oid, ref: 'Booking', required: true },
    discountPaise: { type: Number, required: true },
    status: { type: String, enum: ['reserved', 'redeemed', 'released'], default: 'reserved' },
  },
  { timestamps: true, versionKey: false },
);
redemption.index({ bookingId: 1 }, { unique: true });
redemption.index({ couponId: 1, userId: 1, status: 1 });
redemption.index({ couponId: 1, createdAt: -1 });
export const CouponRedemption = mongoose.model('CouponRedemption', redemption, 'coupon_redemptions');

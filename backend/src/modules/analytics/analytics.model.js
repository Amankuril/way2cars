import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

/** Funnel events sent by the renter app (and web replica). Kept 13 months. */
export const ANALYTICS_EVENTS = [
  'app_open', 'screen_view', 'login', 'search', 'vehicle_view', 'checkout_start', 'booking_created',
  'payment_started', 'payment_success', 'payment_failed', 'booking_cancelled',
];

const schema = new mongoose.Schema(
  {
    event: { type: String, enum: ANALYTICS_EVENTS, required: true },
    deviceId: { type: String, required: true, maxlength: 64 },
    sessionId: { type: String, maxlength: 64 },
    userId: { type: oid, ref: 'User' },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    appVersion: { type: String, maxlength: 20 },
    props: {
      firstOpen: Boolean,
      screen: { type: String, maxlength: 60 },
      vehicleId: oid,
      bookingId: oid,
      cityId: oid,
      amountPaise: Number,
      reason: { type: String, maxlength: 200 },
    },
    at: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ at: -1, event: 1 });
schema.index({ userId: 1, at: -1 });
schema.index({ deviceId: 1, at: -1 });
schema.index({ 'props.vehicleId': 1, event: 1, at: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 86400 });
export const AnalyticsEvent = mongoose.model('AnalyticsEvent', schema, 'analytics_events');

/** Team outreach to renters who dropped off before paying. */
const followUp = new mongoose.Schema(
  {
    userId: { type: oid, ref: 'User', required: true },
    status: { type: String, enum: ['contacted', 'no_answer', 'converted', 'not_interested'], required: true },
    note: { type: String, maxlength: 500 },
    by: { type: oid, ref: 'AdminUser' },
  },
  { timestamps: true, versionKey: false },
);
followUp.index({ userId: 1, createdAt: -1 });
export const AnalyticsFollowUp = mongoose.model('AnalyticsFollowUp', followUp, 'analytics_followups');

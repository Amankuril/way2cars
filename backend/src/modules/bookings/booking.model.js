import mongoose from 'mongoose';
import { geoPoint } from '../../core/schemas.js';

const oid = mongoose.Schema.Types.ObjectId;

export const BOOKING_STATUSES = [
  'pending_payment', // created, awaiting payment within hold window
  'pending_vendor_approval', // paid; host must accept (non-instant vehicles)
  'confirmed', // ready for pickup
  'ongoing', // pickup inspection done, trip running
  'return_pending', // renter submitted return; host review window
  'completed',
  'cancelled', // by user or admin
  'rejected', // by host or approval SLA timeout
  'expired', // hold expired before payment
];
/** Statuses that occupy the vehicle's calendar. */
export const BLOCKING_STATUSES = ['pending_payment', 'pending_vendor_approval', 'confirmed', 'ongoing', 'return_pending'];
export const ACTIVE_BOOKING_STATUSES = BLOCKING_STATUSES;

const actor = { realm: { type: String, enum: ['user', 'vendor', 'admin', 'system', 'webhook'] }, id: oid };

const priceLine = new mongoose.Schema({ kind: String, date: String, hours: Number, ratePaise: Number, amountPaise: Number, source: String, capped: Boolean }, { _id: false });

const pricing = new mongoose.Schema(
  {
    lines: [priceLine],
    hours: Number,
    rentalPaise: Number,
    discountPaise: { type: Number, default: 0 },
    deliveryFeePaise: { type: Number, default: 0 },
    convenienceFeePaise: { type: Number, default: 0 },
    taxablePaise: Number,
    gstBps: Number,
    gstPaise: Number,
    chargesPaise: Number,
    depositPaise: Number,
    totalPaise: Number,
    walletAppliedPaise: { type: Number, default: 0 },
    payablePaise: Number,
    includedKm: Number,
    extraKmChargePaise: Number,
    hourlyPaise: Number,
    dailyPaise: Number,
    commissionBps: Number,
    advancePaise: Number, // set when the renter chose to pay an advance to block the dates
    adjustedBy: { id: oid, note: String }, // admin-set price on an offline booking
    couponCode: String,
    settingsVersion: Number,
  },
  { _id: false },
);

const place = new mongoose.Schema(
  { type: { type: String, enum: ['host_location', 'doorstep'], default: 'host_location' }, address: String, point: geoPoint, distanceKm: Number },
  { _id: false },
);

/**
 * Self-serve (no approval): pending_payment → paid | expired | failed.
 * With operations approval: pending_approval → approved (applied at once, charge due/paid/waived) | rejected.
 * Admin direct extensions are created `approved`. "Applied" extensions move the booking's endAt.
 */
export const APPLIED_EXTENSION_STATUSES = ['paid', 'approved'];
const extension = new mongoose.Schema(
  {
    previousEndAt: Date,
    requestedEndAt: Date,
    status: { type: String, enum: ['pending_approval', 'approved', 'rejected', 'pending_payment', 'paid', 'expired', 'failed'], default: 'pending_payment' },
    pricing: { hours: Number, rentalPaise: Number, gstPaise: Number, totalPaise: Number, includedKm: Number, lines: [priceLine] },
    holdExpiresAt: Date,
    paymentId: { type: oid, ref: 'Payment' },
    paidAt: Date,
    requestedBy: actor,
    decidedBy: actor,
    decidedAt: Date,
    reason: String, // rejection reason or admin note
    chargeStatus: { type: String, enum: ['due', 'paid', 'waived'] }, // approved extensions only
  },
  { timestamps: true },
);

const schema = new mongoose.Schema(
  {
    ref: { type: String, required: true },
    userId: { type: oid, ref: 'User', required: true },
    vendorId: { type: oid, ref: 'Vendor', required: true },
    vehicleId: { type: oid, ref: 'Vehicle', required: true },
    cityId: { type: oid, ref: 'City', required: true },
    vehicleSnapshot: { title: String, registrationNumber: String, photoUrl: String, fuelType: String, transmission: String, seats: Number },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    originalEndAt: Date,
    // endAt, or a pending extension's end while its payment hold is live. Used for overlap checks.
    blockEndAt: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending_payment' },
    source: { type: String, enum: ['app', 'offline'], default: 'app' }, // offline = created by operations at the office
    ownership: { type: String, enum: ['host', 'company'], default: 'host' }, // company = Way2Cars-owned fleet
    createdBy: actor,
    officeNote: { type: String, maxlength: 500 },
    statusHistory: [{ _id: false, status: String, at: Date, by: actor, note: String }],
    instantBooking: Boolean,
    holdExpiresAt: Date,
    vendorDecisionDueAt: Date,
    pickup: place,
    dropoff: place,
    pricing,
    couponId: { type: oid, ref: 'Coupon' },
    payment: {
      status: { type: String, enum: ['pending', 'paid', 'failed', 'partially_refunded', 'refunded'], default: 'pending' },
      paidAt: Date,
      paymentId: { type: oid, ref: 'Payment' },
      paidPaise: { type: Number, default: 0 }, // gateway total across booking + extensions + settlement
      refundedPaise: { type: Number, default: 0 },
    },
    // Advance bookings / offline bookings with money still to collect before pickup.
    balance: {
      duePaise: Number,
      dueAt: Date,
      status: { type: String, enum: ['due', 'paid', 'waived'] },
      paidAt: Date,
      autoCancel: Boolean, // cancel per policy at pickup time if still due (app advance bookings)
      reminderSent: Boolean,
    },
    cancellation: { by: actor, reason: String, at: Date, hoursBeforeStart: Number, refundBps: Number, refundPaise: Number, walletRefundPaise: Number },
    extensions: [extension],
    trip: {
      pickupInspectionId: { type: oid, ref: 'TripInspection' },
      returnInspectionId: { type: oid, ref: 'TripInspection' },
      agreementId: { type: oid, ref: 'RentalAgreement' },
      startedAt: Date,
      returnSubmittedAt: Date,
      returnReviewDueAt: Date,
      endedAt: Date,
      startOdometerKm: Number,
      endOdometerKm: Number,
      startFuelEighths: Number,
      endFuelEighths: Number,
    },
    settlement: {
      kmDriven: Number, extraKm: Number, extraKmPaise: Number, fuelShortEighths: Number, fuelPaise: Number,
      lateHours: Number, lateFeePaise: Number, damagePaise: Number, damageNote: String, extensionDuePaise: Number,
      totalDeductionsPaise: Number, depositRefundPaise: Number, outstandingPaise: Number,
      outstandingStatus: { type: String, enum: ['none', 'due', 'paid', 'waived'] },
      outstandingPaymentId: { type: oid, ref: 'Payment' },
      commissionPaise: Number, vendorEarningPaise: Number, settledAt: Date, settledBy: actor,
    },
    reviewed: { byUser: { type: Boolean, default: false } },
    idempotencyKey: String, // client-supplied Idempotency-Key for create
    remindersSent: { pickup: Boolean, return: Boolean },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ ref: 1 }, { unique: true });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
schema.index({ vehicleId: 1, status: 1, startAt: 1, blockEndAt: 1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1, startAt: -1 });
schema.index({ vendorId: 1, status: 1, startAt: 1 });
schema.index({ status: 1, holdExpiresAt: 1 });
schema.index({ status: 1, vendorDecisionDueAt: 1 });
schema.index({ status: 1, startAt: 1 });
schema.index({ status: 1, 'trip.returnReviewDueAt': 1 });
schema.index({ createdAt: -1 });
schema.index({ 'balance.status': 1, 'balance.dueAt': 1 });
schema.index({ 'extensions.status': 1 });

export const Booking = mongoose.model('Booking', schema, 'bookings');

/** Mongo filter for bookings that block [startAt, endAt) on a vehicle, including the buffer. */
export function overlapFilter(vehicleId, startAt, endAt, bufferMinutes, { excludeBookingId, now = new Date() } = {}) {
  const buf = bufferMinutes * 60_000;
  const filter = {
    vehicleId,
    status: { $in: BLOCKING_STATUSES },
    startAt: { $lt: new Date(endAt.getTime() + buf) },
    blockEndAt: { $gt: new Date(startAt.getTime() - buf) },
    // Unpaid holds stop blocking once they lapse, even before the sweeper marks them expired.
    $or: [{ status: { $ne: 'pending_payment' } }, { holdExpiresAt: { $gt: now } }],
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  return filter;
}

/** Extension charges approved but still unpaid (settled from the deposit at trip end). */
export const unpaidExtensionPaise = (b) => (b.extensions || []).filter((e) => e.status === 'approved' && e.chargeStatus === 'due').reduce((sum, e) => sum + e.pricing.totalPaise, 0);
export const appliedExtensions = (b) => (b.extensions || []).filter((e) => APPLIED_EXTENSION_STATUSES.includes(e.status));

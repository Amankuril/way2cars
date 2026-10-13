import crypto from 'node:crypto';
import { withTransaction, isDuplicateKey } from '../../core/db.js';
import { badRequest, conflict, forbidden, notFound, AppError } from '../../core/errors.js';
import { pct } from '../../core/money.js';
import { audit } from '../../core/audit.js';
import { Booking, overlapFilter, BLOCKING_STATUSES } from './booking.model.js';
import { Vehicle, VehiclePriceOverride } from '../vehicles/vehicle.model.js';
import { User } from '../users/user.model.js';
import { getSettings } from '../settings/settings.service.js';
import { computeRental, assembleQuote, deliveryFee, cancellationRefundBps } from '../pricing/pricing.js';
import { Vendor } from '../vendors/vendor.model.js';
import { formatIst } from '../../core/time.js';
import { evaluateCoupon, reserveCoupon } from '../coupons/coupon.service.js';
import { debitUserWallet } from '../wallet/wallet.service.js';
import { drivingRoute, fromGeoPoint, validLatLng } from '../../integrations/maps.js';
import { isVehicleAvailable, validateTripWindow } from './availability.service.js';
import { transition, cancelBooking, runEffects, newEffects, releaseHeldValue } from './booking.lifecycle.js';
import { openPaymentOrder } from '../payments/payment.service.js';

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRef() {
  const d = new Date(Date.now() + 330 * 60000).toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = crypto.randomBytes(4);
  return `W2C${d}${[...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`;
}

async function loadOverrides(vehicleId, startAt, endAt, session) {
  const from = new Date(startAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const to = new Date(endAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const rows = await VehiclePriceOverride.find({ vehicleId, date: { $gte: from, $lte: to } }).session(session || null).lean();
  return new Map(rows.map((r) => [r.date, r]));
}

/** Eligibility checks for the renter. */
async function assertUserCanBook(user, endAt, settings) {
  if (!user || user.status !== 'active') throw forbidden(user?.status === 'pending_approval' ? 'Your account is awaiting approval.' : 'Your account cannot make bookings.', 'ACCOUNT_NOT_ACTIVE');
  if (!user.profileCompleted) throw forbidden('Complete your profile before booking.', 'PROFILE_INCOMPLETE');
  if (settings.booking.kycRequired) {
    if (user.kyc?.status !== 'approved') throw forbidden('Verify your driving licence and ID before booking.', 'KYC_REQUIRED');
    if (user.kyc.licenceExpiry && user.kyc.licenceExpiry < endAt) throw forbidden('Your driving licence expires before this trip ends. Please re-verify.', 'LICENCE_EXPIRES');
  }
}

/**
 * Computes the full server-side price. Never trusts client totals: callers pass only the
 * vehicle, window, delivery address, coupon code and whether to use wallet credit.
 */
export async function buildQuote({ userId, vehicleId, startAt, endAt, delivery, couponCode, useWallet }, { session, skipAvailability = false } = {}) {
  const settings = await getSettings();
  const window = await validateTripWindow(startAt, endAt);
  const vehicle = await Vehicle.findOne({ _id: vehicleId, isListed: true }).populate('brandId', 'name').session(session || null).lean();
  if (!vehicle) throw notFound('Car');
  if (!skipAvailability && !(await isVehicleAvailable(vehicle._id, window.startAt, window.endAt, { session }))) {
    throw conflict('This car is not available for the selected time. Try different times or another car.', 'VEHICLE_UNAVAILABLE');
  }
  const overrides = await loadOverrides(vehicle._id, window.startAt, window.endAt, session);
  const rental = computeRental({ startAt: window.startAt, endAt: window.endAt, pricing: vehicle.pricing, overrides });

  let deliveryInfo = null;
  if (delivery) {
    if (!vehicle.delivery?.enabled) throw badRequest('This host does not offer doorstep delivery.', undefined, 'DELIVERY_UNAVAILABLE');
    if (!validLatLng(delivery)) throw badRequest('Choose a delivery address from the suggestions.', undefined, 'DELIVERY_ADDRESS_INVALID');
    const route = await drivingRoute(fromGeoPoint(vehicle.location.point), { lat: delivery.lat, lng: delivery.lng });
    if (!route) throw badRequest('We could not find a route to this address.', undefined, 'DELIVERY_UNROUTABLE');
    const maxKm = Math.min(vehicle.delivery.maxKm, settings.fees.deliveryMaxKm);
    const fee = deliveryFee(route.distanceMeters, settings.fees);
    if (fee.km > maxKm) throw badRequest(`Doorstep delivery is available within ${maxKm} km of the car. This address is ${fee.km} km away.`, undefined, 'DELIVERY_TOO_FAR');
    deliveryInfo = { ...fee, address: delivery.address, lat: delivery.lat, lng: delivery.lng };
  }

  let coupon = null;
  let discountPaise = 0;
  if (couponCode) {
    ({ coupon, discountPaise } = await evaluateCoupon(couponCode, { userId, vehicle, rentalPaise: rental.rentalPaise }, session));
  }
  const user = userId ? await User.findById(userId).select('walletBalancePaise').session(session || null).lean() : null;
  const quote = assembleQuote({
    rental,
    deliveryFeePaise: deliveryInfo?.feePaise || 0,
    convenienceFeePaise: settings.fees.convenienceFeePaise,
    discountPaise,
    gstBps: settings.tax.rentalGstBps,
    depositPaise: vehicle.pricing.securityDepositPaise,
    walletBalancePaise: user?.walletBalancePaise || 0,
    useWallet: Boolean(useWallet),
    maxRedeemBps: settings.wallet.maxRedeemBps,
  });
  return { vehicle, window, quote, coupon, deliveryInfo, settings };
}

export function serializeQuote({ quote, coupon, deliveryInfo, window, vehicle }) {
  return {
    vehicleId: vehicle._id,
    startAt: window.startAt,
    endAt: window.endAt,
    ...quote,
    extraKmChargePaise: vehicle.pricing.extraKmChargePaise,
    coupon: coupon ? { code: coupon.code, title: coupon.title } : null,
    delivery: deliveryInfo ? { km: deliveryInfo.km, feePaise: deliveryInfo.feePaise, address: deliveryInfo.address } : null,
    instantBooking: vehicle.instantBooking,
  };
}

/**
 * Creates a booking in `pending_payment` with a short hold. Race-safe: the vehicle document is
 * write-locked inside the transaction, so two renters cannot both pass the availability check.
 */
export async function createBooking(req, input) {
  const userId = req.auth.id;
  const idempotencyKey = req.get('idempotency-key')?.slice(0, 80);
  if (idempotencyKey) {
    const existing = await Booking.findOne({ userId, idempotencyKey }).lean();
    if (existing) return { booking: existing, reused: true };
  }
  const settings = await getSettings();
  const user = await User.findById(userId).lean();
  const window0 = await validateTripWindow(input.startAt, input.endAt);
  await assertUserCanBook(user, window0.endAt, settings);

  const booking = await withTransaction(async (session) => {
    const locked = await Vehicle.findOneAndUpdate({ _id: input.vehicleId, isListed: true }, { $inc: { lockVersion: 1 } }, { session, new: true });
    if (!locked) throw notFound('Car');

    // A renter can't hold two overlapping trips.
    const { vehicleId: _ignored, ...overlap } = overlapFilter(locked._id, window0.startAt, window0.endAt, 0);
    const mine = await Booking.exists({ ...overlap, userId }).session(session);
    if (mine) throw conflict('You already have a trip during these times.', 'USER_OVERLAP');

    const { vehicle, window, quote, coupon, deliveryInfo } = await buildQuote({ ...input, userId }, { session });
    const pickup = deliveryInfo
      ? { type: 'doorstep', address: deliveryInfo.address, point: { type: 'Point', coordinates: [deliveryInfo.lng, deliveryInfo.lat] }, distanceKm: deliveryInfo.km }
      : { type: 'host_location', address: vehicle.location.address, point: vehicle.location.point };
    const now = new Date();
    const doc = {
      userId,
      vendorId: vehicle.vendorId,
      vehicleId: vehicle._id,
      cityId: vehicle.cityId,
      vehicleSnapshot: {
        title: [vehicle.brandId?.name, vehicle.model, vehicle.variant].filter(Boolean).join(' '),
        registrationNumber: vehicle.registrationNumber,
        photoUrl: vehicle.photos?.[0]?.url,
        fuelType: vehicle.fuelType,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
      },
      startAt: window.startAt,
      endAt: window.endAt,
      originalEndAt: window.endAt,
      blockEndAt: window.endAt,
      status: 'pending_payment',
      statusHistory: [{ status: 'pending_payment', at: now, by: { realm: 'user', id: userId } }],
      instantBooking: vehicle.instantBooking,
      holdExpiresAt: new Date(now.getTime() + settings.booking.holdMinutes * 60_000),
      pickup,
      dropoff: pickup,
      pricing: {
        ...quote,
        extraKmChargePaise: vehicle.pricing.extraKmChargePaise,
        hourlyPaise: vehicle.pricing.hourlyPaise,
        dailyPaise: vehicle.pricing.dailyPaise,
        commissionBps: settings.commissionBps,
        couponCode: coupon?.code,
        settingsVersion: settings.version,
      },
      couponId: coupon?._id,
      idempotencyKey,
    };
    let created;
    for (let i = 0; i < 4 && !created; i++) {
      try {
        [created] = await Booking.create([{ ...doc, ref: newRef() }], { session });
      } catch (err) {
        if (!isDuplicateKey(err) || !/ref/.test(err.message)) throw err;
      }
    }
    if (coupon) await reserveCoupon(coupon, { userId, bookingId: created._id, discountPaise: quote.discountPaise }, session);
    if (quote.walletAppliedPaise > 0) await debitUserWallet(userId, quote.walletAppliedPaise, 'wallet_redeemed', { bookingId: created._id, key: `wallet-redeem:${created._id}`, note: `Booking ${created.ref}` }, session);
    await audit(req, 'booking.created', { type: 'booking', id: created._id }, { changes: { totalPaise: quote.totalPaise, payablePaise: quote.payablePaise }, session });
    return created;
  });
  return { booking: booking.toObject(), reused: false };
}

/** Opens (or reuses) the Razorpay order for the booking's payable amount. */
export async function bookingPaymentOrder(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw notFound('Booking');
  if (booking.status !== 'pending_payment') throw conflict('This booking does not need payment.', 'PAYMENT_NOT_REQUIRED');
  if (booking.holdExpiresAt < new Date()) throw new AppError(410, 'HOLD_EXPIRED', 'Your 15-minute hold has expired. Please book again.');
  return openPaymentOrder({ booking, purpose: 'booking', amountPaise: booking.pricing.payablePaise });
}

export async function cancelByUser(req, bookingId, reason) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, userId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (!['pending_payment', 'pending_vendor_approval', 'confirmed'].includes(b.status)) throw conflict('This booking can no longer be cancelled.', 'NOT_CANCELLABLE');
    if (b.status === 'confirmed' && b.startAt <= new Date()) throw conflict('The trip has already started. Contact support for help.', 'NOT_CANCELLABLE');
    const effects = await cancelBooking(b, { by: { realm: 'user', id: req.auth.id }, reason: reason || 'Cancelled by renter' }, session);
    await audit(req, 'booking.cancelled', { type: 'booking', id: b._id }, { reason, session });
    return effects;
  });
  await runEffects(fx);
}

/** Preview of what a cancellation would refund right now (shown before the user confirms). */
export async function cancellationPreview(userId, bookingId) {
  const b = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!b) throw notFound('Booking');
  const settings = await getSettings();
  const paid = ['paid', 'partially_refunded'].includes(b.payment.status);
  const hours = (b.startAt - Date.now()) / 3600_000;
  const bps = b.status === 'confirmed' ? cancellationRefundBps(settings.cancellation.tiers, hours) : 10000;
  const fee = b.status === 'confirmed' ? settings.cancellation.feePaise : 0;
  const policy = Math.max(0, pct(b.pricing.chargesPaise, bps) - fee);
  const wallet = b.pricing.chargesPaise ? Math.round((policy * b.pricing.walletAppliedPaise) / b.pricing.chargesPaise) : 0;
  return {
    refundBps: bps,
    cancellationFeePaise: fee,
    refundToSourcePaise: paid ? policy - wallet + b.pricing.depositPaise : 0,
    refundToWalletPaise: paid ? wallet : b.pricing.walletAppliedPaise,
    hoursBeforeStart: Math.max(0, Math.round(hours * 10) / 10),
  };
}

export async function vendorDecision(req, bookingId, { decision, reason }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, vendorId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (b.status !== 'pending_vendor_approval') throw conflict('This request has already been handled.', 'NOT_PENDING');
    const by = { realm: 'vendor', id: req.auth.id };
    let effects;
    if (decision === 'accept') {
      transition(b, 'confirmed', by);
      b.vendorDecisionDueAt = undefined;
      await b.save({ session });
      await Vendor.updateOne({ _id: req.auth.id }, { $inc: { 'responseStats.accepted': 1 } }, { session });
      effects = newEffects();
      effects.notifications.push(['booking.confirmed', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, start: formatIst(b.startAt), end: formatIst(b.endAt) }]);
    } else {
      if (!reason) throw badRequest('Tell the renter why (e.g. car unavailable).', undefined, 'REASON_REQUIRED');
      effects = await cancelBooking(b, { by, reason, full: true, toStatus: 'rejected', refundReason: 'vendor_rejection' }, session);
      await Vendor.updateOne({ _id: req.auth.id }, { $inc: { 'responseStats.rejected': 1 } }, { session });
    }
    await audit(req, `booking.vendor_${decision}ed`, { type: 'booking', id: b._id }, { reason, session });
    return effects;
  });
  await runEffects(fx);
}

/** Admin cancellation: always a full refund unless an explicit refund amount is given. */
export async function cancelByAdmin(req, bookingId, { reason }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findById(bookingId).session(session);
    if (!b) throw notFound('Booking');
    if (!['pending_payment', 'pending_vendor_approval', 'confirmed'].includes(b.status)) throw conflict('Only bookings that have not started can be cancelled.', 'NOT_CANCELLABLE');
    const effects = await cancelBooking(b, { by: { realm: 'admin', id: req.auth.id }, reason, full: true, refundReason: 'admin_cancellation' }, session);
    await audit(req, 'booking.admin_cancelled', { type: 'booking', id: b._id }, { reason, session });
    return effects;
  });
  await runEffects(fx);
}

/** Starts a paid extension request (renter pays the difference before it takes effect). */
export async function requestExtension(req, bookingId, newEndAt) {
  const settings = await getSettings();
  const result = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, userId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (!['confirmed', 'ongoing'].includes(b.status)) throw conflict('Only upcoming or active trips can be extended.', 'NOT_EXTENDABLE');
    const end = new Date(newEndAt);
    if (Number.isNaN(end.getTime()) || end.getTime() % (30 * 60_000)) throw badRequest('Choose a return time on the hour or half hour.', undefined, 'INVALID_DATES');
    if (end <= b.endAt) throw badRequest('The new return time must be after the current one.', undefined, 'INVALID_DATES');
    if (end.getTime() - b.startAt.getTime() > settings.booking.maxDurationDays * 86400_000) throw badRequest(`Trips can last at most ${settings.booking.maxDurationDays} days.`, undefined, 'TRIP_TOO_LONG');
    if (b.extensions.some((e) => e.status === 'pending_payment' && e.holdExpiresAt > new Date())) throw conflict('You already have an extension awaiting payment.', 'EXTENSION_PENDING');

    await Vehicle.updateOne({ _id: b.vehicleId }, { $inc: { lockVersion: 1 } }, { session });
    if (!(await isVehicleAvailable(b.vehicleId, b.endAt, end, { session, excludeBookingId: b._id }))) {
      throw conflict('The car is booked after your trip, so it cannot be extended to that time.', 'VEHICLE_UNAVAILABLE');
    }
    const vehicle = await Vehicle.findById(b.vehicleId).select('pricing').session(session).lean();
    const overrides = await loadOverrides(b.vehicleId, b.endAt, end, session);
    const rental = computeRental({ startAt: b.endAt, endAt: end, pricing: vehicle.pricing, overrides });
    const gst = pct(rental.rentalPaise, b.pricing.gstBps);
    const ext = {
      previousEndAt: b.endAt,
      requestedEndAt: end,
      status: 'pending_payment',
      pricing: { hours: rental.hours, rentalPaise: rental.rentalPaise, gstPaise: gst, totalPaise: rental.rentalPaise + gst, includedKm: rental.includedKm, lines: rental.lines },
      holdExpiresAt: new Date(Date.now() + settings.booking.holdMinutes * 60_000),
    };
    b.extensions.push(ext);
    b.blockEndAt = end;
    await b.save({ session });
    return { booking: b, extension: b.extensions.at(-1) };
  });
  const order = await openPaymentOrder({ booking: result.booking, purpose: 'extension', amountPaise: result.extension.pricing.totalPaise, extensionId: result.extension._id });
  return { extension: result.extension, payment: order };
}

/** Re-opens the payment order for an extension still inside its hold window. */
export async function extensionPaymentOrder(userId, bookingId, extensionId) {
  const b = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!b) throw notFound('Booking');
  const ext = b.extensions.find((e) => String(e._id) === String(extensionId));
  if (!ext || ext.status !== 'pending_payment') throw conflict('This extension does not need payment.', 'PAYMENT_NOT_REQUIRED');
  if (ext.holdExpiresAt < new Date()) throw new AppError(410, 'HOLD_EXPIRED', 'This extension hold has expired. Please request it again.');
  return openPaymentOrder({ booking: b, purpose: 'extension', amountPaise: ext.pricing.totalPaise, extensionId: ext._id });
}

// ------------------------------------------------------------------ jobs
/** Marks lapsed unpaid holds as expired and returns their wallet credit / coupon. */
export async function expireHolds() {
  const lapsed = await Booking.find({ status: 'pending_payment', holdExpiresAt: { $lt: new Date(Date.now() - 60_000) } }).select('_id').limit(200).lean();
  for (const { _id } of lapsed) {
    const fx = await withTransaction(async (session) => {
      const b = await Booking.findOne({ _id, status: 'pending_payment' }).session(session);
      if (!b) return null;
      transition(b, 'expired', { realm: 'system' }, 'Payment not completed in time');
      await b.save({ session });
      const effects = newEffects();
      await releaseHeldValue(b, session, effects);
      effects.notifications.push(['booking.expired', { realm: 'user', id: b.userId }, { bookingId: b._id, vehicle: b.vehicleSnapshot.title }]);
      return effects;
    });
    await runEffects(fx);
  }
  // Extension holds that lapsed release the extra calendar time.
  const exts = await Booking.find({ extensions: { $elemMatch: { status: 'pending_payment', holdExpiresAt: { $lt: new Date(Date.now() - 60_000) } } } }).limit(200);
  for (const b of exts) {
    for (const e of b.extensions) if (e.status === 'pending_payment' && e.holdExpiresAt < new Date(Date.now() - 60_000)) e.status = 'expired';
    b.blockEndAt = b.endAt;
    await b.save();
  }
  return lapsed.length;
}

/** Host didn't respond within the SLA: reject with a full refund. */
export async function timeoutVendorApprovals() {
  const due = await Booking.find({ status: 'pending_vendor_approval', vendorDecisionDueAt: { $lt: new Date() } }).select('_id').limit(100).lean();
  for (const { _id } of due) {
    const fx = await withTransaction(async (session) => {
      const b = await Booking.findOne({ _id, status: 'pending_vendor_approval' }).session(session);
      if (!b) return null;
      return cancelBooking(b, { by: { realm: 'system' }, reason: 'Host did not respond in time', full: true, toStatus: 'rejected', refundReason: 'approval_timeout' }, session);
    });
    await runEffects(fx);
  }
  return due.length;
}

export { BLOCKING_STATUSES };

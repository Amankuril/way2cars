import { withTransaction } from '../../core/db.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { pct } from '../../core/money.js';
import { audit } from '../../core/audit.js';
import { formatIst } from '../../core/time.js';
import { normalizeIndianMobile } from '../../core/phone.js';
import { Booking, overlapFilter } from './booking.model.js';
import { Vehicle, VehiclePriceOverride } from '../vehicles/vehicle.model.js';
import { User } from '../users/user.model.js';
import { Vendor } from '../vendors/vendor.model.js';
import { getSettings } from '../settings/settings.service.js';
import { computeRental, addUnlimitedKm } from '../pricing/pricing.js';
import { findOrCreate } from '../auth/auth.service.js';
import { issueInvoice } from '../payments/invoice.service.js';
import { isVehicleAvailable } from './availability.service.js';
import { buildQuote, createBookingDoc, bookingSnapshot, validateCollateral } from './booking.service.js';
import { recordBookingRefund } from '../payments/refund.service.js';
import { newEffects, runEffects, recordOfflinePayment, onBalancePaid, onExtensionPaid, onSettlementPaid } from './booking.lifecycle.js';

/**
 * Operations-side booking work: office (offline) bookings, extension approvals, direct extensions
 * and money collected at the office. Every path uses the same availability lock as app bookings.
 */

const by = (req) => ({ realm: 'admin', id: req.auth.id });
const view = (b) => ({ bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, start: formatIst(b.startAt), end: formatIst(b.endAt) });

async function loadOverrides(vehicleId, startAt, endAt, session) {
  const from = new Date(startAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const to = new Date(endAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const rows = await VehiclePriceOverride.find({ vehicleId, date: { $gte: from, $lte: to } }).session(session || null).lean();
  return new Map(rows.map((r) => [r.date, r]));
}

/** Prices extra time on a booking from the car's own rates (calendar overrides included). */
async function priceExtension(b, end, session, rentalOverridePaise) {
  const vehicle = await Vehicle.findById(b.vehicleId).select('pricing').session(session).lean();
  let rental = computeRental({ startAt: b.endAt, endAt: end, pricing: vehicle.pricing, overrides: await loadOverrides(b.vehicleId, b.endAt, end, session) });
  if (b.pricing.unlimitedKm) rental = addUnlimitedKm(rental, vehicle.pricing.unlimitedKmDailyPaise ?? 0);
  const rentalPaise = rentalOverridePaise ?? rental.rentalPaise;
  const gst = pct(rentalPaise, b.pricing.gstBps);
  return { hours: rental.hours, rentalPaise, gstPaise: gst, totalPaise: rentalPaise + gst, includedKm: rental.includedKm, lines: rental.lines };
}

/** Moves the booking's return time to an approved extension's end. */
function applyExtension(b, ext) {
  b.endAt = ext.requestedEndAt;
  b.blockEndAt = ext.requestedEndAt;
  b.pricing.includedKm += ext.pricing.includedKm;
  b.remindersSent.return = false;
  b.statusHistory.push({ status: b.status, at: new Date(), by: ext.decidedBy, note: `Extended to ${ext.requestedEndAt.toISOString()}` });
}

// ------------------------------------------------------------------ offline bookings

/**
 * Creates a confirmed booking for a walk-in customer, found (or registered) by mobile number so it
 * shows up in their app once they sign in with that number.
 */
export async function createOfflineBooking(req, input) {
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) throw badRequest('Enter a valid 10-digit mobile number.', undefined, 'PHONE_INVALID');
  const { account } = await findOrCreate('user', phone);
  if (['suspended', 'deleted'].includes(account.status)) throw conflict('This customer account is suspended. Resolve it before booking.', 'ACCOUNT_NOT_ACTIVE');
  if (input.name && !account.name) await User.updateOne({ _id: account._id }, { $set: { name: input.name } });
  const settings = await getSettings();

  const { booking, effects } = await withTransaction(async (session) => {
    const locked = await Vehicle.findOneAndUpdate({ _id: input.vehicleId, 'approval.status': 'approved', adminSuspended: false }, { $inc: { lockVersion: 1 } }, { session, new: true });
    if (!locked) throw notFound('Car');
    const { vehicleId: _ignored, ...overlap } = overlapFilter(locked._id, new Date(input.startAt), new Date(input.endAt), 0);
    if (await Booking.exists({ ...overlap, userId: account._id }).session(session)) throw conflict('This customer already has a trip during these times.', 'USER_OVERLAP');
    const office = { rentalPaise: input.pricing?.rentalPaise, depositPaise: input.pricing?.depositPaise, discountPaise: input.pricing?.discountPaise, waiveConvenienceFee: input.pricing?.waiveConvenienceFee };
    const { vehicle, window, quote, deposit, hubs } = await buildQuote({ userId: account._id, vehicleId: input.vehicleId, startAt: input.startAt, endAt: input.endAt, unlimitedKm: input.unlimitedKm, depositOption: input.depositOption, pickupLocationId: input.pickupLocationId, dropoffLocationId: input.dropoffLocationId }, { session, office });
    const collateral = validateCollateral(deposit.option, input.collateral, settings);
    const owner = await Vendor.findById(vehicle.vendorId).select('isCompany commissionBps').session(session).lean();
    const snap = bookingSnapshot({ vehicle, owner, quote, settings, deposit, collateral, hubs });
    const now = new Date();
    const total = quote.payablePaise;
    const pay = input.payment;
    const collected = pay.status === 'paid' ? total : pay.status === 'partial' ? pay.amountPaise : 0;
    if (pay.status === 'partial' && !(collected > 0 && collected < total)) throw badRequest(`The amount collected must be between ₹1 and ₹${(total / 100).toFixed(2)}.`, undefined, 'AMOUNT_INVALID');

    const b = await createBookingDoc({
      userId: account._id, vehicle, window, quote, session,
      pickup: snap.pickup,
      extra: {
        ...snap,
        status: 'confirmed',
        statusHistory: [{ status: 'confirmed', at: now, by: by(req), note: 'Booked at the office' }],
        source: 'offline',
        createdBy: by(req),
        officeNote: input.note,
        instantBooking: true,
        pricing: {
          ...snap.pricing,
          ...(input.pricing && Object.keys(input.pricing).length ? { adjustedBy: { id: req.auth.id, note: input.pricing.note } } : {}),
        },
        ...(collected < total ? { balance: { duePaise: total - collected, dueAt: input.balanceDueAt || window.startAt, status: 'due', autoCancel: false } } : {}),
      },
    });
    if (collected > 0) {
      const payment = await recordOfflinePayment(b, { purpose: 'booking', amountPaise: collected, method: pay.method, reference: pay.reference, adminId: req.auth.id }, session);
      b.payment.status = 'paid';
      b.payment.paidAt = now;
      b.payment.paymentId = payment._id;
      await b.save({ session });
      await issueInvoice({ booking: b, payment, type: 'booking' }, session);
    }
    await audit(req, 'booking.offline_created', { type: 'booking', id: b._id }, { changes: { phone, totalPaise: total, collectedPaise: collected, method: pay.method }, session });
    const fx = newEffects();
    fx.notifications.push(['booking.confirmed', { realm: 'user', id: b.userId }, view(b)]);
    if (b.ownership === 'host') fx.notifications.push(['vendor.booking_confirmed', { realm: 'vendor', id: b.vendorId }, view(b)]);
    return { booking: b, effects: fx };
  });
  await runEffects(effects);
  return booking.toObject();
}

// ------------------------------------------------------------------ extensions

/** Operations approve or reject a renter's extension request. */
export async function decideExtension(req, bookingId, extensionId, { decision, reason }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findById(bookingId).session(session);
    if (!b) throw notFound('Booking');
    const ext = b.extensions.id(extensionId);
    if (!ext || ext.status !== 'pending_approval') throw conflict('This extension request has already been handled.', 'NOT_PENDING');
    const effects = newEffects();
    Object.assign(ext, { decidedBy: by(req), decidedAt: new Date(), reason });
    if (decision === 'reject') {
      if (!reason) throw badRequest('Tell the renter why.', undefined, 'REASON_REQUIRED');
      ext.status = 'rejected';
      b.blockEndAt = b.endAt;
      await b.save({ session });
      effects.notifications.push(['booking.extension_rejected', { realm: 'user', id: b.userId }, { ...view(b), reason }]);
    } else {
      if (!['confirmed', 'ongoing'].includes(b.status)) throw conflict('Only upcoming or active trips can be extended.', 'NOT_EXTENDABLE');
      await Vehicle.updateOne({ _id: b.vehicleId }, { $inc: { lockVersion: 1 } }, { session });
      if (!(await isVehicleAvailable(b.vehicleId, ext.previousEndAt, ext.requestedEndAt, { session, excludeBookingId: b._id }))) {
        throw conflict('The car is not free for the extra time. Reject the request or offer a shorter extension.', 'VEHICLE_UNAVAILABLE');
      }
      ext.status = 'approved';
      ext.chargeStatus = ext.pricing.totalPaise > 0 ? 'due' : 'waived';
      applyExtension(b, ext);
      await b.save({ session });
      effects.notifications.push(['booking.extension_approved', { realm: 'user', id: b.userId }, { ...view(b), duePaise: ext.chargeStatus === 'due' ? ext.pricing.totalPaise : 0 }]);
      if (b.ownership === 'host') effects.notifications.push(['booking.extended_vendor', { realm: 'vendor', id: b.vendorId }, view(b)]);
    }
    await audit(req, `booking.extension_${decision === 'approve' ? 'approved' : 'rejected'}`, { type: 'booking', id: b._id }, { reason, changes: { requestedEndAt: ext.requestedEndAt }, session });
    return effects;
  });
  await runEffects(fx);
}

/**
 * Operations extend a booking directly (phone request, office visit). The charge is collected in the
 * app, recorded as paid at the office, or waived. No 12-hour rule: staff judge availability.
 */
export async function adminExtend(req, bookingId, { endAt, rentalPaise, charge, method, reference, note }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findById(bookingId).session(session);
    if (!b) throw notFound('Booking');
    if (!['confirmed', 'ongoing'].includes(b.status)) throw conflict('Only upcoming or active trips can be extended.', 'NOT_EXTENDABLE');
    if (b.extensions.some((e) => e.status === 'pending_approval' || (e.status === 'pending_payment' && e.holdExpiresAt > new Date()))) {
      throw conflict('Handle the renter’s pending extension request first.', 'EXTENSION_PENDING');
    }
    const end = new Date(endAt);
    if (end.getTime() % (30 * 60_000)) throw badRequest('Choose a return time on the hour or half hour.', undefined, 'INVALID_DATES');
    if (end <= b.endAt) throw badRequest('The new return time must be after the current one.', undefined, 'INVALID_DATES');
    await Vehicle.updateOne({ _id: b.vehicleId }, { $inc: { lockVersion: 1 } }, { session });
    if (!(await isVehicleAvailable(b.vehicleId, b.endAt, end, { session, excludeBookingId: b._id }))) {
      throw conflict('The car is booked or blocked during the extra time.', 'VEHICLE_UNAVAILABLE');
    }
    const pricing = await priceExtension(b, end, session, rentalPaise);
    b.extensions.push({
      previousEndAt: b.endAt, requestedEndAt: end, status: 'approved', pricing,
      requestedBy: by(req), decidedBy: by(req), decidedAt: new Date(), reason: note,
      chargeStatus: charge === 'waive' || pricing.totalPaise === 0 ? 'waived' : 'due',
    });
    const ext = b.extensions.at(-1);
    applyExtension(b, ext);
    const effects = newEffects();
    if (charge === 'paid_offline' && pricing.totalPaise > 0) {
      const payment = await recordOfflinePayment(b, { purpose: 'extension', amountPaise: pricing.totalPaise, method, reference, adminId: req.auth.id, extensionId: ext._id }, session);
      Object.assign(ext, { chargeStatus: 'paid', paymentId: payment._id, paidAt: new Date() });
      await b.save({ session });
      await issueInvoice({ booking: b, payment, type: 'extension' }, session);
    } else {
      await b.save({ session });
    }
    await audit(req, 'booking.admin_extended', { type: 'booking', id: b._id }, { reason: note, changes: { endAt: end, totalPaise: pricing.totalPaise, charge }, session });
    effects.notifications.push(['booking.extension_approved', { realm: 'user', id: b.userId }, { ...view(b), duePaise: ext.chargeStatus === 'due' ? pricing.totalPaise : 0 }]);
    if (b.ownership === 'host') effects.notifications.push(['booking.extended_vendor', { realm: 'vendor', id: b.vendorId }, view(b)]);
    return effects;
  });
  await runEffects(fx);
}

/** Availability + price for a proposed extension, so staff can check before approving or extending. */
export async function extensionCheck(bookingId, endAt) {
  const b = await Booking.findById(bookingId).lean();
  if (!b) throw notFound('Booking');
  const end = new Date(endAt);
  if (!(end > b.endAt)) throw badRequest('The new return time must be after the current one.', undefined, 'INVALID_DATES');
  const [available, pricing] = await Promise.all([
    isVehicleAvailable(b.vehicleId, b.endAt, end, { excludeBookingId: b._id }),
    priceExtension(b, end, null),
  ]);
  const next = await Booking.findOne({ vehicleId: b.vehicleId, _id: { $ne: b._id }, status: { $in: ['pending_vendor_approval', 'confirmed', 'ongoing'] }, startAt: { $gte: b.endAt } }).sort({ startAt: 1 }).select('ref startAt').lean();
  return { available, pricing, nextBooking: next ? { ref: next.ref, startAt: next.startAt } : null };
}

// ------------------------------------------------------------------ office collections

/**
 * Records money collected at the office against what the booking owes: the balance, an approved
 * extension's charge, or trip-end dues.
 */
export async function recordOfficeCollection(req, bookingId, { purpose, extensionId, method, reference, note }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findById(bookingId).session(session);
    if (!b) throw notFound('Booking');
    let amountPaise;
    if (purpose === 'balance') {
      if (b.balance?.status !== 'due' || !['pending_vendor_approval', 'confirmed'].includes(b.status)) throw conflict('Nothing is due on this booking.', 'NOTHING_DUE');
      amountPaise = b.balance.duePaise;
    } else if (purpose === 'extension') {
      const ext = b.extensions.id(extensionId);
      if (!ext || ext.status !== 'approved' || ext.chargeStatus !== 'due') throw conflict('This extension has nothing due.', 'NOTHING_DUE');
      amountPaise = ext.pricing.totalPaise;
    } else {
      if (b.settlement?.outstandingStatus !== 'due') throw conflict('Nothing is due on this trip.', 'NOTHING_DUE');
      amountPaise = b.settlement.outstandingPaise;
    }
    const payment = await recordOfflinePayment(b, { purpose, amountPaise, method, reference, note, adminId: req.auth.id, extensionId }, session);
    await b.save({ session });
    const handler = { balance: onBalancePaid, extension: onExtensionPaid, settlement: onSettlementPaid }[purpose];
    const effects = await handler(b, payment, session);
    await audit(req, 'booking.office_payment', { type: 'booking', id: b._id }, { changes: { purpose, amountPaise, method, reference }, session });
    return effects;
  });
  await runEffects(fx);
}

// ------------------------------------------------------------------ price adjustments

/**
 * Reduces what the renter pays (e.g. a breakdown caused by Way2Cars). The reduction first lowers any
 * balance still to collect, then any dues after the trip, and the rest is refunded — to the original
 * payment or to the renter's WAY2CARS wallet. Host / investor earnings are not reduced: Way2Cars
 * absorbs the adjustment. Every adjustment is kept on the booking with its reason.
 */
export async function adjustBookingPrice(req, bookingId, { amountPaise, reason, refundTo = 'source' }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findById(bookingId).session(session);
    if (!b) throw notFound('Booking');
    if (!['pending_vendor_approval', 'confirmed', 'ongoing', 'return_pending', 'completed'].includes(b.status)) {
      throw conflict('Only paid, active or completed bookings can be adjusted. Cancel the booking instead.', 'NOT_ADJUSTABLE');
    }
    const extTotal = (b.extensions || []).filter((e) => ['paid', 'approved'].includes(e.status) && e.chargeStatus !== 'waived').reduce((t, e) => t + e.pricing.totalPaise, 0);
    const outstandingCharges = b.settlement?.outstandingStatus === 'due' ? b.settlement.outstandingPaise : 0;
    const maxPaise = b.pricing.chargesPaise + extTotal + outstandingCharges - (b.pricing.adjustmentPaise || 0);
    if (amountPaise > maxPaise) throw badRequest(`You can reduce this booking by at most ₹${(Math.max(0, maxPaise) / 100).toFixed(2)}.`, undefined, 'ADJUSTMENT_TOO_LARGE');

    let remaining = amountPaise;
    const applied = { balancePaise: 0, outstandingPaise: 0, refundPaise: 0 };
    if (b.balance?.status === 'due' && remaining > 0) {
      applied.balancePaise = Math.min(remaining, b.balance.duePaise);
      b.balance.duePaise -= applied.balancePaise;
      if (b.balance.duePaise <= 0) b.balance.status = 'waived';
      remaining -= applied.balancePaise;
    }
    if (b.settlement?.outstandingStatus === 'due' && remaining > 0) {
      applied.outstandingPaise = Math.min(remaining, b.settlement.outstandingPaise);
      b.settlement.outstandingPaise -= applied.outstandingPaise;
      if (b.settlement.outstandingPaise <= 0) b.settlement.outstandingStatus = 'waived';
      remaining -= applied.outstandingPaise;
    }
    if (remaining > 0) {
      // The security deposit still held is not refundable here (it is settled after the trip).
      const settled = Boolean(b.settlement?.settledAt);
      const depositHeld = !settled ? (b.pricing.depositPaise || 0) : ['pending_review', 'scheduled'].includes(b.settlement.depositRefundStatus) ? b.settlement.depositRefundPaise : 0;
      const paidNet = Math.max(0, (b.payment?.paidPaise || 0) - (b.payment?.refundedPaise || 0));
      const refundable = Math.max(0, paidNet - depositHeld);
      if (remaining > refundable) throw badRequest(`Only ₹${(refundable / 100).toFixed(2)} of what the renter paid can be refunded now.`, undefined, 'ADJUSTMENT_TOO_LARGE');
      applied.refundPaise = remaining;
    }
    const at = new Date();
    b.adjustments.push({ amountPaise, reason, by: by(req), at, ...applied, refundTo: applied.refundPaise ? refundTo : undefined });
    b.pricing.adjustmentPaise = (b.pricing.adjustmentPaise || 0) + amountPaise;
    b.statusHistory.push({ status: b.status, at, by: by(req), note: `Price reduced by ₹${(amountPaise / 100).toFixed(2)}: ${reason}` });
    b.markModified('settlement');
    await b.save({ session });

    const effects = newEffects();
    if (applied.refundPaise) {
      effects.refunds.push(...(await recordBookingRefund(b, applied.refundPaise, 'price_adjustment', { key: `adjust:${b._id}:${b.adjustments.length}`, by: by(req), note: reason, to: refundTo }, session)));
    }
    await audit(req, 'booking.price_adjusted', { type: 'booking', id: b._id }, { reason, changes: { amountPaise, ...applied, refundTo }, session });
    effects.notifications.push(['booking.price_adjusted', { realm: 'user', id: b.userId }, { ...view(b), amountPaise, reason, ...applied, refundTo }]);
    return effects;
  });
  await runEffects(fx);
}

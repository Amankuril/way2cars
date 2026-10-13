import { conflict } from '../../core/errors.js';
import { pct } from '../../core/money.js';
import { formatIst } from '../../core/time.js';
import { Booking } from './booking.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { isVehicleAvailable } from './availability.service.js';
import { confirmCoupon, releaseCoupon } from '../coupons/coupon.service.js';
import { creditUserWallet, creditVendorEarning } from '../wallet/wallet.service.js';
import { recordBookingRefund, dispatchRefunds } from '../payments/refund.service.js';
import { issueInvoice } from '../payments/invoice.service.js';
import { notify } from '../notifications/notification.service.js';
import { getSettings } from '../settings/settings.service.js';
import { cancellationRefundBps } from '../pricing/pricing.js';
import { audit } from '../../core/audit.js';

/** Allowed state machine. Anything else is a bug or a stale request → 409. */
const TRANSITIONS = {
  pending_payment: ['pending_vendor_approval', 'confirmed', 'cancelled', 'expired'],
  pending_vendor_approval: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['ongoing', 'cancelled'],
  ongoing: ['return_pending'],
  return_pending: ['completed'],
  expired: ['pending_vendor_approval', 'confirmed', 'cancelled'], // late payment that still fits
};

export function transition(booking, to, by, note) {
  if (!TRANSITIONS[booking.status]?.includes(to)) {
    throw conflict(`This booking can no longer be moved from ${booking.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.`, 'INVALID_BOOKING_STATE');
  }
  booking.status = to;
  booking.statusHistory.push({ status: to, at: new Date(), by, note });
}

/** Collects post-commit side effects so notifications/refund calls never run inside transactions. */
export const newEffects = () => ({ notifications: [], refunds: [] });
export async function afterPaymentCommit(effects) {
  if (!effects) return;
  if (effects.refunds?.length) await dispatchRefunds(effects.refunds);
  for (const [event, to, data, opts] of effects.notifications || []) await notify(event, to, data, opts);
}
export const runEffects = afterPaymentCommit;

const view = (b) => ({ bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, start: formatIst(b.startAt), end: formatIst(b.endAt) });

/** Payment captured for the initial booking amount. */
export async function onBookingPaid(booking, payment, session) {
  const fx = newEffects();
  const by = { realm: 'system' };
  const settings = await getSettings();
  const now = new Date();
  const holdValid = booking.status === 'pending_payment' && booking.holdExpiresAt > now;
  let canProceed = holdValid;
  if (!holdValid && ['pending_payment', 'expired'].includes(booking.status)) {
    // Paid after the hold lapsed: honour it only if the car is still free.
    await Vehicle.updateOne({ _id: booking.vehicleId }, { $inc: { lockVersion: 1 } }, { session });
    canProceed = booking.startAt > now && (await isVehicleAvailable(booking.vehicleId, booking.startAt, booking.endAt, { session, excludeBookingId: booking._id }));
  }

  booking.payment.status = 'paid';
  booking.payment.paidAt = payment.paidAt;
  booking.payment.paymentId = payment._id;
  booking.payment.paidPaise = (booking.payment.paidPaise || 0) + payment.amountPaise;

  if (!canProceed) {
    // Late or orphaned payment (hold lapsed, car taken, or booking already cancelled): refund it in full.
    if (booking.status === 'pending_payment') transition(booking, 'expired', by, 'Hold expired before payment');
    if (booking.status === 'expired') {
      transition(booking, 'cancelled', by, 'Paid after hold expired; car no longer available');
      booking.cancellation = { by, reason: 'Payment arrived after the car was taken', at: now, refundBps: 10000, refundPaise: payment.amountPaise };
    }
    await booking.save({ session });
    await releaseHeldValue(booking, session, fx);
    fx.refunds.push(...(await recordBookingRefund(booking, payment.amountPaise, 'late_payment', { key: `late:${payment._id}`, by }, session)));
    fx.notifications.push(['booking.cancelled', { realm: 'user', id: booking.userId }, { ...view(booking), refundPaise: payment.amountPaise }]);
    return fx;
  }

  const next = booking.instantBooking ? 'confirmed' : 'pending_vendor_approval';
  transition(booking, next, by, `Payment ${payment.razorpayPaymentId}`);
  booking.holdExpiresAt = undefined;
  if (next === 'pending_vendor_approval') {
    const sla = new Date(now.getTime() + settings.booking.vendorApprovalSlaMinutes * 60_000);
    booking.vendorDecisionDueAt = sla < booking.startAt ? sla : new Date(Math.max(now.getTime() + 10 * 60_000, booking.startAt.getTime() - 5 * 60_000));
  }
  await booking.save({ session });
  await confirmCoupon(booking._id, session);
  await issueInvoice({ booking, payment, type: 'booking' }, session);
  await audit(null, 'booking.paid', { type: 'booking', id: booking._id }, { actor: { realm: 'webhook' }, changes: { amountPaise: payment.amountPaise, status: next }, session });

  const v = view(booking);
  fx.notifications.push(['payment.succeeded', { realm: 'user', id: booking.userId }, { ...v, amountPaise: payment.amountPaise }]);
  if (next === 'confirmed') {
    fx.notifications.push(['booking.confirmed', { realm: 'user', id: booking.userId }, v]);
    fx.notifications.push(['vendor.booking_confirmed', { realm: 'vendor', id: booking.vendorId }, v]);
  } else {
    fx.notifications.push(['booking.created_pending_vendor', { realm: 'user', id: booking.userId }, { ...v, slaMinutes: settings.booking.vendorApprovalSlaMinutes }]);
    fx.notifications.push(['vendor.booking_request', { realm: 'vendor', id: booking.vendorId }, { ...v, slaMinutes: settings.booking.vendorApprovalSlaMinutes }]);
  }
  return fx;
}

export async function onExtensionPaid(booking, payment, session) {
  const fx = newEffects();
  const ext = booking.extensions.id(payment.extensionId);
  if (!ext || ext.status === 'paid') return fx;
  const now = new Date();
  let ok = ext.status === 'pending_payment' && ext.holdExpiresAt > now && ['ongoing', 'confirmed'].includes(booking.status);
  if (!ok && ['ongoing', 'confirmed'].includes(booking.status)) {
    await Vehicle.updateOne({ _id: booking.vehicleId }, { $inc: { lockVersion: 1 } }, { session });
    ok = await isVehicleAvailable(booking.vehicleId, ext.previousEndAt, ext.requestedEndAt, { session, excludeBookingId: booking._id });
  }
  ext.paymentId = payment._id;
  if (!ok) {
    ext.status = 'failed';
    booking.blockEndAt = booking.endAt;
    await booking.save({ session });
    fx.refunds.push(...(await recordBookingRefund(booking, payment.amountPaise, 'extension_unavailable', { key: `ext-fail:${ext._id}`, by: { realm: 'system' } }, session)));
    return fx;
  }
  ext.status = 'paid';
  ext.paidAt = now;
  booking.endAt = ext.requestedEndAt;
  booking.blockEndAt = ext.requestedEndAt;
  booking.pricing.includedKm += ext.pricing.includedKm;
  booking.remindersSent.return = false;
  booking.statusHistory.push({ status: booking.status, at: now, by: { realm: 'system' }, note: `Extended to ${ext.requestedEndAt.toISOString()}` });
  await booking.save({ session });
  await issueInvoice({ booking, payment, type: 'extension' }, session);
  fx.notifications.push(['booking.extended', { realm: 'user', id: booking.userId }, view(booking)]);
  return fx;
}

export async function onSettlementPaid(booking, payment, session) {
  await Booking.updateOne({ _id: booking._id }, { $set: { 'settlement.outstandingStatus': 'paid', 'settlement.outstandingPaymentId': payment._id } }, { session });
  await issueInvoice({ booking, payment, type: 'settlement' }, session);
  return newEffects();
}

/** Returns wallet credit and coupon reservation held by a booking that will not go ahead. */
export async function releaseHeldValue(booking, session, fx, { walletPaise } = {}) {
  await releaseCoupon(booking._id, session);
  const amount = walletPaise ?? booking.pricing.walletAppliedPaise;
  if (amount > 0) {
    await creditUserWallet(booking.userId, amount, 'wallet_redeem_reversed', { bookingId: booking._id, key: `wallet-return:${booking._id}`, note: `Booking ${booking.ref} not completed` }, session);
  }
}

/**
 * Cancels a booking before the trip starts and refunds per policy.
 * `full` forces a 100% refund (host rejection, admin goodwill, approval timeout).
 */
export async function cancelBooking(booking, { by, reason, full = false, toStatus = 'cancelled', refundReason = 'user_cancellation' }, session) {
  const fx = newEffects();
  const settings = await getSettings();
  const now = new Date();
  const p = booking.pricing;
  const wasPaid = ['paid', 'partially_refunded'].includes(booking.payment.status);
  const hoursBeforeStart = (booking.startAt - now) / 3600_000;

  let refundBps = 10000;
  let feePaise = 0;
  if (!full && booking.status === 'confirmed') {
    refundBps = cancellationRefundBps(settings.cancellation.tiers, hoursBeforeStart);
    feePaise = settings.cancellation.feePaise;
  }
  const policyRefund = Math.max(0, pct(p.chargesPaise, refundBps) - feePaise);
  const walletRefund = p.chargesPaise > 0 ? Math.round((policyRefund * p.walletAppliedPaise) / p.chargesPaise) : 0;
  const gatewayRefund = wasPaid ? policyRefund - walletRefund + p.depositPaise : 0;

  transition(booking, toStatus, by, reason);
  booking.cancellation = { by, reason, at: now, hoursBeforeStart: Math.round(hoursBeforeStart * 10) / 10, refundBps, refundPaise: gatewayRefund, walletRefundPaise: wasPaid ? walletRefund : p.walletAppliedPaise };
  booking.holdExpiresAt = undefined;
  booking.blockEndAt = booking.endAt;
  await booking.save({ session });

  await releaseHeldValue(booking, session, fx, { walletPaise: wasPaid ? walletRefund : p.walletAppliedPaise });
  if (gatewayRefund > 0) {
    fx.refunds.push(...(await recordBookingRefund(booking, gatewayRefund, refundReason, { key: `cancel:${booking._id}`, by }, session)));
  }
  // Host keeps their share of any retained rental (late cancellations).
  if (wasPaid && refundBps < 10000) {
    const retainedRental = pct(p.rentalPaise - p.discountPaise, 10000 - refundBps);
    const earning = retainedRental - pct(retainedRental, p.commissionBps);
    if (earning > 0) await creditVendorEarning(booking.vendorId, earning, { bookingId: booking._id, key: `earning-cancel:${booking._id}` }, session);
  }
  const v = view(booking);
  if (toStatus === 'rejected') fx.notifications.push(['booking.rejected', { realm: 'user', id: booking.userId }, v]);
  else fx.notifications.push(['booking.cancelled', { realm: 'user', id: booking.userId }, { ...v, refundPaise: gatewayRefund }]);
  if (by.realm !== 'vendor' && wasPaid) fx.notifications.push(['vendor.booking_cancelled', { realm: 'vendor', id: booking.vendorId }, v]);
  return fx;
}

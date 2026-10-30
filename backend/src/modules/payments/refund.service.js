import { logger } from '../../core/logger.js';
import { Payment, Refund } from './payment.model.js';
import { Booking } from '../bookings/booking.model.js';
import { createRefund } from '../../integrations/razorpay.js';
import { notify, notifyAdmins } from '../notifications/notification.service.js';
import { creditUserWallet } from '../wallet/wallet.service.js';

const MAX_ATTEMPTS = 6;

/**
 * Records refunds of `amountPaise` for a booking, allocated across its captured payments
 * (oldest first, respecting what each has left). Runs inside the caller's transaction; the
 * provider call happens after commit via dispatchRefunds(). Idempotent per `key`.
 * Returns the created Refund docs.
 */
export async function recordBookingRefund(booking, amountPaise, reason, { key, by, note, to = 'source' }, session) {
  if (amountPaise <= 0) return [];
  const existing = await Refund.find({ idempotencyKey: { $regex: `^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:` } }).session(session).lean();
  if (existing.length) return existing;
  const payments = await Payment.find({ bookingId: booking._id, status: 'paid' }).sort({ paidAt: 1 }).session(session);
  let remaining = amountPaise;
  const refunds = [];
  for (const p of payments) {
    if (remaining <= 0) break;
    const available = p.amountPaise - p.refundedPaise;
    const take = Math.min(available, remaining);
    if (take <= 0) continue;
    p.refundedPaise += take;
    await p.save({ session });
    const toWallet = to === 'wallet';
    const [r] = await Refund.create([{
      bookingId: booking._id, paymentId: p._id, userId: booking.userId, amountPaise: take, reason, idempotencyKey: `${key}:${p._id}`, initiatedBy: by, note,
      destination: toWallet ? 'wallet' : 'source',
      ...(toWallet ? { status: 'processed', processedAt: new Date() } : p.mode === 'offline' ? { status: 'manual' } : {}),
    }], { session });
    refunds.push(r);
    remaining -= take;
  }
  const refunded = amountPaise - remaining;
  if (refunded > 0 && to === 'wallet') {
    await creditUserWallet(booking.userId, refunded, 'booking_refund', { bookingId: booking._id, category: 'refund', note: note || `Refund for booking ${booking.ref}`, key: `wallet-refund:${key}`, by }, session);
  }
  if (refunded > 0) {
    const b = await Booking.findByIdAndUpdate(booking._id, { $inc: { 'payment.refundedPaise': refunded } }, { new: true, session }).select('payment');
    const status = b.payment.refundedPaise >= b.payment.paidPaise ? 'refunded' : 'partially_refunded';
    await Booking.updateOne({ _id: booking._id }, { $set: { 'payment.status': status } }, { session });
  }
  if (to === 'wallet' && refunded > 0) setImmediate(() => notify('wallet.credited', { realm: 'user', id: booking.userId }, { amountPaise: refunded, reason: note || `Refund for booking ${booking.ref}` }));
  if (refunds.some((r) => r.status === 'manual')) {
    const manual = refunds.filter((r) => r.status === 'manual').reduce((sum, r) => sum + r.amountPaise, 0);
    setImmediate(() => notifyAdmins('admin.alert', { title: 'Manual refund needed', body: `₹${(manual / 100).toFixed(2)} collected offline for booking ${booking.ref} must be returned by hand.`, link: `/bookings/${booking._id}` }, 'refunds.manage'));
  }
  if (remaining > 0) logger.warn({ bookingId: booking._id, remaining }, 'refund exceeds refundable payments; remainder not refunded');
  return refunds;
}

/** Sends recorded refunds to Razorpay. Safe to call repeatedly (receipt = our refund id). */
export async function dispatchRefunds(refunds) {
  for (const r of refunds) await processRefund(r._id);
}

export async function processRefund(refundId) {
  const r = await Refund.findOneAndUpdate({ _id: refundId, status: 'pending', attempts: { $lt: MAX_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true });
  if (!r) return null;
  const payment = await Payment.findById(r.paymentId).lean();
  try {
    const res = await createRefund({ paymentId: payment.razorpayPaymentId, amountPaise: r.amountPaise, receipt: String(r._id), notes: { bookingId: String(r.bookingId), reason: r.reason } });
    const processed = res.status === 'processed';
    await Refund.updateOne({ _id: r._id }, { $set: { razorpayRefundId: res.id, status: processed ? 'processed' : 'initiated', processedAt: processed ? new Date() : undefined, lastError: null } });
    if (processed) await announceRefund(r);
  } catch (err) {
    const failed = r.attempts >= MAX_ATTEMPTS;
    await Refund.updateOne({ _id: r._id }, { $set: { lastError: err.message, ...(failed ? { status: 'failed' } : {}) } });
    logger.error({ refundId: r._id, err: err.message, attempt: r.attempts }, 'refund dispatch failed');
    if (failed) await notifyAdmins('admin.alert', { title: 'Refund failed', body: `Refund ${r._id} for booking ${r.bookingId} failed after ${r.attempts} attempts: ${err.message}`, link: `/bookings/${r.bookingId}` }, 'refunds.manage');
  }
  return r;
}

async function announceRefund(r) {
  const b = await Booking.findById(r.bookingId).select('ref userId').lean();
  if (b) await notify('refund.processed', { realm: 'user', id: b.userId }, { amountPaise: r.amountPaise, ref: b.ref, bookingId: b._id }, { dedupeKey: `refund:${r._id}` });
}

/** Webhook: refund.processed / refund.failed. */
export async function applyRefundEvent(entity, status) {
  const r = await Refund.findOne({ $or: [{ razorpayRefundId: entity.id }, { _id: /^[a-f0-9]{24}$/.test(entity.receipt || '') ? entity.receipt : null }] });
  if (!r) return false;
  if (status === 'processed' && r.status !== 'processed') {
    r.status = 'processed';
    r.razorpayRefundId ||= entity.id;
    r.processedAt = new Date();
    await r.save();
    await announceRefund(r);
  } else if (status === 'failed' && r.status !== 'processed') {
    r.status = 'failed';
    r.lastError = 'Reported failed by Razorpay';
    await r.save();
  }
  return true;
}

/** Job: retry refunds that never reached Razorpay. */
export async function retryPendingRefunds() {
  const stuck = await Refund.find({ status: 'pending', attempts: { $lt: MAX_ATTEMPTS }, updatedAt: { $lt: new Date(Date.now() - 2 * 60_000) } }).limit(50).select('_id').lean();
  for (const r of stuck) await processRefund(r._id);
  return stuck.length;
}

/** Finance confirms an offline (manual) refund was handed back, with its reference. */
export async function markManualRefundProcessed(refundId, bookingId, reference) {
  const r = await Refund.findOneAndUpdate({ _id: refundId, bookingId, status: 'manual' }, { $set: { status: 'processed', processedAt: new Date(), manualReference: reference } }, { new: true });
  if (r) await announceRefund(r);
  return r;
}

export const serializeRefund = (r) => ({ id: r._id, amountPaise: r.amountPaise, reason: r.reason, status: r.status, destination: r.destination || 'source', note: r.note, razorpayRefundId: r.razorpayRefundId, manualReference: r.manualReference, createdAt: r.createdAt, processedAt: r.processedAt });

/**
 * Staff move a refund that is still waiting (offline money to return by hand, or a gateway refund that
 * failed) into the renter's WAY2CARS wallet instead.
 */
export async function refundToWallet(refundId, bookingId, by, session) {
  const r = await Refund.findOneAndUpdate({ _id: refundId, bookingId, status: { $in: ['manual', 'failed'] } }, { $set: { status: 'processed', destination: 'wallet', processedAt: new Date(), manualReference: 'WALLET' } }, { new: true, session });
  if (!r) return null;
  const b = await Booking.findById(bookingId).select('ref userId').session(session).lean();
  await creditUserWallet(b.userId, r.amountPaise, 'booking_refund', { bookingId, category: 'refund', note: `Refund for booking ${b.ref} (to wallet)`, key: `wallet-refund-move:${r._id}`, by }, session);
  return r;
}

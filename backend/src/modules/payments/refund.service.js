import { logger } from '../../core/logger.js';
import { Payment, Refund } from './payment.model.js';
import { Booking } from '../bookings/booking.model.js';
import { createRefund } from '../../integrations/razorpay.js';
import { notify, notifyAdmins } from '../notifications/notification.service.js';

const MAX_ATTEMPTS = 6;

/**
 * Records refunds of `amountPaise` for a booking, allocated across its captured payments
 * (oldest first, respecting what each has left). Runs inside the caller's transaction; the
 * provider call happens after commit via dispatchRefunds(). Idempotent per `key`.
 * Returns the created Refund docs.
 */
export async function recordBookingRefund(booking, amountPaise, reason, { key, by, note }, session) {
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
    const [r] = await Refund.create([{ bookingId: booking._id, paymentId: p._id, userId: booking.userId, amountPaise: take, reason, idempotencyKey: `${key}:${p._id}`, initiatedBy: by, note }], { session });
    refunds.push(r);
    remaining -= take;
  }
  const refunded = amountPaise - remaining;
  if (refunded > 0) {
    const b = await Booking.findByIdAndUpdate(booking._id, { $inc: { 'payment.refundedPaise': refunded } }, { new: true, session }).select('payment');
    const status = b.payment.refundedPaise >= b.payment.paidPaise ? 'refunded' : 'partially_refunded';
    await Booking.updateOne({ _id: booking._id }, { $set: { 'payment.status': status } }, { session });
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

export const serializeRefund = (r) => ({ id: r._id, amountPaise: r.amountPaise, reason: r.reason, status: r.status, razorpayRefundId: r.razorpayRefundId, createdAt: r.createdAt, processedAt: r.processedAt });

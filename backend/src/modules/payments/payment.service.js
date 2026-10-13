import { withTransaction } from '../../core/db.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import * as rzp from '../../integrations/razorpay.js';
import { Payment, WebhookEvent } from './payment.model.js';
import { applyRefundEvent } from './refund.service.js';
import { Booking } from '../bookings/booking.model.js';
import { User } from '../users/user.model.js';
import { onBookingPaid, onExtensionPaid, onSettlementPaid, afterPaymentCommit } from '../bookings/booking.lifecycle.js';

/**
 * Creates (or reuses) a Razorpay order for an amount the SERVER computed.
 * Returns what the Android Razorpay SDK needs to open checkout.
 */
export async function openPaymentOrder({ booking, purpose, amountPaise, extensionId }) {
  if (amountPaise < 100) throw badRequest('Amount is too small to collect online.');
  const reusable = await Payment.findOne({ bookingId: booking._id, purpose, extensionId: extensionId || null, status: 'created', amountPaise, createdAt: { $gt: new Date(Date.now() - 30 * 60_000) } }).lean();
  let payment = reusable;
  if (!payment) {
    const order = await rzp.createOrder({ amountPaise, receipt: `${booking.ref}-${purpose[0]}${Date.now().toString(36)}`, notes: { bookingId: String(booking._id), purpose, ref: booking.ref } });
    payment = (await Payment.create({ bookingId: booking._id, userId: booking.userId, purpose, extensionId, amountPaise, razorpayOrderId: order.id })).toObject();
  }
  const user = await User.findById(booking.userId).select('name phone email razorpayCustomerId').lean();
  return {
    paymentId: payment._id,
    keyId: rzp.publicKeyId(),
    orderId: payment.razorpayOrderId,
    amountPaise: payment.amountPaise,
    currency: 'INR',
    name: 'WAY2CARS',
    description: `${purpose === 'booking' ? 'Booking' : purpose === 'extension' ? 'Trip extension' : 'Trip settlement'} ${booking.ref}`,
    prefill: { name: user?.name || '', contact: user?.phone ? `+91${user.phone}` : '', email: user?.email || '' },
    customerId: user?.razorpayCustomerId || undefined,
  };
}

/**
 * Single idempotent path that turns a captured Razorpay payment into business state.
 * Called by checkout verification, webhooks and the reconciliation job.
 */
export async function confirmCapturedPayment({ orderId, rzpPayment, via }) {
  const result = await withTransaction(async (session) => {
    const payment = await Payment.findOne({ razorpayOrderId: orderId }).session(session);
    if (!payment) return { status: 'unknown_order' };
    if (payment.status === 'paid') return { status: 'already_paid', payment };
    if (rzpPayment.amount !== payment.amountPaise || rzpPayment.currency !== 'INR') {
      payment.status = 'amount_mismatch';
      payment.razorpayPaymentId = rzpPayment.id;
      await payment.save({ session });
      logger.error({ orderId, expected: payment.amountPaise, got: rzpPayment.amount }, 'payment amount mismatch — held for review');
      return { status: 'amount_mismatch', payment };
    }
    payment.status = 'paid';
    payment.razorpayPaymentId = rzpPayment.id;
    payment.method = rzpPayment.method;
    payment.verifiedVia = via;
    payment.paidAt = rzpPayment.created_at ? new Date(rzpPayment.created_at * 1000) : new Date();
    await payment.save({ session });
    const booking = await Booking.findById(payment.bookingId).session(session);
    await Booking.updateOne({ _id: booking._id }, { $inc: { 'payment.paidPaise': payment.amountPaise } }, { session });
    let effects;
    if (payment.purpose === 'booking') effects = await onBookingPaid(booking, payment, session);
    else if (payment.purpose === 'extension') effects = await onExtensionPaid(booking, payment, session);
    else effects = await onSettlementPaid(booking, payment, session);
    return { status: 'confirmed', payment, effects };
  });
  if (result.status === 'confirmed') await afterPaymentCommit(result.effects);
  return result;
}

/** Android checkout callback: verify the signature, then ask Razorpay for the truth. */
export async function verifyCheckout({ userId, orderId, paymentId, signature }) {
  const payment = await Payment.findOne({ razorpayOrderId: orderId, userId }).lean();
  if (!payment) throw notFound('Payment');
  if (!rzp.verifyPaymentSignature({ orderId, paymentId, signature })) throw badRequest('Payment verification failed.', undefined, 'PAYMENT_SIGNATURE_INVALID');
  if (payment.status === 'paid') return { status: 'paid', bookingId: payment.bookingId };
  const rp = await rzp.fetchPayment(paymentId);
  if (rp.order_id !== orderId) throw badRequest('Payment does not belong to this order.', undefined, 'PAYMENT_ORDER_MISMATCH');
  if (rp.status === 'captured') {
    const r = await confirmCapturedPayment({ orderId, rzpPayment: rp, via: 'checkout' });
    if (r.status === 'amount_mismatch') throw conflict('Payment amount did not match. Our team will review and refund if needed.', 'PAYMENT_AMOUNT_MISMATCH');
    return { status: 'paid', bookingId: payment.bookingId };
  }
  if (rp.status === 'authorized') return { status: 'processing', bookingId: payment.bookingId }; // capture webhook will follow
  return { status: rp.status, bookingId: payment.bookingId };
}

export async function markPaymentFailed(orderId, reason) {
  const p = await Payment.findOneAndUpdate({ razorpayOrderId: orderId, status: 'created' }, { $set: { failureReason: String(reason || '').slice(0, 300) }, $inc: { attempts: 1 } }, { new: true }).lean();
  return p;
}

/** Razorpay webhook entry point. Rejects bad signatures; replays are no-ops. */
export async function handleRazorpayWebhook(rawBody, signature, eventIdHeader) {
  if (!rzp.verifyWebhookSignature(rawBody, signature)) return { httpStatus: 400, body: { error: 'invalid signature' } };
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { httpStatus: 400, body: { error: 'invalid json' } };
  }
  const eventId = eventIdHeader || `${event.event}:${event.payload?.payment?.entity?.id || event.payload?.refund?.entity?.id || event.created_at}`;
  try {
    await WebhookEvent.create({ provider: 'razorpay', eventId, event: event.event, payload: { event: event.event, created_at: event.created_at } });
  } catch (err) {
    if (err?.code === 11000) return { httpStatus: 200, body: { status: 'duplicate' } };
    throw err;
  }
  try {
    const pay = event.payload?.payment?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        if (pay?.status === 'captured') await confirmCapturedPayment({ orderId: pay.order_id, rzpPayment: pay, via: 'webhook' });
        break;
      case 'payment.failed':
        if (pay) await markPaymentFailed(pay.order_id, pay.error_description);
        break;
      case 'refund.processed':
        await applyRefundEvent(event.payload.refund.entity, 'processed');
        break;
      case 'refund.failed':
        await applyRefundEvent(event.payload.refund.entity, 'failed');
        break;
      default:
        await WebhookEvent.updateOne({ provider: 'razorpay', eventId }, { $set: { status: 'ignored' } });
        return { httpStatus: 200, body: { status: 'ignored' } };
    }
    await WebhookEvent.updateOne({ provider: 'razorpay', eventId }, { $set: { status: 'processed' } });
    return { httpStatus: 200, body: { status: 'ok' } };
  } catch (err) {
    // Remove the idempotency marker so Razorpay's retry can be processed.
    await WebhookEvent.deleteOne({ provider: 'razorpay', eventId });
    logger.error({ err, event: event.event }, 'webhook processing failed');
    return { httpStatus: 500, body: { error: 'processing failed' } };
  }
}

/** Job: ask Razorpay about orders still "created" (missed webhooks, app killed mid-checkout). */
export async function reconcilePendingPayments() {
  const candidates = await Payment.find({ status: 'created', createdAt: { $lt: new Date(Date.now() - 3 * 60_000), $gt: new Date(Date.now() - 3 * 86400_000) }, $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: new Date(Date.now() - 5 * 60_000) } }] })
    .limit(50).lean();
  let confirmed = 0;
  for (const p of candidates) {
    try {
      await Payment.updateOne({ _id: p._id }, { $set: { lastCheckedAt: new Date() } });
      const list = await rzp.fetchOrderPayments(p.razorpayOrderId);
      const captured = (list.items || []).find((x) => x.status === 'captured');
      if (captured) {
        await confirmCapturedPayment({ orderId: p.razorpayOrderId, rzpPayment: captured, via: 'reconcile' });
        confirmed++;
      } else if (Date.now() - new Date(p.createdAt).getTime() > 86400_000) {
        await Payment.updateOne({ _id: p._id, status: 'created' }, { $set: { status: 'failed', failureReason: 'Not completed' } });
      }
    } catch (err) {
      logger.warn({ orderId: p.razorpayOrderId, err: err.message }, 'reconcile failed for order');
    }
  }
  return confirmed;
}

export const serializePayment = (p) => ({ id: p._id, bookingId: p.bookingId, purpose: p.purpose, amountPaise: p.amountPaise, status: p.status, method: p.method, razorpayPaymentId: p.razorpayPaymentId, paidAt: p.paidAt, refundedPaise: p.refundedPaise, createdAt: p.createdAt });

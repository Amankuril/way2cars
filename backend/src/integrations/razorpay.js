import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { hmac, safeEqual } from '../core/crypto.js';
import { providerError, unavailable } from '../core/errors.js';
import { logger } from '../core/logger.js';

/**
 * Razorpay — the ONLY module that talks to the payment gateway.
 * Amounts are integer paise. Business code decides amounts; this layer never trusts clients.
 */

let client = null;
function rzp() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw unavailable('Payments are not configured.', 'PAYMENTS_UNAVAILABLE');
  client ||= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

export const publicKeyId = () => env.RAZORPAY_KEY_ID || null;

async function call(op, fn) {
  try {
    return await fn();
  } catch (err) {
    const description = err?.error?.description || err?.message;
    logger.error({ op, statusCode: err?.statusCode, code: err?.error?.code, description }, 'razorpay call failed');
    throw providerError('The payment provider is unavailable right now. Please try again.', 'PAYMENT_PROVIDER_ERROR');
  }
}

export function createOrder({ amountPaise, receipt, notes }) {
  return call('orders.create', () =>
    rzp().orders.create({ amount: amountPaise, currency: 'INR', receipt: String(receipt).slice(0, 40), notes, payment_capture: 1 }),
  );
}

export const fetchOrder = (orderId) => call('orders.fetch', () => rzp().orders.fetch(orderId));
export const fetchOrderPayments = (orderId) => call('orders.fetchPayments', () => rzp().orders.fetchPayments(orderId));
export const fetchPayment = (paymentId) => call('payments.fetch', () => rzp().payments.fetch(paymentId));

/** Refunds are idempotent on our side via `receipt` (unique per refund record). */
export function createRefund({ paymentId, amountPaise, receipt, notes }) {
  return call('payments.refund', () => rzp().payments.refund(paymentId, { amount: amountPaise, speed: 'normal', receipt, notes }));
}
export const fetchRefund = (paymentId, refundId) => call('payments.fetchRefund', () => rzp().payments.fetchRefund(paymentId, refundId));

export function createCustomer({ name, contact, email }) {
  return call('customers.create', () => rzp().customers.create({ name: name || 'WAY2CARS customer', contact: `+91${contact}`, email: email || undefined, fail_existing: 0 }));
}
export const listSavedTokens = (customerId) => call('customers.fetchTokens', () => rzp().customers.fetchTokens(customerId));
export const deleteSavedToken = (customerId, tokenId) => call('customers.deleteToken', () => rzp().customers.deleteToken(customerId, tokenId));

/** Checkout handler signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!env.RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature || !Buffer.isBuffer(rawBody)) return false;
  return safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}

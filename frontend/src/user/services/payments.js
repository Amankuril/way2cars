import RazorpayCheckout from '@/mobile/app/razorpay';
import { api } from '../api';

/**
 * Opens Razorpay Checkout for an order the SERVER created, then asks the server to verify.
 * Returns { status: 'paid' | 'processing' | 'cancelled' | 'failed', message? }.
 * The app never decides a booking is paid — only the server's verify/webhook does.
 */
export async function payOrder(order) {
  let result;
  try {
    result = await RazorpayCheckout.open({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: order.prefill,
      customer_id: order.customerId,
      ...(order.customerId ? { save: 1 } : {}),
      theme: { color: '#1875B9' },
      retry: { enabled: true, max_count: 3 },
    });
  } catch (err) {
    const cancelled = err?.code === 0 || err?.code === 2 || /cancel/i.test(err?.description || '');
    await api.post('/api/v1/user/bookings/payments/failed', { razorpayOrderId: order.orderId, reason: cancelled ? 'cancelled' : String(err?.description || 'failed').slice(0, 280) }).catch(() => {});
    return { status: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'Payment cancelled.' : 'Payment failed. If money was deducted it will be refunded automatically.' };
  }
  const v = await api.post('/api/v1/user/bookings/payments/verify', {
    razorpayOrderId: result.razorpay_order_id,
    razorpayPaymentId: result.razorpay_payment_id,
    razorpaySignature: result.razorpay_signature,
  });
  return { status: v.status === 'paid' ? 'paid' : 'processing' };
}

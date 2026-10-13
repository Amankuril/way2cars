/**
 * Razorpay Checkout for the web with the react-native-razorpay API:
 *   RazorpayCheckout.open(options) → Promise<{ razorpay_order_id, razorpay_payment_id, razorpay_signature }>
 *   rejects with { code, description } — code 2 = cancelled by the user (as on Android),
 *   code 'PAYMENT_FAILED' = the last attempt failed and the user closed checkout, 'SCRIPT' = SDK failed to load.
 * So apps/user/src/services/payments.js ports unchanged apart from the import (the server
 * creates the order and verifies the signature; the client never decides a booking is paid).
 */
const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay unavailable')));
    s.onerror = () => { loading = null; s.remove(); reject(new Error('Could not load Razorpay. Check your connection.')); };
    document.head.appendChild(s);
  });
  return loading;
}

const RazorpayCheckout = {
  async open(options) {
    let Razorpay;
    try {
      Razorpay = await loadRazorpay();
    } catch (e) {
      throw { code: 'SCRIPT', description: e.message }; // eslint-disable-line no-throw-literal
    }
    return new Promise((resolve, reject) => {
      let lastError = null;
      let done = false;
      const rzp = new Razorpay({
        ...options,
        handler: (r) => {
          done = true;
          resolve({ razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature });
        },
        modal: {
          ...(options.modal || {}),
          ondismiss: () => {
            if (done) return;
            done = true;
            reject(lastError ? { code: 'PAYMENT_FAILED', description: lastError } : { code: 2, description: 'Payment cancelled by user' });
          },
        },
      });
      rzp.on('payment.failed', (resp) => {
        lastError = resp?.error?.description || 'Payment failed';
      });
      rzp.open();
    });
  },
};

export default RazorpayCheckout;
export { RazorpayCheckout };

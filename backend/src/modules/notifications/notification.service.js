import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { sendPush } from '../../integrations/firebase.js';
import { sendEmail } from '../../integrations/email.js';
import { Notification, DeviceToken } from './notification.model.js';
import { User } from '../users/user.model.js';
import { Vendor } from '../vendors/vendor.model.js';
import { AdminUser } from '../admin/admin.model.js';

/**
 * Single notification dispatcher. Business code calls notify(event, recipient, data); templates
 * below decide copy and channels. Transactional events ignore the "promotional" preference but
 * respect per-channel opt-outs where the law allows. Never throws into the caller.
 */

const MODELS = { user: User, vendor: Vendor, admin: AdminUser };
const APP_PATH = { user: '/user', vendor: '/vendor', admin: '/admin' };

const T = {
  'booking.created_pending_vendor': (d) => ({ category: 'booking', title: 'Booking request sent', body: `We've asked the host to confirm ${d.vehicle}. You'll hear back within ${d.slaMinutes} minutes.`, link: `/trips/${d.bookingId}` }),
  'booking.confirmed': (d) => ({ category: 'booking', title: 'Booking confirmed', body: `${d.vehicle} is booked from ${d.start} to ${d.end}. Ref ${d.ref}.`, link: `/trips/${d.bookingId}`, email: true }),
  'booking.rejected': (d) => ({ category: 'booking', title: 'Host could not confirm', body: `The host declined booking ${d.ref}. A full refund has been initiated.`, link: `/trips/${d.bookingId}`, email: true }),
  'booking.cancelled': (d) => ({ category: 'booking', title: 'Booking cancelled', body: `Booking ${d.ref} was cancelled.${d.refundPaise ? ` Refund of ₹${(d.refundPaise / 100).toFixed(0)} initiated.` : ''}`, link: `/trips/${d.bookingId}`, email: true }),
  'booking.expired': (d) => ({ category: 'booking', title: 'Booking not completed', body: `Payment for ${d.vehicle} wasn't completed in time, so the hold was released.`, link: `/trips/${d.bookingId}` }),
  'booking.extended': (d) => ({ category: 'booking', title: 'Trip extended', body: `Booking ${d.ref} now ends ${d.end}.`, link: `/trips/${d.bookingId}` }),
  'payment.succeeded': (d) => ({ category: 'payment', title: 'Payment received', body: `₹${(d.amountPaise / 100).toFixed(2)} received for booking ${d.ref}.`, link: `/trips/${d.bookingId}` }),
  'payment.failed': (d) => ({ category: 'payment', title: 'Payment failed', body: `Your payment for booking ${d.ref} did not go through. No money was deducted, or it will be auto-reversed by your bank.`, link: `/trips/${d.bookingId}` }),
  'refund.processed': (d) => ({ category: 'payment', title: 'Refund processed', body: `₹${(d.amountPaise / 100).toFixed(2)} has been refunded for booking ${d.ref}. It can take 5–7 working days to reflect.`, link: `/trips/${d.bookingId}`, email: true }),
  'trip.pickup_reminder': (d) => ({ category: 'trip', title: 'Pickup reminder', body: `Your trip with ${d.vehicle} starts at ${d.start}. Keep your licence handy.`, link: `/trips/${d.bookingId}` }),
  'trip.return_reminder': (d) => ({ category: 'trip', title: 'Return reminder', body: `Please return ${d.vehicle} by ${d.end}. Late returns are charged.`, link: `/trips/${d.bookingId}` }),
  'trip.started': (d) => ({ category: 'trip', title: 'Trip started', body: `Drive safe! Your trip ${d.ref} has started.`, link: `/trips/${d.bookingId}` }),
  'trip.completed': (d) => ({ category: 'trip', title: 'Trip completed', body: `Thanks for driving with WAY2CARS. ${d.depositRefundPaise ? `₹${(d.depositRefundPaise / 100).toFixed(0)} of your deposit is being refunded.` : ''}`.trim(), link: `/trips/${d.bookingId}`, email: true }),
  'kyc.approved': () => ({ category: 'kyc', title: 'Verification approved', body: 'Your documents are verified. You can now book any car.', link: '/profile/kyc' }),
  'kyc.rejected': (d) => ({ category: 'kyc', title: 'Verification needs attention', body: d.reason ? `We couldn't verify your documents: ${d.reason}` : "We couldn't verify your documents. Please re-upload.", link: '/profile/kyc' }),
  'referral.rewarded': (d) => ({ category: 'promo', title: 'Referral reward credited', body: `₹${(d.amountPaise / 100).toFixed(0)} was added to your WAY2CARS wallet.`, link: '/wallet' }),
  'support.reply': (d) => ({ category: 'support', title: 'Support replied', body: `New reply on ticket ${d.ref}.`, link: `/support/${d.ticketId}` }),
  'promo.broadcast': (d) => ({ category: 'promo', title: d.title, body: d.body, link: d.link || '/', promotional: true }),
  // vendor
  'vendor.booking_request': (d) => ({ category: 'booking', title: 'New booking request', body: `${d.vehicle}, ${d.start} – ${d.end}. Respond within ${d.slaMinutes} minutes.`, link: `/bookings/${d.bookingId}` }),
  'vendor.booking_confirmed': (d) => ({ category: 'booking', title: 'New confirmed booking', body: `${d.vehicle} is booked ${d.start} – ${d.end}.`, link: `/bookings/${d.bookingId}` }),
  'vendor.booking_cancelled': (d) => ({ category: 'booking', title: 'Booking cancelled', body: `Booking ${d.ref} for ${d.vehicle} was cancelled.`, link: `/bookings/${d.bookingId}` }),
  'vendor.return_submitted': (d) => ({ category: 'trip', title: 'Car returned — review needed', body: `Review the return of ${d.vehicle} (booking ${d.ref}) within ${d.hours} hours.`, link: `/bookings/${d.bookingId}` }),
  'vendor.trip_started': (d) => ({ category: 'trip', title: 'Trip started', body: `${d.vehicle} has been picked up (booking ${d.ref}).`, link: `/bookings/${d.bookingId}` }),
  'vendor.approved': () => ({ category: 'account', title: 'You are approved', body: 'Your host account is approved. Submit your cars for listing.', link: '/', email: true }),
  'vendor.rejected': (d) => ({ category: 'account', title: 'Host application needs changes', body: d.reason || 'Please review your details and resubmit.', link: '/onboarding' }),
  'vendor.vehicle_approved': (d) => ({ category: 'vehicle', title: 'Car approved', body: `${d.vehicle} is live and can receive bookings.`, link: `/vehicles/${d.vehicleId}` }),
  'vendor.vehicle_rejected': (d) => ({ category: 'vehicle', title: 'Car listing needs changes', body: `${d.vehicle}: ${d.reason || 'see details'}`, link: `/vehicles/${d.vehicleId}` }),
  'vendor.payout_paid': (d) => ({ category: 'payout', title: 'Payout sent', body: `₹${(d.amountPaise / 100).toFixed(2)} was transferred. Ref ${d.utr}.`, link: '/earnings', email: true }),
  'vendor.payout_rejected': (d) => ({ category: 'payout', title: 'Withdrawal declined', body: d.reason || 'Your withdrawal request was declined. The amount is back in your balance.', link: '/earnings' }),
  'vendor.earning_released': (d) => ({ category: 'payout', title: 'Earnings available', body: `₹${(d.amountPaise / 100).toFixed(2)} is now available to withdraw.`, link: '/earnings' }),
  // admin
  'admin.alert': (d) => ({ category: 'system', title: d.title, body: d.body, link: d.link || '/' }),
  'admin.roadside_request': (d) => ({ category: 'support', title: 'Roadside assistance requested', body: `${d.type} — booking ${d.ref}`, link: `/support/${d.ticketId}` }),
};

export const NOTIFICATION_EVENTS = Object.keys(T);

async function loadRecipient(realm, id) {
  const fields = realm === 'admin' ? 'email name status' : 'phone email name status notificationPrefs';
  return MODELS[realm].findById(id).select(fields).lean();
}

/**
 * @param {string} event  key of T
 * @param {{realm:string,id:any}} to
 * @param {object} data   template data
 * @param {{dedupeKey?:string}} opts  dedupeKey makes the notification idempotent (e.g. reminders)
 */
export async function notify(event, to, data = {}, { dedupeKey } = {}) {
  try {
    const tpl = T[event]?.(data);
    if (!tpl) throw new Error(`Unknown notification event ${event}`);
    const account = await loadRecipient(to.realm, to.id);
    if (!account || ['deleted', 'suspended', 'disabled'].includes(account.status)) return null;
    const prefs = account.notificationPrefs || {};
    if (tpl.promotional && prefs.promotional === false) return null;

    let doc;
    try {
      doc = await Notification.create({ recipient: to, event, category: tpl.category, title: tpl.title, body: tpl.body, link: tpl.link, data: data.bookingId ? { bookingId: String(data.bookingId) } : undefined, dedupeKey });
    } catch (err) {
      if (err?.code === 11000) return null; // already sent
      throw err;
    }

    const channels = {};
    if (prefs.push !== false && to.realm !== 'admin') {
      const tokens = await DeviceToken.find({ 'owner.realm': to.realm, 'owner.id': to.id }).select('token').lean();
      if (tokens.length) {
        const r = await sendPush(tokens.map((t) => t.token), {
          title: tpl.title,
          body: tpl.body,
          data: { event, link: tpl.link || '/' },
          link: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}${APP_PATH[to.realm]}${tpl.link || '/'}`,
        });
        if (r.deadTokens.length) await DeviceToken.deleteMany({ token: { $in: r.deadTokens } });
        channels.push = r.skipped ? 'skipped' : r.sent ? 'sent' : 'failed';
      }
    }
    if ((tpl.email || to.realm === 'admin') && prefs.email !== false && account.email) {
      channels.email = (await sendEmail({
        to: account.email,
        subject: `${tpl.title} — WAY2CARS`,
        heading: tpl.title,
        lines: [tpl.body],
        cta: tpl.link ? { label: 'Open WAY2CARS', url: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}${APP_PATH[to.realm]}${tpl.link}` } : undefined,
      })).status;
    }
    if (Object.keys(channels).length) await Notification.updateOne({ _id: doc._id }, { $set: { channels } });
    return doc;
  } catch (err) {
    logger.error({ err, event }, 'notification dispatch failed');
    return null;
  }
}

/** Fire-and-forget wrapper for use after a transaction commits. */
export function notifyLater(event, to, data, opts) {
  setImmediate(() => {
    notify(event, to, data, opts);
  });
}

/** Notifies every active admin holding a permission (used for operational alerts). */
export async function notifyAdmins(event, data, permission) {
  const { hasPermission } = await import('../auth/permissions.js');
  const admins = await AdminUser.find({ status: 'active' }).select('role').lean();
  await Promise.all(admins.filter((a) => !permission || hasPermission(a.role, permission)).map((a) => notify(event, { realm: 'admin', id: a._id }, data)));
}

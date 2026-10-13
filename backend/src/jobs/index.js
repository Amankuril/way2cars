import { schedule } from '../core/jobs.js';
import { purgeOrphanFiles } from '../modules/files/files.service.js';
import { expireHolds, timeoutVendorApprovals } from '../modules/bookings/booking.service.js';
import { reconcilePendingPayments } from '../modules/payments/payment.service.js';
import { retryPendingRefunds } from '../modules/payments/refund.service.js';
import { autoCompleteReturns } from '../modules/trips/trip.service.js';
import { releaseDueEarnings } from '../modules/payouts/payout.routes.js';
import { sendTripReminders } from './reminders.js';

const MIN = 60_000;

/** All background work. Each job runs on one instance at a time (Mongo lease lock). */
export function startJobs() {
  schedule('bookings.expire-holds', 1 * MIN, expireHolds);
  schedule('bookings.vendor-approval-timeouts', 2 * MIN, timeoutVendorApprovals);
  schedule('payments.reconcile', 5 * MIN, reconcilePendingPayments);
  schedule('refunds.retry', 5 * MIN, retryPendingRefunds);
  schedule('trips.auto-complete-returns', 15 * MIN, autoCompleteReturns);
  schedule('trips.reminders', 5 * MIN, sendTripReminders);
  schedule('earnings.release', 30 * MIN, releaseDueEarnings);
  schedule('files.purge-orphans', 60 * MIN, () => purgeOrphanFiles(24));
}

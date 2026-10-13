import { Booking } from '../modules/bookings/booking.model.js';
import { notify } from '../modules/notifications/notification.service.js';
import { formatIst } from '../core/time.js';

const HOUR = 3600_000;

/** Pickup reminder ~2h before start; return reminder ~1h before end. Idempotent via dedupe keys. */
export async function sendTripReminders() {
  const now = Date.now();
  const pickups = await Booking.find({ status: 'confirmed', 'remindersSent.pickup': { $ne: true }, startAt: { $gt: new Date(now), $lte: new Date(now + 2 * HOUR) } }).limit(200).lean();
  for (const b of pickups) {
    await notify('trip.pickup_reminder', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, start: formatIst(b.startAt) }, { dedupeKey: `pickup-reminder:${b._id}` });
    await Booking.updateOne({ _id: b._id }, { $set: { 'remindersSent.pickup': true } });
  }
  const returns = await Booking.find({ status: 'ongoing', 'remindersSent.return': { $ne: true }, endAt: { $gt: new Date(now), $lte: new Date(now + HOUR) } }).limit(200).lean();
  for (const b of returns) {
    await notify('trip.return_reminder', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, end: formatIst(b.endAt) }, { dedupeKey: `return-reminder:${b._id}:${b.endAt.getTime()}` });
    await Booking.updateOne({ _id: b._id }, { $set: { 'remindersSent.return': true } });
  }
  return pickups.length + returns.length;
}

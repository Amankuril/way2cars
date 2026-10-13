import { Booking, overlapFilter } from './booking.model.js';
import { VehicleBlock } from '../vehicles/vehicle.model.js';
import { getSettings } from '../settings/settings.service.js';
import { badRequest } from '../../core/errors.js';
import { DAY_MS } from '../../core/time.js';

/** True when no blocking booking (with buffer) or vendor block overlaps [startAt, endAt). */
export async function isVehicleAvailable(vehicleId, startAt, endAt, { session, excludeBookingId, bufferMinutes } = {}) {
  const buffer = bufferMinutes ?? (await getSettings()).booking.bufferMinutes;
  const [booking, block] = await Promise.all([
    Booking.exists(overlapFilter(vehicleId, startAt, endAt, buffer, { excludeBookingId })).session(session || null),
    VehicleBlock.exists({ vehicleId, startAt: { $lt: endAt }, endAt: { $gt: startAt } }).session(session || null),
  ]);
  return !booking && !block;
}

/**
 * Validates a requested trip window against platform rules. Times must be on 30-minute steps.
 * Returns normalised Date objects.
 */
export async function validateTripWindow(startAt, endAt, { now = new Date(), skipLead = false } = {}) {
  const s = new Date(startAt);
  const e = new Date(endAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw badRequest('Choose valid pickup and return times.', undefined, 'INVALID_DATES');
  const { booking } = await getSettings();
  const step = 30 * 60_000;
  if (s.getTime() % step || e.getTime() % step) throw badRequest('Pickup and return times must be on the hour or half hour.', undefined, 'INVALID_DATES');
  if (e <= s) throw badRequest('Return time must be after pickup time.', undefined, 'INVALID_DATES');
  if (!skipLead && s.getTime() < now.getTime() + booking.minLeadMinutes * 60_000) throw badRequest(`Pickup must be at least ${booking.minLeadMinutes} minutes from now.`, undefined, 'PICKUP_TOO_SOON');
  if (s.getTime() > now.getTime() + booking.maxAdvanceDays * DAY_MS) throw badRequest(`Bookings open ${booking.maxAdvanceDays} days in advance.`, undefined, 'PICKUP_TOO_FAR');
  const hours = (e - s) / 3600_000;
  if (hours < booking.minDurationHours) throw badRequest(`Minimum trip length is ${booking.minDurationHours} hours.`, undefined, 'TRIP_TOO_SHORT');
  if (hours > booking.maxDurationDays * 24) throw badRequest(`Maximum trip length is ${booking.maxDurationDays} days.`, undefined, 'TRIP_TOO_LONG');
  return { startAt: s, endAt: e, hours };
}

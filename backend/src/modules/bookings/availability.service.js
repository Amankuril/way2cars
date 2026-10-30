import { Booking, overlapFilter, BLOCKING_STATUSES } from './booking.model.js';
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

const STEP_MS = 30 * 60_000;
const ceilStep = (ms) => Math.ceil(ms / STEP_MS) * STEP_MS;

/**
 * Earliest start (on a 30-minute step, at or after `from`) when each car is free for `durationMs`,
 * honouring the buffer around bookings and host blocks. Looks `horizonDays` ahead; null if still busy.
 * Returns Map(vehicleId string → Date | null).
 */
export async function nextAvailableStarts(vehicleIds, from, durationMs, { bufferMinutes, horizonDays = 90, now = new Date() } = {}) {
  const buffer = (bufferMinutes ?? (await getSettings()).booking.bufferMinutes) * 60_000;
  const start = new Date(from);
  const horizon = new Date(start.getTime() + horizonDays * DAY_MS);
  const [bookings, blocks] = await Promise.all([
    Booking.find({ vehicleId: { $in: vehicleIds }, status: { $in: BLOCKING_STATUSES }, blockEndAt: { $gt: new Date(start.getTime() - buffer) }, startAt: { $lt: horizon }, $or: [{ status: { $ne: 'pending_payment' } }, { holdExpiresAt: { $gt: now } }] }).select('vehicleId startAt blockEndAt').lean(),
    VehicleBlock.find({ vehicleId: { $in: vehicleIds }, endAt: { $gt: start }, startAt: { $lt: horizon } }).select('vehicleId startAt endAt').lean(),
  ]);
  const busy = new Map(vehicleIds.map((id) => [String(id), []]));
  for (const b of bookings) busy.get(String(b.vehicleId))?.push([b.startAt.getTime() - buffer, b.blockEndAt.getTime() + buffer]);
  for (const b of blocks) busy.get(String(b.vehicleId))?.push([b.startAt.getTime(), b.endAt.getTime()]);
  const out = new Map();
  for (const [id, list] of busy) {
    list.sort((a, b) => a[0] - b[0]);
    let t = ceilStep(start.getTime());
    for (const [s, e] of list) {
      if (s >= t + durationMs) break;
      if (e > t) t = ceilStep(e);
    }
    out.set(id, t < horizon.getTime() ? new Date(t) : null);
  }
  return out;
}

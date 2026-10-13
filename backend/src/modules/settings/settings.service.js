import { Settings } from './settings.model.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

/** Returns the platform settings (lean), creating defaults on first use. Cached for 30s. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  let doc = await Settings.findById('platform').lean();
  if (!doc) {
    try {
      doc = (await Settings.create({ _id: 'platform' })).toObject();
    } catch (err) {
      if (err?.code !== 11000) throw err;
      doc = await Settings.findById('platform').lean();
    }
  }
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

export function invalidateSettings() {
  cache = null;
}

/** Applies a partial update (already validated) and returns the new settings. */
export async function updateSettings(patch, adminId) {
  const set = {};
  const flatten = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
      else set[key] = v;
    }
  };
  flatten(patch);
  await getSettings({ fresh: true });
  const doc = await Settings.findByIdAndUpdate(
    'platform',
    { $set: { ...set, updatedBy: adminId }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  ).lean();
  invalidateSettings();
  return doc;
}

/** Public subset safe for any client. */
export function publicSettings(s) {
  return {
    booking: {
      minDurationHours: s.booking.minDurationHours,
      maxDurationDays: s.booking.maxDurationDays,
      minLeadMinutes: s.booking.minLeadMinutes,
      maxAdvanceDays: s.booking.maxAdvanceDays,
      holdMinutes: s.booking.holdMinutes,
      kycRequired: s.booking.kycRequired,
    },
    cancellation: s.cancellation,
    tax: { rentalGstBps: s.tax.rentalGstBps },
    fees: { convenienceFeePaise: s.fees.convenienceFeePaise, deliveryMaxKm: s.fees.deliveryMaxKm },
    trip: { lateGraceMinutes: s.trip.lateGraceMinutes, minPickupPhotos: s.trip.minPickupPhotos },
    referral: s.referral,
    support: s.support,
  };
}

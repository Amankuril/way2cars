import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { hmac, safeEqual } from '../../core/crypto.js';
import { ok } from '../../core/http.js';
import { notFound } from '../../core/errors.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { insideGeofence, fromGeoPoint } from '../../integrations/maps.js';
import { signTripTrackingToken, verifyTripTrackingToken } from '../auth/token.service.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { City } from '../catalog/catalog.model.js';
import { Booking } from '../bookings/booking.model.js';

/**
 * Live tracking. Positions come from the renter's phone during a trip (TRACKING_PROVIDER=phone) or from a
 * telematics provider posting signed webhooks (TRACKING_PROVIDER=generic-webhook). With neither configured
 * the API reports `trackingAvailable: false` — nothing is simulated.
 * Phone positions show where the renter's phone is, which is normally but not always where the car is.
 */
const loc = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    deviceId: String,
    source: { type: String, enum: ['device', 'phone'], default: 'device' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    accuracyM: Number,
    point: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: [Number] },
    speedKmh: Number,
    headingDeg: Number,
    ignition: Boolean,
    recordedAt: { type: Date, required: true },
    insideServiceArea: Boolean,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
loc.index({ vehicleId: 1, recordedAt: -1 });
loc.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
export const VehicleLocation = mongoose.model('VehicleLocation', loc, 'vehicle_locations');

export const trackingEnabled = () => env.TRACKING_PROVIDER !== 'none';
export const phoneTrackingEnabled = () => env.TRACKING_PROVIDER === 'phone';
const SIGNAL_LOST_MS = 5 * 60_000;

async function fenceForCity(cityId) {
  const city = await City.findById(cityId).lean();
  if (!city) return null;
  return city.geofencePolygon?.length ? { polygon: city.geofencePolygon } : { center: fromGeoPoint(city.center), radiusMeters: city.serviceRadiusKm * 1000 };
}

/** Starts or resumes reporting for the renter's trip in progress. `active: false` tells the app to stop. */
export async function phoneTrackingSession(userId) {
  if (!phoneTrackingEnabled()) return { active: false };
  const b = await Booking.findOne({ userId, status: 'ongoing' }).sort({ 'trip.startedAt': -1 }).select('endAt').lean();
  if (!b) return { active: false };
  return { active: true, bookingId: String(b._id), token: signTripTrackingToken(b._id, b.endAt), path: '/api/v1/trip-tracking/positions', intervalSeconds: env.TRACKING_PHONE_INTERVAL_SECONDS };
}

const phonePositions = z.object({
  positions: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speedKmh: z.number().min(0).max(400).optional(),
    headingDeg: z.number().min(0).max(360).optional(),
    accuracyM: z.number().min(0).optional(),
    recordedAt: z.coerce.date(),
  }).strict()).min(1).max(200),
}).strict();

/** POST /trip-tracking/positions from the app's background service. 410 means stop reporting: the trip is over. */
export async function ingestPhonePositions(bearer, body) {
  if (!phoneTrackingEnabled()) return { httpStatus: 410, body: { error: 'tracking disabled' } };
  const bookingId = verifyTripTrackingToken(bearer);
  if (!bookingId) return { httpStatus: 401, body: { error: 'invalid token' } };
  const parsed = phonePositions.safeParse(body);
  if (!parsed.success) return { httpStatus: 422, body: { error: 'invalid payload' } };
  const b = await Booking.findById(bookingId).select('vehicleId status trip').lean();
  if (!b || b.status !== 'ongoing') return { httpStatus: 410, body: { error: 'trip not in progress' } };
  const from = (b.trip?.startedAt?.getTime() || 0) - 5 * 60_000;
  const to = Date.now() + 5 * 60_000;
  const valid = parsed.data.positions.filter((p) => p.recordedAt.getTime() >= from && p.recordedAt.getTime() <= to);
  if (valid.length) {
    const v = await Vehicle.findById(b.vehicleId).select('cityId').lean();
    const fence = v ? await fenceForCity(v.cityId) : null;
    await VehicleLocation.insertMany(valid.map((p) => ({
      vehicleId: b.vehicleId, bookingId: b._id, source: 'phone', point: { type: 'Point', coordinates: [p.lng, p.lat] }, speedKmh: p.speedKmh, headingDeg: p.headingDeg, accuracyM: p.accuracyM, recordedAt: p.recordedAt,
      insideServiceArea: fence ? insideGeofence(p, fence) : undefined,
    })));
  }
  return { httpStatus: 200, body: { accepted: valid.length } };
}

/** POST /webhooks/tracking — body: { registrationNumber, deviceId, positions: [{lat,lng,speedKmh,headingDeg,ignition,recordedAt}] } */
export async function ingestTracking(rawBody, signature) {
  if (env.TRACKING_PROVIDER !== 'generic-webhook') return { httpStatus: 404, body: { error: 'tracking disabled' } };
  if (!signature || !safeEqual(hmac(env.TRACKING_WEBHOOK_SECRET, rawBody), signature)) return { httpStatus: 401, body: { error: 'invalid signature' } };
  const parsed = z.object({
    registrationNumber: z.string().max(15),
    deviceId: z.string().max(64).optional(),
    positions: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), speedKmh: z.number().min(0).max(300).optional(), headingDeg: z.number().min(0).max(360).optional(), ignition: z.boolean().optional(), recordedAt: z.coerce.date() })).min(1).max(500),
  }).safeParse(JSON.parse(rawBody.toString('utf8') || '{}'));
  if (!parsed.success) return { httpStatus: 422, body: { error: 'invalid payload' } };
  const v = await Vehicle.findOne({ registrationNumber: parsed.data.registrationNumber.toUpperCase() }).select('cityId').lean();
  if (!v) return { httpStatus: 404, body: { error: 'unknown vehicle' } };
  const fence = await fenceForCity(v.cityId);
  await VehicleLocation.insertMany(parsed.data.positions.map((p) => ({
    vehicleId: v._id, deviceId: parsed.data.deviceId, point: { type: 'Point', coordinates: [p.lng, p.lat] }, speedKmh: p.speedKmh, headingDeg: p.headingDeg, ignition: p.ignition, recordedAt: p.recordedAt,
    insideServiceArea: fence ? insideGeofence(p, fence) : undefined,
  })));
  return { httpStatus: 200, body: { accepted: parsed.data.positions.length } };
}

/** Admin trip monitoring: latest position + route trace for a booking. */
export const adminTrackingRouter = Router();
adminTrackingRouter.get('/bookings/:id', requirePermission('trips.manage'), validate({ params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
  const b = await Booking.findById(req.valid.params.id).select('vehicleId trip startAt endAt status').lean();
  if (!b) throw notFound('Booking');
  if (!trackingEnabled()) return ok(res, { trackingAvailable: false, reason: 'GPS tracking is not turned on.' });
  const from = b.trip?.startedAt || b.startAt;
  const to = b.trip?.endedAt || new Date();
  // Newest first, so a long trip keeps its latest position instead of its first 5000.
  const points = (await VehicleLocation.find({ vehicleId: b.vehicleId, recordedAt: { $gte: from, $lte: to } }).sort({ recordedAt: -1 }).limit(5000).lean()).reverse();
  const last = points.at(-1);
  ok(res, {
    trackingAvailable: true,
    source: env.TRACKING_PROVIDER === 'phone' ? 'phone' : 'device',
    inProgress: b.status === 'ongoing',
    signalLost: b.status === 'ongoing' && (!last || Date.now() - last.recordedAt.getTime() > SIGNAL_LOST_MS),
    latest: points.at(-1) ? { ...fromGeoPoint(points.at(-1).point), recordedAt: points.at(-1).recordedAt, speedKmh: points.at(-1).speedKmh, insideServiceArea: points.at(-1).insideServiceArea } : null,
    route: points.map((p) => [p.point.coordinates[1], p.point.coordinates[0]]),
    geofenceExits: points.filter((p) => p.insideServiceArea === false).length,
  });
});

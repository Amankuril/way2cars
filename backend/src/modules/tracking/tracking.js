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
import { Vehicle } from '../vehicles/vehicle.model.js';
import { City } from '../catalog/catalog.model.js';
import { Booking } from '../bookings/booking.model.js';

/**
 * Live tracking integration boundary. Positions come ONLY from a telematics provider posting
 * signed webhooks (TRACKING_PROVIDER=generic-webhook). With no provider configured the API
 * reports `trackingAvailable: false` — nothing is simulated.
 */
const loc = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    deviceId: String,
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

/** POST /webhooks/tracking — body: { registrationNumber, deviceId, positions: [{lat,lng,speedKmh,headingDeg,ignition,recordedAt}] } */
export async function ingestTracking(rawBody, signature) {
  if (!trackingEnabled()) return { httpStatus: 404, body: { error: 'tracking disabled' } };
  if (!signature || !safeEqual(hmac(env.TRACKING_WEBHOOK_SECRET, rawBody), signature)) return { httpStatus: 401, body: { error: 'invalid signature' } };
  const parsed = z.object({
    registrationNumber: z.string().max(15),
    deviceId: z.string().max(64).optional(),
    positions: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), speedKmh: z.number().min(0).max(300).optional(), headingDeg: z.number().min(0).max(360).optional(), ignition: z.boolean().optional(), recordedAt: z.coerce.date() })).min(1).max(500),
  }).safeParse(JSON.parse(rawBody.toString('utf8') || '{}'));
  if (!parsed.success) return { httpStatus: 422, body: { error: 'invalid payload' } };
  const v = await Vehicle.findOne({ registrationNumber: parsed.data.registrationNumber.toUpperCase() }).select('cityId').lean();
  if (!v) return { httpStatus: 404, body: { error: 'unknown vehicle' } };
  const city = await City.findById(v.cityId).lean();
  const fence = city?.geofencePolygon?.length ? { polygon: city.geofencePolygon } : city ? { center: fromGeoPoint(city.center), radiusMeters: city.serviceRadiusKm * 1000 } : null;
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
  if (!trackingEnabled()) return ok(res, { trackingAvailable: false, reason: 'No GPS tracking provider is configured.' });
  const from = b.trip?.startedAt || b.startAt;
  const to = b.trip?.endedAt || new Date();
  const points = await VehicleLocation.find({ vehicleId: b.vehicleId, recordedAt: { $gte: from, $lte: to } }).sort({ recordedAt: 1 }).limit(5000).lean();
  ok(res, {
    trackingAvailable: true,
    latest: points.at(-1) ? { ...fromGeoPoint(points.at(-1).point), recordedAt: points.at(-1).recordedAt, speedKmh: points.at(-1).speedKmh, insideServiceArea: points.at(-1).insideServiceArea } : null,
    route: points.map((p) => [p.point.coordinates[1], p.point.coordinates[0]]),
    geofenceExits: points.filter((p) => p.insideServiceArea === false).length,
  });
});

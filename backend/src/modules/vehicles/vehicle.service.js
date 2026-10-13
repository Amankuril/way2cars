import { z } from 'zod';
import { Vehicle, VehicleBlock, VehiclePriceOverride, computeListed, FUEL_TYPES, TRANSMISSIONS, VEHICLE_FEATURES } from './vehicle.model.js';
import { Vendor } from '../vendors/vendor.model.js';
import { City, Brand, Category } from '../catalog/catalog.model.js';
import { Booking, overlapFilter, BLOCKING_STATUSES } from '../bookings/booking.model.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { fromGeoPoint, haversineMeters, insideGeofence } from '../../integrations/maps.js';
import { registerFileAccessRule } from '../files/files.service.js';
import { getSettings } from '../settings/settings.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const rupees = (min = 1) => z.number().int().min(min * 100).max(10_000_000); // paise

export const vehicleBaseSchema = z.object({
  cityId: objectId,
  brandId: objectId,
  categoryId: objectId,
  model: z.string().trim().min(1).max(60),
  variant: z.string().trim().max(60).optional(),
  year: z.number().int().min(2005).max(new Date().getFullYear() + 1),
  registrationNumber: z.string().trim().toUpperCase().transform((s) => s.replace(/[\s-]/g, '')).pipe(z.string().regex(/^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/, 'Enter a valid registration number, e.g. MH12AB1234')),
  color: z.string().trim().max(30).optional(),
  fuelType: z.enum(FUEL_TYPES),
  transmission: z.enum(TRANSMISSIONS),
  seats: z.number().int().min(2).max(12),
  luggageBags: z.number().int().min(0).max(10),
  rangeKm: z.number().int().min(50).max(1500).optional(),
  features: z.array(z.enum(VEHICLE_FEATURES)).max(VEHICLE_FEATURES.length).default([]),
  description: z.string().trim().max(1500).optional(),
  location: z.object({
    address: z.string().trim().min(5).max(300),
    area: z.string().trim().max(100).optional(),
    pincode: z.string().regex(/^\d{6}$/).optional(),
    placeId: z.string().max(300).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).strict(),
  pricing: z.object({
    hourlyPaise: rupees(10),
    dailyPaise: rupees(100),
    weekendDailyPaise: rupees(100).optional().nullable(),
    securityDepositPaise: z.number().int().min(0).max(10_000_000),
    includedKmPerDay: z.number().int().min(0).max(2000),
    extraKmChargePaise: z.number().int().min(0).max(100_000),
  }).strict().refine((p) => p.hourlyPaise <= p.dailyPaise, { message: 'Hourly price cannot exceed the daily price', path: ['hourlyPaise'] }),
  delivery: z.object({ enabled: z.boolean(), maxKm: z.number().int().min(0).max(100) }).strict().default({ enabled: false, maxKm: 10 }),
  instantBooking: z.boolean().default(false),
}).strict();

// Changing any of these on an approved car sends it back for review.
const SENSITIVE = ['brandId', 'model', 'year', 'registrationNumber', 'fuelType', 'transmission', 'seats', 'cityId', 'location'];

export async function validateRefs({ cityId, brandId, categoryId, location }) {
  const [city, brand, category] = await Promise.all([
    cityId ? City.findOne({ _id: cityId, isActive: true }).lean() : null,
    brandId ? Brand.exists({ _id: brandId, isActive: true }) : true,
    categoryId ? Category.exists({ _id: categoryId, isActive: true }) : true,
  ]);
  if (cityId && !city) throw badRequest('Choose a supported city.', undefined, 'CITY_INVALID');
  if (!brand) throw badRequest('Choose a valid brand.', undefined, 'BRAND_INVALID');
  if (!category) throw badRequest('Choose a valid car type.', undefined, 'CATEGORY_INVALID');
  if (city && location) {
    const pt = { lat: location.lat, lng: location.lng };
    const fence = city.geofencePolygon?.length ? { polygon: city.geofencePolygon } : { center: fromGeoPoint(city.center), radiusMeters: city.serviceRadiusKm * 1000 };
    if (!insideGeofence(pt, fence)) throw badRequest(`The pickup location is outside our ${city.name} service area.`, undefined, 'OUTSIDE_SERVICE_AREA');
  }
}

export function toVehicleDoc(body) {
  const doc = { ...body };
  if (body.location) {
    const { lat, lng, ...loc } = body.location;
    doc.location = { ...loc, point: { type: 'Point', coordinates: [lng, lat] } };
  }
  if (body.pricing && body.pricing.weekendDailyPaise === null) doc.pricing = { ...body.pricing, weekendDailyPaise: undefined };
  return doc;
}

export const touchesSensitive = (patch) => SENSITIVE.some((k) => k in patch);

export async function refreshListing(vehicleId, session) {
  const v = await Vehicle.findById(vehicleId).select('approval status adminSuspended vendorId').session(session || null).lean();
  if (!v) return;
  const vendor = await Vendor.findById(v.vendorId).select('status').session(session || null).lean();
  await Vehicle.updateOne({ _id: vehicleId }, { $set: { isListed: computeListed(v, vendor?.status) } }, { session });
}

export async function refreshVendorListings(vendorId, session) {
  const ids = await Vehicle.find({ vendorId }).distinct('_id').session(session || null);
  for (const id of ids) await refreshListing(id, session);
}

/** Missing items preventing submission for review. */
export function submissionGaps(v, minPhotos = 4) {
  const gaps = [];
  if ((v.photos?.length || 0) < minPhotos) gaps.push(`At least ${minPhotos} photos`);
  if (!v.documents?.rc?.fileId) gaps.push('Registration certificate (RC)');
  if (!v.documents?.insurance?.fileId) gaps.push('Insurance certificate');
  else if (v.documents.insurance.expiry && v.documents.insurance.expiry < new Date()) gaps.push('Valid (unexpired) insurance');
  if (!v.documents?.puc?.fileId && v.fuelType !== 'electric') gaps.push('Pollution (PUC) certificate');
  else if (v.documents?.puc?.expiry && v.documents.puc.expiry < new Date()) gaps.push('Valid (unexpired) PUC');
  return gaps;
}

export async function getOwnedVehicle(vendorId, id, session) {
  const v = await Vehicle.findOne({ _id: id, vendorId }).session(session || null);
  if (!v) throw notFound('Car');
  return v;
}

/** Calendar view: bookings, blocks and price overrides intersecting [from, to). */
export async function vehicleCalendar(vehicleId, from, to) {
  const [bookings, blocks, overrides] = await Promise.all([
    Booking.find({ vehicleId, status: { $in: [...BLOCKING_STATUSES, 'completed'] }, startAt: { $lt: to }, blockEndAt: { $gt: from } })
      .select('ref status startAt endAt blockEndAt holdExpiresAt').sort({ startAt: 1 }).lean(),
    VehicleBlock.find({ vehicleId, startAt: { $lt: to }, endAt: { $gt: from } }).sort({ startAt: 1 }).lean(),
    VehiclePriceOverride.find({ vehicleId, date: { $gte: from.toISOString().slice(0, 10), $lte: to.toISOString().slice(0, 10) } }).sort({ date: 1 }).lean(),
  ]);
  const now = new Date();
  return {
    bookings: bookings.filter((b) => b.status !== 'pending_payment' || b.holdExpiresAt > now).map((b) => ({ id: b._id, ref: b.ref, status: b.status, startAt: b.startAt, endAt: b.blockEndAt })),
    blocks: blocks.map((b) => ({ id: b._id, startAt: b.startAt, endAt: b.endAt, reason: b.reason, note: b.note })),
    priceOverrides: overrides.map((o) => ({ date: o.date, dailyPaise: o.dailyPaise, hourlyPaise: o.hourlyPaise })),
  };
}

/** Creates a vendor block; must run inside a transaction holding the vehicle lock. */
export async function addBlock(vehicle, { startAt, endAt, reason, note }, session) {
  if (endAt <= startAt) throw badRequest('End must be after start.');
  if (endAt <= new Date()) throw badRequest('Blocked periods must be in the future.');
  const { booking } = await getSettings();
  const clashes = await Booking.find(overlapFilter(vehicle._id, startAt, endAt, 0)).select('ref startAt endAt status').session(session).lean();
  if (clashes.length) {
    throw conflict('These dates overlap existing bookings. Cancel or move them first.', 'BLOCK_CONFLICTS_BOOKING', {
      bookings: clashes.map((b) => ({ ref: b.ref, startAt: b.startAt, endAt: b.endAt, status: b.status })),
      bufferMinutes: booking.bufferMinutes,
    });
  }
  const [block] = await VehicleBlock.create([{ vehicleId: vehicle._id, vendorId: vehicle.vendorId, startAt, endAt, reason, note }], { session });
  return block;
}

export function serializeVehicle(v, { audience = 'public', distanceMeters } = {}) {
  if (!v) return null;
  const base = {
    id: v._id,
    title: [v.brandId?.name, v.model, v.variant].filter(Boolean).join(' '),
    brand: v.brandId?.name ? { id: v.brandId._id, name: v.brandId.name, logoUrl: v.brandId.logoUrl } : { id: v.brandId },
    category: v.categoryId?.name ? { id: v.categoryId._id, name: v.categoryId.name, bodyType: v.categoryId.bodyType } : { id: v.categoryId },
    city: v.cityId?.name ? { id: v.cityId._id, name: v.cityId.name } : { id: v.cityId },
    model: v.model,
    variant: v.variant,
    year: v.year,
    color: v.color,
    fuelType: v.fuelType,
    transmission: v.transmission,
    seats: v.seats,
    luggageBags: v.luggageBags,
    rangeKm: v.rangeKm,
    features: v.features,
    description: v.description,
    photos: (v.photos || []).map((p) => p.url),
    location: { area: v.location?.area, pincode: v.location?.pincode, point: fromGeoPoint(v.location?.point) },
    pricing: v.pricing,
    delivery: v.delivery,
    instantBooking: v.instantBooking,
    isLuxury: v.isLuxury,
    isFeatured: v.isFeatured,
    rating: v.rating,
    trips: v.stats?.trips || 0,
    insurance: v.documents?.insurance?.type ? { type: v.documents.insurance.type, provider: v.documents.insurance.provider } : null,
    distanceMeters,
  };
  if (audience === 'public') {
    // Exact address is shared only after a booking is confirmed.
    if (base.location.point) base.location.point = { lat: Number(base.location.point.lat.toFixed(2)), lng: Number(base.location.point.lng.toFixed(2)) };
    return base;
  }
  return {
    ...base,
    vendorId: v.vendorId?._id || v.vendorId,
    registrationNumber: v.registrationNumber,
    location: { ...base.location, address: v.location?.address, placeId: v.location?.placeId, point: fromGeoPoint(v.location?.point) },
    photoFiles: (v.photos || []).map((p) => ({ fileId: p.fileId, url: p.url })),
    documents: v.documents,
    approval: v.approval,
    status: v.status,
    isListed: v.isListed,
    adminSuspended: v.adminSuspended,
    featuredRank: v.featuredRank,
    stats: v.stats,
    lastOdometerKm: v.lastOdometerKm,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export const distanceTo = (v, point) => (point && v.location?.point ? Math.round(haversineMeters(point, fromGeoPoint(v.location.point))) : undefined);

// Vehicle documents are private to the owning host and permitted admins (owner rule covers the host).
registerFileAccessRule('vehicle_document', async () => false);

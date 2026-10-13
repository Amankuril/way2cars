import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ok } from '../../core/http.js';
import { notFound } from '../../core/errors.js';
import { validate } from '../../middleware/validate.js';
import { Vehicle, VehiclePriceOverride, FUEL_TYPES, TRANSMISSIONS } from '../vehicles/vehicle.model.js';
import { Category, BODY_TYPES } from '../catalog/catalog.model.js';
import { BLOCKING_STATUSES } from '../bookings/booking.model.js';
import { Review } from '../reviews/review.model.js';
import { serializeVehicle, vehicleCalendar } from '../vehicles/vehicle.service.js';
import { validateTripWindow, isVehicleAvailable } from '../bookings/availability.service.js';
import { computeRental } from '../pricing/pricing.js';
import { getSettings, publicSettings } from '../settings/settings.service.js';
import { getPublishedPage } from '../cms/cms.routes.js';

const { ObjectId } = mongoose.Types;
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const csvOf = (schema) => z.string().max(500).optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])).pipe(z.array(schema).max(30));
const POPULATE = [{ path: 'brandId', select: 'name logoUrl' }, { path: 'categoryId', select: 'name bodyType' }, { path: 'cityId', select: 'name' }];

const searchQuery = z.object({
  cityId: objectId,
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).optional(),
  brandIds: csvOf(objectId),
  categoryIds: csvOf(objectId),
  bodyTypes: csvOf(z.enum(BODY_TYPES)),
  fuelTypes: csvOf(z.enum(FUEL_TYPES)),
  transmission: z.enum(TRANSMISSIONS).optional(),
  seatsMin: z.coerce.number().int().min(2).max(12).optional(),
  minPricePaise: z.coerce.number().int().min(0).optional(),
  maxPricePaise: z.coerce.number().int().min(0).optional(),
  luxury: z.enum(['true']).optional(),
  electric: z.enum(['true']).optional(),
  instant: z.enum(['true']).optional(),
  delivery: z.enum(['true']).optional(),
  minHostRating: z.coerce.number().min(1).max(5).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  sort: z.enum(['recommended', 'price_asc', 'price_desc', 'rating', 'distance', 'newest']).default('recommended'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine((q) => (q.startAt && q.endAt) || (!q.startAt && !q.endAt), { message: 'Provide both pickup and return times', path: ['endAt'] })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), { message: 'Provide both lat and lng', path: ['lng'] });

/** Overrides for a set of vehicles within a date window → Map(vehicleId → Map(date → override)). */
async function overridesFor(vehicleIds, startAt, endAt) {
  const from = new Date(startAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const to = new Date(endAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const rows = await VehiclePriceOverride.find({ vehicleId: { $in: vehicleIds }, date: { $gte: from, $lte: to } }).lean();
  const map = new Map();
  for (const r of rows) {
    const k = String(r.vehicleId);
    if (!map.has(k)) map.set(k, new Map());
    map.get(k).set(r.date, r);
  }
  return map;
}

export const searchRouter = Router();

searchRouter.get('/vehicles', validate({ query: searchQuery }), async (req, res) => {
  const q = req.valid.query;
  const settings = await getSettings();
  let window = null;
  if (q.startAt) window = await validateTripWindow(q.startAt, q.endAt);

  const match = { isListed: true, cityId: new ObjectId(q.cityId) };
  if (q.brandIds.length) match.brandId = { $in: q.brandIds.map((x) => new ObjectId(x)) };
  if (q.categoryIds.length) match.categoryId = { $in: q.categoryIds.map((x) => new ObjectId(x)) };
  const fuels = q.electric ? ['electric'] : q.fuelTypes;
  if (fuels.length) match.fuelType = { $in: fuels };
  if (q.transmission) match.transmission = q.transmission;
  if (q.seatsMin) match.seats = { $gte: q.seatsMin };
  if (q.luxury) match.isLuxury = true;
  if (q.instant) match.instantBooking = true;
  if (q.delivery) match['delivery.enabled'] = true;
  if (q.minRating) match['rating.avg'] = { $gte: q.minRating };
  if (q.minPricePaise || q.maxPricePaise) {
    match['pricing.dailyPaise'] = {};
    if (q.minPricePaise) match['pricing.dailyPaise'].$gte = q.minPricePaise;
    if (q.maxPricePaise) match['pricing.dailyPaise'].$lte = q.maxPricePaise;
  }

  const pipeline = [];
  const near = q.lat !== undefined ? { lat: q.lat, lng: q.lng } : null;
  if (near) {
    pipeline.push({ $geoNear: { near: { type: 'Point', coordinates: [near.lng, near.lat] }, distanceField: 'distanceMeters', key: 'location.point', query: match, ...(q.radiusKm ? { maxDistance: q.radiusKm * 1000 } : {}), spherical: true } });
  } else {
    pipeline.push({ $match: match });
  }
  if (q.bodyTypes.length) {
    const catIds = await Category.find({ bodyType: { $in: q.bodyTypes } }).distinct('_id');
    pipeline.push({ $match: { categoryId: { $in: catIds } } });
  }
  if (q.minHostRating) {
    pipeline.push(
      { $lookup: { from: 'vendor_accounts', localField: 'vendorId', foreignField: '_id', as: 'vendor', pipeline: [{ $project: { rating: 1 } }] } },
      { $match: { 'vendor.rating.avg': { $gte: q.minHostRating } } },
    );
  }
  if (window) {
    const buf = settings.booking.bufferMinutes * 60_000;
    const now = new Date();
    pipeline.push(
      { $lookup: { from: 'bookings', let: { vid: '$_id' }, as: 'clash', pipeline: [
        { $match: { $expr: { $eq: ['$vehicleId', '$$vid'] }, status: { $in: BLOCKING_STATUSES }, startAt: { $lt: new Date(window.endAt.getTime() + buf) }, blockEndAt: { $gt: new Date(window.startAt.getTime() - buf) }, $or: [{ status: { $ne: 'pending_payment' } }, { holdExpiresAt: { $gt: now } }] } },
        { $limit: 1 }, { $project: { _id: 1 } },
      ] } },
      { $lookup: { from: 'vehicle_blocks', let: { vid: '$_id' }, as: 'blocked', pipeline: [
        { $match: { $expr: { $eq: ['$vehicleId', '$$vid'] }, startAt: { $lt: window.endAt }, endAt: { $gt: window.startAt } } },
        { $limit: 1 }, { $project: { _id: 1 } },
      ] } },
      { $match: { clash: { $size: 0 }, blocked: { $size: 0 } } },
    );
  }
  const sorts = {
    recommended: { isFeatured: -1, featuredRank: -1, 'rating.avg': -1, 'stats.trips': -1, _id: 1 },
    price_asc: { 'pricing.dailyPaise': 1, _id: 1 },
    price_desc: { 'pricing.dailyPaise': -1, _id: 1 },
    rating: { 'rating.avg': -1, 'rating.count': -1, _id: 1 },
    distance: near ? { distanceMeters: 1, _id: 1 } : { _id: 1 },
    newest: { createdAt: -1, _id: 1 },
  };
  pipeline.push({ $facet: {
    items: [{ $sort: sorts[q.sort] }, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }, { $project: { _id: 1, distanceMeters: 1 } }],
    total: [{ $count: 'n' }],
  } });

  const [{ items, total }] = await Vehicle.aggregate(pipeline);
  const ids = items.map((i) => i._id);
  const docs = await Vehicle.find({ _id: { $in: ids } }).populate(POPULATE).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const overrides = window ? await overridesFor(ids, window.startAt, window.endAt) : new Map();

  const results = items.map((i) => {
    const v = byId.get(String(i._id));
    const out = serializeVehicle(v, { distanceMeters: i.distanceMeters !== undefined ? Math.round(i.distanceMeters) : undefined });
    if (window) {
      const rental = computeRental({ startAt: window.startAt, endAt: window.endAt, pricing: v.pricing, overrides: overrides.get(String(v._id)) });
      out.estimate = { hours: rental.hours, rentalPaise: rental.rentalPaise, includedKm: rental.includedKm };
    }
    return out;
  });
  const n = total[0]?.n || 0;
  ok(res, results, { page: q.page, limit: q.limit, total: n, pages: Math.ceil(n / q.limit) });
});

searchRouter.get('/vehicles/featured', validate({ query: z.object({ cityId: objectId, limit: z.coerce.number().int().min(1).max(20).default(10) }) }), async (req, res) => {
  const docs = await Vehicle.find({ isListed: true, isFeatured: true, cityId: req.valid.query.cityId }).sort({ featuredRank: -1, 'rating.avg': -1 }).limit(req.valid.query.limit).populate(POPULATE).lean();
  ok(res, docs.map((v) => serializeVehicle(v)));
});

searchRouter.get('/vehicles/:id', validate({ params: z.object({ id: objectId }), query: z.object({ startAt: z.coerce.date().optional(), endAt: z.coerce.date().optional() }) }), async (req, res) => {
  const v = await Vehicle.findOne({ _id: req.valid.params.id, isListed: true }).populate([...POPULATE, { path: 'vendorId', select: 'name businessName businessType rating createdAt responseStats' }]).lean();
  if (!v) throw notFound('Car');
  const settings = await getSettings();
  const [reviews, ratingBreakdown, policyPage] = await Promise.all([
    Review.find({ vehicleId: v._id, status: 'published' }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name').lean(),
    Review.aggregate([{ $match: { vehicleId: v._id, status: 'published' } }, { $group: { _id: '$vehicleRating', n: { $sum: 1 } } }]),
    getPublishedPage('cancellation-policy'),
  ]);
  const host = v.vendorId;
  const decided = (host?.responseStats?.accepted || 0) + (host?.responseStats?.rejected || 0);
  const out = {
    ...serializeVehicle(v),
    host: host ? {
      name: host.businessType === 'company' && host.businessName ? host.businessName : (host.name || 'Host').split(' ')[0],
      rating: host.rating,
      memberSince: host.createdAt,
      acceptanceRate: decided ? Math.round(((host.responseStats?.accepted || 0) / decided) * 100) : null,
    } : null,
    reviews: reviews.map((r) => ({ id: r._id, rating: r.vehicleRating, comment: r.comment, author: r.userId?.name?.split(' ')[0] || 'Guest', createdAt: r.createdAt, hostReply: r.hostReply?.text })),
    ratingBreakdown: Object.fromEntries(ratingBreakdown.map((r) => [r._id, r.n])),
    policies: { cancellation: settings.cancellation, cancellationPage: policyPage ? { title: policyPage.title, blocks: policyPage.blocks } : null, trip: publicSettings(settings).trip, booking: publicSettings(settings).booking },
  };
  const { startAt, endAt } = req.valid.query;
  if (startAt && endAt) {
    const window = await validateTripWindow(startAt, endAt);
    const overrides = (await overridesFor([v._id], window.startAt, window.endAt)).get(String(v._id));
    out.availability = { available: await isVehicleAvailable(v._id, window.startAt, window.endAt), startAt: window.startAt, endAt: window.endAt };
    out.estimate = computeRental({ startAt: window.startAt, endAt: window.endAt, pricing: v.pricing, overrides });
  }
  ok(res, out);
});

/** Calendar of busy ranges for the next N days (no booking details exposed). */
searchRouter.get('/vehicles/:id/busy', validate({ params: z.object({ id: objectId }), query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }) }), async (req, res) => {
  const v = await Vehicle.findOne({ _id: req.valid.params.id, isListed: true }).select('_id').lean();
  if (!v) throw notFound('Car');
  const from = new Date();
  const to = new Date(from.getTime() + req.valid.query.days * 86400_000);
  const cal = await vehicleCalendar(v._id, from, to);
  ok(res, [...cal.bookings.map((b) => ({ startAt: b.startAt, endAt: b.endAt })), ...cal.blocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt }))].sort((a, b) => a.startAt - b.startAt));
});


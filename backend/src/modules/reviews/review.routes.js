import { Router } from 'express';
import { z } from 'zod';
import { ok, created } from '../../core/http.js';
import { conflict, notFound } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { Review } from './review.model.js';
import { Booking } from '../bookings/booking.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { Vendor } from '../vendors/vendor.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const TAGS = ['clean_car', 'smooth_handover', 'as_described', 'good_condition', 'helpful_host', 'fuel_efficient', 'late_handover', 'dirty_car', 'mechanical_issue', 'not_as_described'];

/** Recomputes rating aggregates for a vehicle and its host from published reviews. */
async function refreshRatings(vehicleId, vendorId, session) {
  const [v] = await Review.aggregate([{ $match: { vehicleId, status: 'published' } }, { $group: { _id: null, avg: { $avg: '$vehicleRating' }, count: { $sum: 1 } } }]).session(session);
  const [h] = await Review.aggregate([{ $match: { vendorId, status: 'published' } }, { $group: { _id: null, avg: { $avg: '$hostRating' }, count: { $sum: 1 } } }]).session(session);
  await Vehicle.updateOne({ _id: vehicleId }, { $set: { rating: { avg: Math.round((v?.avg || 0) * 10) / 10, count: v?.count || 0 } } }, { session });
  await Vendor.updateOne({ _id: vendorId }, { $set: { rating: { avg: Math.round((h?.avg || 0) * 10) / 10, count: h?.count || 0 } } }, { session });
}

const serialize = (r) => ({ id: r._id, bookingId: r.bookingId, vehicleRating: r.vehicleRating, hostRating: r.hostRating, tags: r.tags, comment: r.comment, status: r.status, hostReply: r.hostReply, createdAt: r.createdAt });

export const userReviewRouter = Router();
userReviewRouter.post('/', validate({
  body: z.object({ bookingId: objectId, vehicleRating: z.number().int().min(1).max(5), hostRating: z.number().int().min(1).max(5), tags: z.array(z.enum(TAGS)).max(6).default([]), comment: z.string().trim().max(1000).optional() }).strict(),
}), async (req, res) => {
  const body = req.valid.body;
  const review = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: body.bookingId, userId: req.auth.id, status: 'completed' }).session(session);
    if (!b) throw notFound('Completed trip');
    if (b.reviewed?.byUser) throw conflict('You have already reviewed this trip.', 'ALREADY_REVIEWED');
    const [r] = await Review.create([{ ...body, userId: req.auth.id, vehicleId: b.vehicleId, vendorId: b.vendorId }], { session });
    await Booking.updateOne({ _id: b._id }, { $set: { 'reviewed.byUser': true } }, { session });
    await refreshRatings(b.vehicleId, b.vendorId, session);
    return r;
  });
  created(res, serialize(review));
});

export const vendorReviewRouter = Router();
vendorReviewRouter.get('/', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await paginate(Review, { vendorId: req.auth.id }, { ...req.valid.query, populate: { path: 'userId', select: 'name' } });
  ok(res, items.map((r) => ({ ...serialize(r), author: r.userId?.name?.split(' ')[0] })), meta);
});
vendorReviewRouter.post('/:id/reply', validate({ params: z.object({ id: objectId }), body: z.object({ text: z.string().trim().min(2).max(500) }).strict() }), async (req, res) => {
  const r = await Review.findOneAndUpdate({ _id: req.valid.params.id, vendorId: req.auth.id, 'hostReply.text': null }, { $set: { hostReply: { text: req.valid.body.text, at: new Date() } } }, { new: true }).lean();
  if (!r) throw conflict('You have already replied, or this review does not exist.', 'REPLY_NOT_ALLOWED');
  ok(res, serialize(r));
});

export const adminReviewRouter = Router();
adminReviewRouter.get('/', requirePermission('reviews.manage'), validate({ query: z.object({ ...paginationQuery, status: z.enum(['published', 'hidden']).optional(), maxRating: z.coerce.number().int().min(1).max(5).optional() }) }), async (req, res) => {
  const { page, limit, status, maxRating } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (maxRating) filter.vehicleRating = { $lte: maxRating };
  const { items, meta } = await paginate(Review, filter, { page, limit, populate: [{ path: 'userId', select: 'name phone' }, { path: 'vehicleId', select: 'model registrationNumber' }] });
  ok(res, items.map((r) => ({ ...serialize(r), user: r.userId, vehicle: r.vehicleId })), meta);
});
adminReviewRouter.patch('/:id', requirePermission('reviews.manage'), validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['published', 'hidden']), reason: z.string().trim().min(3).max(300) }).strict() }), async (req, res) => {
  const r = await withTransaction(async (session) => {
    const doc = await Review.findByIdAndUpdate(req.valid.params.id, { $set: { status: req.valid.body.status, moderation: { by: req.auth.id, at: new Date(), reason: req.valid.body.reason } } }, { new: true, session });
    if (!doc) throw notFound('Review');
    await refreshRatings(doc.vehicleId, doc.vendorId, session);
    return doc;
  });
  await audit(req, `review.${req.valid.body.status}`, { type: 'review', id: r._id }, { reason: req.valid.body.reason });
  ok(res, serialize(r));
});

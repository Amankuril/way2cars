import { Router } from 'express';
import { z } from 'zod';
import { ok, created } from '../../core/http.js';
import { notFound, conflict } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { Coupon, CouponRedemption } from './coupon.model.js';
import { serializeCoupon } from './coupon.service.js';
import { isDuplicateKey } from '../../core/db.js';
import mongoose from 'mongoose';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

/** Offers visible to renters (public, active, current). */
export const userOffersRouter = Router();
userOffersRouter.get('/', validate({ query: z.object({ cityId: objectId.optional() }) }), async (req, res) => {
  const now = new Date();
  const filter = { isActive: true, isPublic: true, startsAt: { $lte: now }, endsAt: { $gte: now }, $or: [{ userIds: { $size: 0 } }, { userIds: req.auth.id }] };
  if (req.valid.query.cityId) filter.$and = [{ $or: [{ cityIds: { $size: 0 } }, { cityIds: req.valid.query.cityId }] }];
  const list = await Coupon.find(filter).sort({ endsAt: 1 }).limit(50).lean();
  ok(res, list.filter((c) => !c.usageLimit || c.usedCount < c.usageLimit).map((c) => serializeCoupon(c)));
});

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, '4–20 letters or digits'),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional(),
  campaign: z.enum(['discount', 'referral', 'festival', 'first_ride']).default('discount'),
  type: z.enum(['percent', 'flat']),
  valueBps: z.number().int().min(1).max(10000).optional(),
  valuePaise: z.number().int().min(100).optional(),
  maxDiscountPaise: z.number().int().min(0).optional(),
  minRentalPaise: z.number().int().min(0).default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  firstBookingOnly: z.boolean().default(false),
  cityIds: z.array(objectId).max(100).default([]),
  categoryIds: z.array(objectId).max(50).default([]),
  userIds: z.array(objectId).max(1000).default([]),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
}).strict();
const consistent = (c) => (c.type === 'percent' ? c.valueBps : c.valuePaise) && (!c.startsAt || !c.endsAt || c.endsAt > c.startsAt);

export const adminCouponRouter = Router();
adminCouponRouter.use(requirePermission('coupons.manage'));

adminCouponRouter.get('/', validate({ query: z.object({ ...paginationQuery, campaign: z.enum(['discount', 'referral', 'festival', 'first_ride']).optional(), active: z.enum(['true', 'false']).optional() }) }), async (req, res) => {
  const { page, limit, campaign, active } = req.valid.query;
  const filter = {};
  if (campaign) filter.campaign = campaign;
  if (active) filter.isActive = active === 'true';
  const { items, meta } = await paginate(Coupon, filter, { page, limit });
  ok(res, items.map((c) => serializeCoupon(c, { admin: true })), meta);
});

adminCouponRouter.post('/', validate({ body: couponSchema.refine(consistent, { message: 'Set the discount value and a valid date range' }) }), async (req, res) => {
  try {
    const c = await Coupon.create({ ...req.valid.body, createdBy: req.auth.id });
    await audit(req, 'coupon.created', { type: 'coupon', id: c._id }, { changes: req.valid.body });
    created(res, serializeCoupon(c, { admin: true }));
  } catch (err) {
    if (isDuplicateKey(err)) throw conflict('A coupon with this code already exists.', 'COUPON_EXISTS');
    throw err;
  }
});

adminCouponRouter.patch('/:id', validate({ params: z.object({ id: objectId }), body: couponSchema.omit({ code: true }).partial() }), async (req, res) => {
  const c = await Coupon.findByIdAndUpdate(req.valid.params.id, { $set: req.valid.body }, { new: true, runValidators: true }).lean();
  if (!c) throw notFound('Coupon');
  await audit(req, 'coupon.updated', { type: 'coupon', id: c._id }, { changes: req.valid.body });
  ok(res, serializeCoupon(c, { admin: true }));
});

adminCouponRouter.get('/:id/redemptions', validate({ params: z.object({ id: objectId }), query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await paginate(CouponRedemption, { couponId: req.valid.params.id }, { ...req.valid.query, populate: [{ path: 'userId', select: 'name phone' }, { path: 'bookingId', select: 'ref status' }] });
  const totals = await CouponRedemption.aggregate([{ $match: { couponId: new mongoose.Types.ObjectId(req.valid.params.id), status: 'redeemed' } }, { $group: { _id: null, discountPaise: { $sum: '$discountPaise' }, n: { $sum: 1 } } }]);
  ok(res, items.map((r) => ({ id: r._id, user: r.userId, booking: r.bookingId, discountPaise: r.discountPaise, status: r.status, createdAt: r.createdAt })), { ...meta, redeemedCount: totals[0]?.n || 0, totalDiscountPaise: totals[0]?.discountPaise || 0 });
});

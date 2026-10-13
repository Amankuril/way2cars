import { badRequest } from '../../core/errors.js';
import { Coupon, CouponRedemption } from './coupon.model.js';
import { Booking } from '../bookings/booking.model.js';
import { couponDiscount } from '../pricing/pricing.js';

/**
 * Validates a coupon for a user + vehicle + rental amount and returns { coupon, discountPaise }.
 * Throws a user-friendly 400 explaining why a code cannot be used.
 */
export async function evaluateCoupon(code, { userId, vehicle, rentalPaise }, session) {
  const c = await Coupon.findOne({ code: String(code).toUpperCase().trim() }).session(session || null).lean();
  const fail = (msg) => badRequest(msg, undefined, 'COUPON_INVALID');
  const now = new Date();
  if (!c || !c.isActive) throw fail('This coupon code is not valid.');
  if (c.startsAt > now) throw fail('This offer has not started yet.');
  if (c.endsAt < now) throw fail('This offer has expired.');
  if (c.usageLimit && c.usedCount >= c.usageLimit) throw fail('This offer has been fully redeemed.');
  if (c.userIds?.length && !c.userIds.some((u) => String(u) === String(userId))) throw fail('This coupon is not available on your account.');
  if (c.cityIds?.length && !c.cityIds.some((x) => String(x) === String(vehicle.cityId))) throw fail('This coupon is not valid in this city.');
  if (c.categoryIds?.length && !c.categoryIds.some((x) => String(x) === String(vehicle.categoryId))) throw fail('This coupon is not valid for this car type.');
  if (rentalPaise < c.minRentalPaise) throw fail(`Add ₹${Math.ceil((c.minRentalPaise - rentalPaise) / 100)} more to use this coupon.`);
  const used = await CouponRedemption.countDocuments({ couponId: c._id, userId, status: { $in: ['reserved', 'redeemed'] } }).session(session || null);
  if (used >= c.perUserLimit) throw fail('You have already used this coupon.');
  if (c.firstBookingOnly && (await Booking.exists({ userId, 'payment.status': { $in: ['paid', 'partially_refunded', 'refunded'] } }).session(session || null))) {
    throw fail('This coupon is only for your first booking.');
  }
  return { coupon: c, discountPaise: couponDiscount(c, rentalPaise) };
}

/** Reserves a redemption atomically (respects the global usage limit under concurrency). */
export async function reserveCoupon(coupon, { userId, bookingId, discountPaise }, session) {
  const filter = { _id: coupon._id, isActive: true };
  if (coupon.usageLimit) filter.usedCount = { $lt: coupon.usageLimit };
  const updated = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } }, { session });
  if (updated.modifiedCount !== 1) throw badRequest('This offer has just been fully redeemed.', undefined, 'COUPON_INVALID');
  await CouponRedemption.create([{ couponId: coupon._id, code: coupon.code, userId, bookingId, discountPaise }], { session });
}

export async function releaseCoupon(bookingId, session) {
  const r = await CouponRedemption.findOneAndUpdate({ bookingId, status: 'reserved' }, { $set: { status: 'released' } }, { session });
  if (r) await Coupon.updateOne({ _id: r.couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
}

export async function confirmCoupon(bookingId, session) {
  await CouponRedemption.updateOne({ bookingId, status: 'reserved' }, { $set: { status: 'redeemed' } }, { session });
}

export const serializeCoupon = (c, { admin = false } = {}) => ({
  id: c._id, code: c.code, title: c.title, description: c.description, campaign: c.campaign, type: c.type,
  valueBps: c.valueBps, valuePaise: c.valuePaise, maxDiscountPaise: c.maxDiscountPaise, minRentalPaise: c.minRentalPaise,
  startsAt: c.startsAt, endsAt: c.endsAt, firstBookingOnly: c.firstBookingOnly,
  ...(admin ? { usageLimit: c.usageLimit, usedCount: c.usedCount, perUserLimit: c.perUserLimit, cityIds: c.cityIds, categoryIds: c.categoryIds, userIds: c.userIds, isPublic: c.isPublic, isActive: c.isActive, createdAt: c.createdAt } : {}),
});

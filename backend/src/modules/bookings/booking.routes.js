import { Router } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { notFound } from '../../core/errors.js';
import { paginate, paginationQuery, escapeRegex } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { Booking, BOOKING_STATUSES } from './booking.model.js';
import { serializeBooking } from './booking.serializer.js';
import {
  buildQuote, serializeQuote, createBooking, bookingPaymentOrder, cancelByUser, cancellationPreview,
  vendorDecision, cancelByAdmin, requestExtension,
} from './booking.service.js';
import { startTrip, submitReturn, agreementFor, pickupSchema, returnSchema, vendorReturnReview, resolveDamageClaim, settlementPaymentOrder, inspectionsFor, previewSettlement } from '../trips/trip.service.js';
import { verifyCheckout, markPaymentFailed, serializePayment } from '../payments/payment.service.js';
import { Payment, Refund, Invoice } from '../payments/payment.model.js';
import { serializeRefund } from '../payments/refund.service.js';
import { renderInvoicePdf } from '../payments/invoice.service.js';
import { User } from '../users/user.model.js';
import { Vendor } from '../vendors/vendor.model.js';
import { audit } from '../../core/audit.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const idParams = z.object({ id: objectId });
const tripWindow = { vehicleId: objectId, startAt: z.coerce.date(), endAt: z.coerce.date() };
const delivery = z.object({ address: z.string().trim().min(5).max(300), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), placeId: z.string().max(300).optional() }).strict().optional();
const quoteBody = z.object({ ...tripWindow, delivery, couponCode: z.string().trim().toUpperCase().max(20).optional(), useWallet: z.boolean().default(false) }).strict();
const TABS = {
  upcoming: ['pending_payment', 'pending_vendor_approval', 'confirmed'],
  active: ['ongoing', 'return_pending'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected', 'expired'],
};
const listQuery = z.object({ ...paginationQuery, tab: z.enum(Object.keys(TABS)).optional() });
const checkoutBody = z.object({ razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]{6,30}$/), razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,30}$/), razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

async function userBooking(req) {
  const b = await Booking.findOne({ _id: req.valid.params.id, userId: req.auth.id }).lean();
  if (!b) throw notFound('Booking');
  return b;
}

// ================================================================= user
export const userBookingRouter = Router();

userBookingRouter.post('/quote', validate({ body: quoteBody }), async (req, res) => {
  ok(res, serializeQuote(await buildQuote({ ...req.valid.body, userId: req.auth.id })));
});

userBookingRouter.post('/', validate({ body: quoteBody }), async (req, res) => {
  const { booking, reused } = await createBooking(req, req.valid.body);
  let payment = null;
  if (booking.status === 'pending_payment') {
    try {
      payment = await bookingPaymentOrder(req.auth.id, booking._id);
    } catch (err) {
      req.log?.warn({ err: err.message }, 'order creation deferred'); // client retries via /payment-order
    }
  }
  (reused ? ok : created)(res, { booking: serializeBooking(booking), payment });
});

userBookingRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { page, limit, tab } = req.valid.query;
  const filter = { userId: req.auth.id };
  if (tab) filter.status = { $in: TABS[tab] };
  const sort = tab === 'upcoming' ? { startAt: 1 } : { startAt: -1 };
  const { items, meta } = await paginate(Booking, filter, { page, limit, sort });
  ok(res, items.map((b) => serializeBooking(b)), meta);
});

userBookingRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const b = await userBooking(req);
  const vendor = await Vendor.findById(b.vendorId).select('name businessName phone').lean();
  const [inspections, payments, refunds, invoices] = await Promise.all([
    inspectionsFor(b._id),
    Payment.find({ bookingId: b._id, status: { $in: ['paid', 'amount_mismatch'] } }).sort({ createdAt: 1 }).lean(),
    Refund.find({ bookingId: b._id }).sort({ createdAt: 1 }).lean(),
    Invoice.find({ bookingId: b._id }).select('number type totalPaise issuedAt').sort({ issuedAt: 1 }).lean(),
  ]);
  const out = serializeBooking(b, { vendor });
  out.inspections = inspections;
  out.payments = payments.map(serializePayment);
  out.refunds = refunds.map(serializeRefund);
  out.invoices = invoices.map((i) => ({ id: i._id, number: i.number, type: i.type, totalPaise: i.totalPaise, issuedAt: i.issuedAt }));
  if (b.status === 'return_pending') out.settlementPreview = await previewSettlement(b);
  ok(res, out);
});

userBookingRouter.post('/:id/payment-order', validate({ params: idParams }), async (req, res) => ok(res, await bookingPaymentOrder(req.auth.id, req.valid.params.id)));
userBookingRouter.post('/:id/settlement-payment-order', validate({ params: idParams }), async (req, res) => ok(res, await settlementPaymentOrder(req.auth.id, req.valid.params.id)));

/** Called by the app after Razorpay checkout succeeds. Verified server-side; never trusted as-is. */
userBookingRouter.post('/payments/verify', validate({ body: checkoutBody }), async (req, res) => {
  const b = req.valid.body;
  ok(res, await verifyCheckout({ userId: req.auth.id, orderId: b.razorpayOrderId, paymentId: b.razorpayPaymentId, signature: b.razorpaySignature }));
});
userBookingRouter.post('/payments/failed', validate({ body: z.object({ razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]{6,30}$/), reason: z.string().max(300).optional() }).strict() }), async (req, res) => {
  const p = await Payment.findOne({ razorpayOrderId: req.valid.body.razorpayOrderId, userId: req.auth.id }).lean();
  if (p) await markPaymentFailed(p.razorpayOrderId, req.valid.body.reason);
  noContent(res);
});

userBookingRouter.get('/:id/cancellation-preview', validate({ params: idParams }), async (req, res) => ok(res, await cancellationPreview(req.auth.id, req.valid.params.id)));
userBookingRouter.post('/:id/cancel', validate({ params: idParams, body: z.object({ reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  await cancelByUser(req, req.valid.params.id, req.valid.body.reason);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean()));
});

userBookingRouter.post('/:id/extensions', validate({ params: idParams, body: z.object({ endAt: z.coerce.date() }).strict() }), async (req, res) => {
  const r = await requestExtension(req, req.valid.params.id, req.valid.body.endAt);
  created(res, { extension: { id: r.extension._id, requestedEndAt: r.extension.requestedEndAt, pricing: r.extension.pricing, holdExpiresAt: r.extension.holdExpiresAt }, payment: r.payment });
});

userBookingRouter.get('/:id/agreement', validate({ params: idParams }), async (req, res) => ok(res, await agreementFor(req.auth.id, req.valid.params.id)));
userBookingRouter.post('/:id/pickup', validate({ params: idParams, body: pickupSchema }), async (req, res) => {
  await startTrip(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean()));
});
userBookingRouter.post('/:id/return', validate({ params: idParams, body: returnSchema }), async (req, res) => {
  await submitReturn(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean()));
});

userBookingRouter.get('/:id/invoices/:invoiceId.pdf', validate({ params: z.object({ id: objectId, invoiceId: objectId }) }), async (req, res) => {
  const b = await userBooking(req);
  const inv = await Invoice.findOne({ _id: req.valid.params.invoiceId, bookingId: b._id }).lean();
  if (!inv) throw notFound('Invoice');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${inv.number.replace(/\//g, '-')}.pdf"`, 'Cache-Control': 'private, no-store' });
  renderInvoicePdf(inv, b, res);
});

/** Payment history across all bookings. */
export const userPaymentsRouter = Router();
userPaymentsRouter.get('/', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await paginate(Payment, { userId: req.auth.id, status: { $in: ['paid', 'amount_mismatch'] } }, { ...req.valid.query, sort: { paidAt: -1 } });
  const refunds = await Refund.find({ paymentId: { $in: items.map((p) => p._id) } }).lean();
  const bookings = await Booking.find({ _id: { $in: items.map((p) => p.bookingId) } }).select('ref vehicleSnapshot.title').lean();
  const bMap = new Map(bookings.map((b) => [String(b._id), b]));
  ok(res, items.map((p) => ({ ...serializePayment(p), booking: { ref: bMap.get(String(p.bookingId))?.ref, vehicle: bMap.get(String(p.bookingId))?.vehicleSnapshot?.title }, refunds: refunds.filter((r) => String(r.paymentId) === String(p._id)).map(serializeRefund) })), meta);
});

// ================================================================= vendor
export const vendorBookingRouter = Router();
const VENDOR_TABS = { requests: ['pending_vendor_approval'], upcoming: ['confirmed'], active: ['ongoing', 'return_pending'], completed: ['completed'], cancelled: ['cancelled', 'rejected'] };

vendorBookingRouter.get('/', validate({ query: z.object({ ...paginationQuery, tab: z.enum(Object.keys(VENDOR_TABS)).optional(), vehicleId: objectId.optional() }) }), async (req, res) => {
  const { page, limit, tab, vehicleId } = req.valid.query;
  const filter = { vendorId: req.auth.id, status: { $in: tab ? VENDOR_TABS[tab] : Object.values(VENDOR_TABS).flat() } };
  if (vehicleId) filter.vehicleId = vehicleId;
  const sort = ['requests', 'upcoming'].includes(tab) ? { startAt: 1 } : { startAt: -1 };
  const { items, meta } = await paginate(Booking, filter, { page, limit, sort });
  const users = await User.find({ _id: { $in: items.map((b) => b.userId) } }).select('name phone kyc stats').lean();
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  ok(res, items.map((b) => serializeBooking(b, { audience: 'vendor', user: uMap.get(String(b.userId)) })), meta);
});

vendorBookingRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findOne({ _id: req.valid.params.id, vendorId: req.auth.id, status: { $nin: ['pending_payment', 'expired'] } }).lean();
  if (!b) throw notFound('Booking');
  const user = await User.findById(b.userId).select('name phone kyc stats').lean();
  const out = serializeBooking(b, { audience: 'vendor', user });
  out.inspections = await inspectionsFor(b._id);
  if (b.status === 'return_pending') out.settlementPreview = await previewSettlement(b);
  ok(res, out);
});

vendorBookingRouter.post('/:id/decision', validate({ params: idParams, body: z.object({ decision: z.enum(['accept', 'reject']), reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  await vendorDecision(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'vendor' }));
});

vendorBookingRouter.post('/:id/return-review', validate({
  params: idParams,
  body: z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('accept') }).strict(),
    z.object({ decision: z.literal('claim_damage'), damagePaise: z.number().int().min(100).max(50_000_000), description: z.string().trim().min(10).max(1000), photoFileIds: z.array(objectId).min(1).max(10) }).strict(),
  ]),
}), async (req, res) => {
  await vendorReturnReview(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'vendor' }));
});

// ================================================================= admin
export const adminBookingRouter = Router();

adminBookingRouter.get('/', requirePermission('bookings.read'), validate({
  query: z.object({ ...paginationQuery, status: z.enum(BOOKING_STATUSES).optional(), userId: objectId.optional(), vendorId: objectId.optional(), vehicleId: objectId.optional(), cityId: objectId.optional(), ref: z.string().trim().max(20).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }),
}), async (req, res) => {
  const { page, limit, status, userId, vendorId, vehicleId, cityId, ref, from, to } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.userId = userId;
  if (vendorId) filter.vendorId = vendorId;
  if (vehicleId) filter.vehicleId = vehicleId;
  if (cityId) filter.cityId = cityId;
  if (ref) filter.ref = new RegExp(`^${escapeRegex(ref.toUpperCase())}`);
  if (from || to) filter.startAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  const { items, meta } = await paginate(Booking, filter, { page, limit });
  const [users, vendors] = await Promise.all([
    User.find({ _id: { $in: items.map((b) => b.userId) } }).select('name phone kyc').lean(),
    Vendor.find({ _id: { $in: items.map((b) => b.vendorId) } }).select('name businessName phone').lean(),
  ]);
  const u = new Map(users.map((x) => [String(x._id), x]));
  const v = new Map(vendors.map((x) => [String(x._id), x]));
  ok(res, items.map((b) => serializeBooking(b, { audience: 'admin', user: u.get(String(b.userId)), vendor: v.get(String(b.vendorId)) })), meta);
});

adminBookingRouter.get('/:id', requirePermission('bookings.read'), validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findById(req.valid.params.id).lean();
  if (!b) throw notFound('Booking');
  const [user, vendor, inspections, payments, refunds, invoices] = await Promise.all([
    User.findById(b.userId).select('name phone email kyc').lean(),
    Vendor.findById(b.vendorId).select('name businessName phone').lean(),
    inspectionsFor(b._id),
    Payment.find({ bookingId: b._id }).sort({ createdAt: 1 }).lean(),
    Refund.find({ bookingId: b._id }).sort({ createdAt: 1 }).lean(),
    Invoice.find({ bookingId: b._id }).lean(),
  ]);
  const out = serializeBooking(b, { audience: 'admin', user, vendor });
  out.inspections = inspections;
  out.payments = payments.map((p) => ({ ...serializePayment(p), razorpayOrderId: p.razorpayOrderId, failureReason: p.failureReason, verifiedVia: p.verifiedVia }));
  out.refunds = refunds.map((r) => ({ ...serializeRefund(r), lastError: r.lastError, attempts: r.attempts }));
  out.invoices = invoices.map((i) => ({ id: i._id, number: i.number, type: i.type, totalPaise: i.totalPaise, issuedAt: i.issuedAt }));
  if (b.status === 'return_pending') out.settlementPreview = await previewSettlement(b);
  ok(res, out);
});

adminBookingRouter.post('/:id/cancel', requirePermission('bookings.manage'), validate({ params: idParams, body: z.object({ reason: z.string().trim().min(5).max(300) }).strict() }), async (req, res) => {
  await cancelByAdmin(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

adminBookingRouter.post('/:id/damage-claim', requirePermission('trips.manage'), validate({ params: idParams, body: z.object({ decision: z.enum(['approve', 'reject']), approvedPaise: z.number().int().min(0).max(50_000_000).optional(), note: z.string().trim().max(500).optional() }).strict() }), async (req, res) => {
  await resolveDamageClaim(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

adminBookingRouter.post('/:id/waive-outstanding', requirePermission('refunds.manage'), validate({ params: idParams, body: z.object({ reason: z.string().trim().min(5).max(300) }).strict() }), async (req, res) => {
  const b = await Booking.findOneAndUpdate({ _id: req.valid.params.id, 'settlement.outstandingStatus': 'due' }, { $set: { 'settlement.outstandingStatus': 'waived' } }, { new: true }).lean();
  if (!b) throw notFound('Outstanding amount');
  await audit(req, 'booking.outstanding_waived', { type: 'booking', id: b._id }, { reason: req.valid.body.reason, changes: { outstandingPaise: b.settlement.outstandingPaise } });
  ok(res, serializeBooking(b, { audience: 'admin' }));
});

adminBookingRouter.get('/:id/invoices/:invoiceId.pdf', requirePermission('payments.read'), validate({ params: z.object({ id: objectId, invoiceId: objectId }) }), async (req, res) => {
  const b = await Booking.findById(req.valid.params.id).lean();
  const inv = b && (await Invoice.findOne({ _id: req.valid.params.invoiceId, bookingId: b._id }).lean());
  if (!inv) throw notFound('Invoice');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${inv.number.replace(/\//g, '-')}.pdf"` });
  renderInvoicePdf(inv, b, res);
});

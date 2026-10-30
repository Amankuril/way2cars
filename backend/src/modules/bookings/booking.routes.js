import { Router } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { notFound, conflict } from '../../core/errors.js';
import { paginate, paginationQuery, escapeRegex } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { Booking, BOOKING_STATUSES, BLOCKING_STATUSES } from './booking.model.js';
import { Vehicle, VehicleBlock } from '../vehicles/vehicle.model.js';
import { serializeVehicle } from '../vehicles/vehicle.service.js';
import { validateTripWindow } from './availability.service.js';
import { computeRental } from '../pricing/pricing.js';
import { serializeBooking, bookingSplit } from './booking.serializer.js';
import { LedgerEntry } from '../wallet/wallet.model.js';
import {
  buildQuote, serializeQuote, createBooking, bookingPaymentOrder, cancelByUser, cancellationPreview,
  decideBooking, cancelByAdmin, requestExtension, extensionPaymentOrder, balancePaymentOrder,
} from './booking.service.js';
import { createOfflineBooking, decideExtension, adminExtend, extensionCheck, recordOfficeCollection, adjustBookingPrice } from './booking.admin.service.js';
import { withTransaction } from '../../core/db.js';
import { runEffects } from './booking.lifecycle.js';
import { getSettings } from '../settings/settings.service.js';
import { serializeRefund, markManualRefundProcessed, refundToWallet } from '../payments/refund.service.js';
import { startTrip, submitReturn, agreementFor, pickupSchema, returnSchema, vendorReturnReview, resolveDamageClaim, settlementPaymentOrder, inspectionsFor, previewSettlement, finalizeTrip, reviewDeposit, markCollateral } from '../trips/trip.service.js';
import { verifyCheckout, markPaymentFailed, serializePayment } from '../payments/payment.service.js';
import { Payment, Refund, Invoice } from '../payments/payment.model.js';
import { renderInvoicePdf } from '../payments/invoice.service.js';
import { User } from '../users/user.model.js';
import { Vendor, hostVisibilityFor } from '../vendors/vendor.model.js';
import { audit } from '../../core/audit.js';
import { DamageClaim } from '../trips/trip.model.js';
import { bookingTerms, confirmationPreview, sendBookingConfirmation } from '../messaging/booking.messages.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const idParams = z.object({ id: objectId });
const tripWindow = { vehicleId: objectId, startAt: z.coerce.date(), endAt: z.coerce.date() };
const delivery = z.object({ address: z.string().trim().min(5).max(300), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), placeId: z.string().max(300).optional() }).strict().optional();
const collateral = z.object({
  make: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(2000).max(2100),
  registrationNumber: z.string().trim().max(15).optional(),
  serialNumber: z.string().trim().max(60).optional(),
  description: z.string().trim().max(200).optional(),
}).strict();
const tripOptions = {
  unlimitedKm: z.boolean().default(false),
  depositOption: z.enum(['cash', 'bike', 'laptop']).default('cash'),
  collateral: collateral.optional(),
  pickupLocationId: objectId.optional(),
  dropoffLocationId: objectId.optional(),
};
const quoteBody = z.object({ ...tripWindow, delivery, couponCode: z.string().trim().toUpperCase().max(20).optional(), useWallet: z.boolean().default(false), paymentPlan: z.enum(['full', 'advance']).default('full'), ...tripOptions }).strict();
const officeMethod = z.enum(['cash', 'upi', 'card', 'bank_transfer']);
const officeRef = z.string().trim().max(60).optional();
const TABS = {
  upcoming: ['pending_payment', 'pending_vendor_approval', 'confirmed'],
  active: ['ongoing', 'return_pending'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected', 'expired'],
};
const collateralBody = z.object({ action: z.enum(['received', 'returned']), note: z.string().trim().max(300).optional() }).strict();
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
  out.terms = bookingTerms(b, await getSettings());
  ok(res, out);
});

userBookingRouter.post('/:id/payment-order', validate({ params: idParams }), async (req, res) => ok(res, await bookingPaymentOrder(req.auth.id, req.valid.params.id)));
userBookingRouter.post('/:id/balance-payment-order', validate({ params: idParams }), async (req, res) => ok(res, await balancePaymentOrder(req.auth.id, req.valid.params.id)));
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
  created(res, { extension: { id: r.extension._id, status: r.extension.status, requestedEndAt: r.extension.requestedEndAt, pricing: r.extension.pricing, holdExpiresAt: r.extension.holdExpiresAt }, payment: r.payment });
});

userBookingRouter.post('/:id/extensions/:extensionId/payment-order', validate({ params: z.object({ id: objectId, extensionId: objectId }) }), async (req, res) => {
  ok(res, await extensionPaymentOrder(req.auth.id, req.valid.params.id, req.valid.params.extensionId));
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
  const bookings = await Booking.find({ _id: { $in: items.map((p) => p.bookingId) } }).select('ref vehicleSnapshot.title pricing.advancePaise').lean();
  const bMap = new Map(bookings.map((b) => [String(b._id), b]));
  ok(res, items.map((p) => ({ ...serializePayment(p), isAdvance: p.purpose === 'booking' && Boolean(bMap.get(String(p.bookingId))?.pricing?.advancePaise), booking: { ref: bMap.get(String(p.bookingId))?.ref, vehicle: bMap.get(String(p.bookingId))?.vehicleSnapshot?.title }, refunds: refunds.filter((r) => String(r.paymentId) === String(p._id)).map(serializeRefund) })), meta);
});

// ================================================================= vendor
export const vendorBookingRouter = Router();

async function visibilityFor(vendorId) {
  const [vendor, settings] = await Promise.all([Vendor.findById(vendorId).select('hostVisibility isCompany').lean(), getSettings()]);
  return hostVisibilityFor(vendor, settings);
}
const VENDOR_TABS = { requests: ['pending_vendor_approval'], upcoming: ['confirmed'], active: ['ongoing', 'return_pending'], completed: ['completed'], cancelled: ['cancelled', 'rejected'] };

vendorBookingRouter.get('/', validate({ query: z.object({ ...paginationQuery, tab: z.enum(Object.keys(VENDOR_TABS)).optional(), vehicleId: objectId.optional() }) }), async (req, res) => {
  const { page, limit, tab, vehicleId } = req.valid.query;
  const filter = { vendorId: req.auth.id, status: { $in: tab ? VENDOR_TABS[tab] : Object.values(VENDOR_TABS).flat() } };
  if (vehicleId) filter.vehicleId = vehicleId;
  const sort = ['requests', 'upcoming'].includes(tab) ? { startAt: 1 } : { startAt: -1 };
  const { items, meta } = await paginate(Booking, filter, { page, limit, sort });
  const [users, visibility] = await Promise.all([User.find({ _id: { $in: items.map((b) => b.userId) } }).select('name phone kyc stats').lean(), visibilityFor(req.auth.id)]);
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  ok(res, items.map((b) => serializeBooking(b, { audience: 'vendor', user: uMap.get(String(b.userId)), visibility })), meta);
});

vendorBookingRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findOne({ _id: req.valid.params.id, vendorId: req.auth.id, status: { $nin: ['pending_payment', 'expired'] } }).lean();
  if (!b) throw notFound('Booking');
  const [user, visibility] = await Promise.all([User.findById(b.userId).select('name phone kyc stats').lean(), visibilityFor(req.auth.id)]);
  const out = serializeBooking(b, { audience: 'vendor', user, visibility });
  out.inspections = await inspectionsFor(b._id);
  if (b.status === 'return_pending') {
    const p = await previewSettlement(b);
    out.settlementPreview = visibility.bookingAmounts ? p : { kmDriven: p.kmDriven, extraKm: p.extraKm, fuelShortEighths: p.fuelShortEighths, lateHours: p.lateHours };
  }
  ok(res, out);
});

vendorBookingRouter.post('/:id/decision', validate({ params: idParams, body: z.object({ decision: z.enum(['accept', 'reject']), reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  await decideBooking(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'vendor', visibility: await visibilityFor(req.auth.id) }));
});

vendorBookingRouter.post('/:id/collateral', validate({ params: idParams, body: collateralBody }), async (req, res) => {
  await markCollateral(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'vendor', visibility: await visibilityFor(req.auth.id) }));
});

vendorBookingRouter.post('/:id/return-review', validate({
  params: idParams,
  body: z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('accept') }).strict(),
    z.object({ decision: z.literal('claim_damage'), damagePaise: z.number().int().min(100).max(50_000_000), description: z.string().trim().min(10).max(1000), photoFileIds: z.array(objectId).min(1).max(10) }).strict(),
  ]),
}), async (req, res) => {
  await vendorReturnReview(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'vendor', visibility: await visibilityFor(req.auth.id) }));
});

// ================================================================= admin
export const adminBookingRouter = Router();

adminBookingRouter.get('/', requirePermission('bookings.read'), validate({
  query: z.object({ ...paginationQuery, status: z.enum(BOOKING_STATUSES).optional(), userId: objectId.optional(), vendorId: objectId.optional(), vehicleId: objectId.optional(), cityId: objectId.optional(), ref: z.string().trim().max(20).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), source: z.enum(['app', 'offline']).optional(), ownership: z.enum(['host', 'company']).optional(), attention: z.enum(['extension_requests', 'balance_due', 'deposit_review', 'collateral']).optional() }),
}), async (req, res) => {
  const { page, limit, status, userId, vendorId, vehicleId, cityId, ref, from, to, source, ownership, attention } = req.valid.query;
  const filter = {};
  if (source) filter.source = source === 'app' ? { $ne: 'offline' } : 'offline';
  if (ownership) filter.ownership = ownership === 'host' ? { $ne: 'company' } : 'company';
  if (attention === 'extension_requests') filter['extensions.status'] = 'pending_approval';
  if (attention === 'balance_due') Object.assign(filter, { 'balance.status': 'due', status: { $in: ['pending_vendor_approval', 'confirmed'] } });
  if (attention === 'deposit_review') filter['settlement.depositRefundStatus'] = 'pending_review';
  if (attention === 'collateral') filter['deposit.status'] = { $in: ['awaiting', 'received'] };
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
  if (['cancelled', 'rejected'].includes(b.status)) {
    const earned = await LedgerEntry.find({ bookingId: b._id, type: { $in: ['trip_earning', 'investor_earning'] } }).select('type amountPaise').lean();
    const sum = (type) => earned.filter((e) => e.type === type).reduce((t, e) => t + e.amountPaise, 0);
    out.split = bookingSplit(b, { ownerEarnedPaise: sum('trip_earning'), investorEarnedPaise: sum('investor_earning') });
  }
  if (b.status === 'completed') {
    const settings = await getSettings();
    out.lateFeePerHourPaise = Math.round(((b.pricing.hourlyPaise || 0) * settings.trip.lateFeeMultiplierBps) / 10000);
    out.depositDefaultRefundDays = settings.deposit.defaultRefundDays;
  }
  out.inspections = inspections;
  out.payments = payments.map((p) => ({ ...serializePayment(p), razorpayOrderId: p.razorpayOrderId, failureReason: p.failureReason, verifiedVia: p.verifiedVia }));
  out.refunds = refunds.map((r) => ({ ...serializeRefund(r), lastError: r.lastError, attempts: r.attempts }));
  out.invoices = invoices.map((i) => ({ id: i._id, number: i.number, type: i.type, totalPaise: i.totalPaise, issuedAt: i.issuedAt }));
  if (b.status === 'return_pending') out.settlementPreview = await previewSettlement(b);
  ok(res, out);
});

const refundTo = z.enum(['source', 'wallet']).default('source');
adminBookingRouter.post('/:id/cancel', requirePermission('bookings.manage'), validate({ params: idParams, body: z.object({ reason: z.string().trim().min(5).max(300), refundTo }).strict() }), async (req, res) => {
  await cancelByAdmin(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

adminBookingRouter.post('/:id/damage-claim', requirePermission('trips.manage'), validate({ params: idParams, body: z.object({ decision: z.enum(['approve', 'reject']), approvedPaise: z.number().int().min(0).max(50_000_000).optional(), note: z.string().trim().max(500).optional() }).strict() }), async (req, res) => {
  await resolveDamageClaim(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

/** The confirmation text, its WhatsApp click-to-send link, and the send log. */
adminBookingRouter.get('/:id/confirmation-message', requirePermission('bookings.read'), validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findById(req.valid.params.id).lean();
  if (!b) throw notFound('Booking');
  ok(res, { ...(await confirmationPreview(b)), messages: b.messages || [] });
});

adminBookingRouter.post('/:id/confirmation-message', requirePermission('bookings.manage'), validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findById(req.valid.params.id).lean();
  if (!b) throw notFound('Booking');
  if (!['confirmed', 'ongoing', 'return_pending', 'completed'].includes(b.status)) throw conflict('Only confirmed bookings get a confirmation message.', 'NOT_CONFIRMED');
  const results = await sendBookingConfirmation(b._id, { force: true });
  await audit(req, 'booking.confirmation_resent', { type: 'booking', id: b._id }, { changes: { channels: results.map((r) => `${r.channel}:${r.status}`) } });
  ok(res, { results, messages: (await Booking.findById(b._id).select('messages').lean()).messages || [] });
});

adminBookingRouter.post('/:id/deposit-review', requirePermission('trips.manage'), validate({
  params: idParams,
  body: z.object({
    extraCharges: z.array(z.object({ label: z.string().trim().min(2).max(60), amountPaise: z.number().int().min(100).max(50_000_000), note: z.string().trim().max(200).optional() }).strict()).max(10).default([]),
    refundAt: z.coerce.date().optional(),
    note: z.string().trim().max(500).optional(),
    refundTo,
  }).strict(),
}), async (req, res) => {
  await reviewDeposit(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

adminBookingRouter.post('/:id/collateral', requirePermission('trips.manage'), validate({ params: idParams, body: collateralBody }), async (req, res) => {
  const b = await markCollateral(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(b.toObject(), { audience: 'admin' }));
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

// ---- office (offline) bookings
const officeBooking = z.object({
  phone: z.string().trim().min(10).max(14),
  name: z.string().trim().min(2).max(100).optional(),
  vehicleId: objectId,
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  pricing: z.object({
    rentalPaise: z.number().int().min(0).max(100_000_000).optional(),
    depositPaise: z.number().int().min(0).max(10_000_000).optional(),
    discountPaise: z.number().int().min(0).max(100_000_000).optional(),
    waiveConvenienceFee: z.boolean().optional(),
    note: z.string().trim().max(200).optional(),
  }).strict().optional(),
  payment: z.discriminatedUnion('status', [
    z.object({ status: z.literal('paid'), method: officeMethod, reference: officeRef }).strict(),
    z.object({ status: z.literal('partial'), amountPaise: z.number().int().min(100), method: officeMethod, reference: officeRef }).strict(),
    z.object({ status: z.literal('unpaid') }).strict(),
  ]),
  balanceDueAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
  ...tripOptions,
}).strict();

/**
 * Office booking, step 1: every approved car free for the whole period (bookings with buffer and host
 * blocks excluded), optionally only 5-seaters or 7+-seaters, with the price for those dates.
 */
adminBookingRouter.get('/offline/available-cars', requirePermission('bookings.manage'), validate({
  query: z.object({ startAt: z.coerce.date(), endAt: z.coerce.date(), seats: z.enum(['5', '7']).optional(), cityId: objectId.optional(), q: z.string().trim().max(40).optional() }),
}), async (req, res) => {
  const { startAt, endAt, seats, cityId, q } = req.valid.query;
  const window = await validateTripWindow(startAt, endAt, { skipLead: true });
  const filter = { 'approval.status': 'approved', adminSuspended: false, status: 'active' };
  if (seats === '5') filter.seats = 5;
  if (seats === '7') filter.seats = { $gte: 7 };
  if (cityId) filter.cityId = cityId;
  if (q) filter.$or = [{ registrationNumber: new RegExp(escapeRegex(q.replace(/\s/g, '').toUpperCase())) }, { model: new RegExp(escapeRegex(q), 'i') }];
  const cars = await Vehicle.find(filter).populate([{ path: 'brandId', select: 'name' }, { path: 'cityId', select: 'name' }]).sort({ 'pricing.dailyPaise': 1 }).limit(300).lean();
  const { booking: rules } = await getSettings();
  const buf = rules.bufferMinutes * 60_000;
  const now = new Date();
  const ids = cars.map((c) => c._id);
  const [busy, blocked] = await Promise.all([
    Booking.distinct('vehicleId', { vehicleId: { $in: ids }, status: { $in: BLOCKING_STATUSES }, startAt: { $lt: new Date(window.endAt.getTime() + buf) }, blockEndAt: { $gt: new Date(window.startAt.getTime() - buf) }, $or: [{ status: { $ne: 'pending_payment' } }, { holdExpiresAt: { $gt: now } }] }),
    VehicleBlock.distinct('vehicleId', { vehicleId: { $in: ids }, startAt: { $lt: window.endAt }, endAt: { $gt: window.startAt } }),
  ]);
  const taken = new Set([...busy, ...blocked].map(String));
  const free = cars.filter((c) => !taken.has(String(c._id)));
  ok(res, free.map((c) => ({
    ...serializeVehicle(c, { audience: 'admin' }),
    estimate: computeRental({ startAt: window.startAt, endAt: window.endAt, pricing: c.pricing }),
  })), { total: free.length, unavailable: cars.length - free.length, hours: window.hours });
});

/** Price + availability for an office booking before staff confirm it. */
adminBookingRouter.post('/offline/quote', requirePermission('bookings.manage'), validate({ body: officeBooking.pick({ vehicleId: true, startAt: true, endAt: true, pricing: true, unlimitedKm: true, depositOption: true, pickupLocationId: true, dropoffLocationId: true }) }), async (req, res) => {
  const { vehicleId, startAt, endAt, pricing, ...options } = req.valid.body;
  try {
    const q = await buildQuote({ vehicleId, startAt, endAt, ...options }, { office: { ...pricing } });
    ok(res, { available: true, ...serializeQuote(q), commissionBps: undefined });
  } catch (err) {
    if (err.code === 'VEHICLE_UNAVAILABLE') return ok(res, { available: false, message: err.message });
    throw err;
  }
});

adminBookingRouter.post('/offline', requirePermission('bookings.manage'), validate({ body: officeBooking }), async (req, res) => {
  const b = await createOfflineBooking(req, req.valid.body);
  created(res, serializeBooking(b, { audience: 'admin' }));
});

// ---- operations acting for the car owner (company fleet, or when a host is unreachable)
adminBookingRouter.post('/:id/decision', requirePermission('bookings.manage'), validate({ params: idParams, body: z.object({ decision: z.enum(['accept', 'reject']), reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  await decideBooking(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

adminBookingRouter.post('/:id/return-review', requirePermission('trips.manage'), validate({ params: idParams, body: z.object({ decision: z.literal('accept') }).strict() }), async (req, res) => {
  if (await DamageClaim.exists({ bookingId: req.valid.params.id, status: 'pending' })) throw conflict('Resolve the host’s damage claim instead.', 'CLAIM_EXISTS');
  const fx = await withTransaction((session) => finalizeTrip(req.valid.params.id, { by: { realm: 'admin', id: req.auth.id } }, session));
  await runEffects(fx);
  await audit(req, 'trip.return_accepted', { type: 'booking', id: req.valid.params.id });
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

// ---- extensions
adminBookingRouter.get('/:id/extension-check', requirePermission('bookings.read'), validate({ params: idParams, query: z.object({ endAt: z.coerce.date() }) }), async (req, res) => {
  ok(res, await extensionCheck(req.valid.params.id, req.valid.query.endAt));
});

adminBookingRouter.post('/:id/extensions/:extensionId/decision', requirePermission('bookings.manage'), validate({ params: z.object({ id: objectId, extensionId: objectId }), body: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() }).strict() }), async (req, res) => {
  await decideExtension(req, req.valid.params.id, req.valid.params.extensionId, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

adminBookingRouter.post('/:id/extensions', requirePermission('bookings.manage'), validate({
  params: idParams,
  body: z.object({
    endAt: z.coerce.date(),
    rentalPaise: z.number().int().min(0).max(100_000_000).optional(),
    charge: z.enum(['collect_in_app', 'paid_offline', 'waive']),
    method: officeMethod.optional(),
    reference: officeRef,
    note: z.string().trim().max(300).optional(),
  }).strict().refine((b) => b.charge !== 'paid_offline' || b.method, { message: 'Choose how it was paid', path: ['method'] }),
}), async (req, res) => {
  await adminExtend(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

// ---- money collected at the office, and refunds handed back by hand
adminBookingRouter.post('/:id/office-payments', requirePermission('bookings.manage'), validate({
  params: idParams,
  body: z.object({ purpose: z.enum(['balance', 'extension', 'settlement']), extensionId: objectId.optional(), method: officeMethod, reference: officeRef, note: z.string().trim().max(300).optional() }).strict()
    .refine((b) => b.purpose !== 'extension' || b.extensionId, { message: 'Choose the extension', path: ['extensionId'] }),
}), async (req, res) => {
  await recordOfficeCollection(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

/** Reduce what the renter pays (e.g. breakdown caused by Way2Cars), with a mandatory reason. */
adminBookingRouter.post('/:id/adjustments', requirePermission('refunds.manage'), validate({
  params: idParams,
  body: z.object({ amountPaise: z.number().int().min(100).max(100_000_000), reason: z.string().trim().min(5, 'Enter a reason (at least 5 characters)').max(300), refundTo }).strict(),
}), async (req, res) => {
  await adjustBookingPrice(req, req.valid.params.id, req.valid.body);
  ok(res, serializeBooking(await Booking.findById(req.valid.params.id).lean(), { audience: 'admin' }));
});

/** A refund waiting to be returned by hand (or one that failed) is credited to the renter's wallet instead. */
adminBookingRouter.post('/:id/refunds/:refundId/to-wallet', requirePermission('refunds.manage'), validate({ params: z.object({ id: objectId, refundId: objectId }) }), async (req, res) => {
  const r = await withTransaction((session) => refundToWallet(req.valid.params.refundId, req.valid.params.id, { realm: 'admin', id: req.auth.id }, session));
  if (!r) throw conflict('Only refunds waiting to be returned by hand, or failed refunds, can be moved to the wallet.', 'NOT_MOVABLE');
  await audit(req, 'refund.moved_to_wallet', { type: 'booking', id: req.valid.params.id }, { changes: { refundId: r._id, amountPaise: r.amountPaise } });
  ok(res, serializeRefund(r.toObject()));
});

adminBookingRouter.post('/:id/refunds/:refundId/manual-processed', requirePermission('refunds.manage'), validate({ params: z.object({ id: objectId, refundId: objectId }), body: z.object({ reference: z.string().trim().min(3).max(60) }).strict() }), async (req, res) => {
  const r = await markManualRefundProcessed(req.valid.params.refundId, req.valid.params.id, req.valid.body.reference);
  if (!r) throw conflict('This refund is not awaiting a manual payout.', 'NOT_MANUAL');
  await audit(req, 'refund.manual_processed', { type: 'booking', id: req.valid.params.id }, { changes: { refundId: r._id, reference: req.valid.body.reference, amountPaise: r.amountPaise } });
  ok(res, serializeRefund(r.toObject()));
});

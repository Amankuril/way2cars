import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../core/http.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { User } from '../users/user.model.js';
import { Vendor } from '../vendors/vendor.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { Booking } from '../bookings/booking.model.js';
import { Payment, Refund } from '../payments/payment.model.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { SupportTicket } from '../support/support.model.js';
import { PayoutRequest } from '../payouts/payout.model.js';
import { DamageClaim } from '../trips/trip.model.js';
import { LedgerEntry } from '../wallet/wallet.model.js';
import mongoose from 'mongoose';

/**
 * Metric definitions (documented in docs/REPORTS.md):
 *  - Gross booking value (GBV): sum of pricing.chargesPaise of bookings that were paid (excludes deposits).
 *  - Collected: sum of captured payments; Refunded: sum of processed/initiated refunds.
 *  - Platform revenue: commission on completed trips (settlement.commissionPaise) + convenience fees of paid bookings.
 *  - Active vehicles: vehicles currently listed (approved, active, host approved, not suspended).
 * All day buckets use IST.
 */
const PAID_STATUSES = ['pending_vendor_approval', 'confirmed', 'ongoing', 'return_pending', 'completed'];
const range = z.object({
  from: z.coerce.date().default(() => new Date(Date.now() - 30 * 86400_000)),
  to: z.coerce.date().default(() => new Date()),
  cityId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  format: z.enum(['json', 'csv']).default('json'),
}).refine((r) => r.to > r.from && r.to - r.from <= 400 * 86400_000, 'Choose a range up to ~13 months');
const day = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: 'Asia/Kolkata' } });
const cityMatch = (cityId) => (cityId ? { cityId: new mongoose.Types.ObjectId(cityId) } : {});

function sendCsv(res, name, rows) {
  if (!rows.length) rows = [{ note: 'no data' }];
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // CSV formula-injection guard
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` });
  res.send([cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
}
const out = (req, res, name, rows, extra) => (req.valid.query.format === 'csv' ? sendCsv(res, name, rows) : ok(res, { rows, ...extra }));

export const adminReportsRouter = Router();

adminReportsRouter.get('/dashboard', requirePermission('dashboard.read'), async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10) + 'T00:00:00+05:30');
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const [users, vendors, vehicles, bookingsByStatus, today, collected30, refunded30, commission30, queues, trend] = await Promise.all([
    User.countDocuments({ status: { $ne: 'deleted' } }),
    Vendor.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Vehicle.aggregate([{ $group: { _id: null, total: { $sum: 1 }, listed: { $sum: { $cond: ['$isListed', 1, 0] } }, pending: { $sum: { $cond: [{ $eq: ['$approval.status', 'pending_review'] }, 1, 0] } } } }]),
    Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { 'payment.paidAt': { $gte: startOfDay } } }, { $group: { _id: null, n: { $sum: 1 }, gbv: { $sum: '$pricing.chargesPaise' } } }]),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: d30 } } }, { $group: { _id: null, sum: { $sum: '$amountPaise' } } }]),
    Refund.aggregate([{ $match: { status: { $in: ['initiated', 'processed'] }, createdAt: { $gte: d30 } } }, { $group: { _id: null, sum: { $sum: '$amountPaise' } } }]),
    Booking.aggregate([{ $match: { status: 'completed', 'settlement.settledAt': { $gte: d30 } } }, { $group: { _id: null, sum: { $sum: '$settlement.commissionPaise' } } }]),
    Promise.all([
      KycSubmission.countDocuments({ status: 'pending' }),
      Vendor.countDocuments({ status: 'pending_approval' }),
      Vehicle.countDocuments({ 'approval.status': 'pending_review' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      SupportTicket.countDocuments({ category: 'roadside', status: { $nin: ['resolved', 'closed'] } }),
      PayoutRequest.countDocuments({ status: { $in: ['requested', 'approved'] } }),
      DamageClaim.countDocuments({ status: 'pending' }),
      Refund.countDocuments({ status: 'failed' }),
    ]),
    Booking.aggregate([
      { $match: { 'payment.paidAt': { $gte: new Date(now.getTime() - 14 * 86400_000) } } },
      { $group: { _id: day('$payment.paidAt'), bookings: { $sum: 1 }, gbvPaise: { $sum: '$pricing.chargesPaise' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const [kyc, vendorApprovals, vehicleReviews, openTickets, roadside, payouts, damageClaims, failedRefunds] = queues;
  ok(res, {
    totals: {
      users,
      vendors: Object.fromEntries(vendors.map((v) => [v._id, v.n])),
      vehicles: vehicles[0] || { total: 0, listed: 0, pending: 0 },
      bookings: Object.fromEntries(bookingsByStatus.map((b) => [b._id, b.n])),
    },
    today: { paidBookings: today[0]?.n || 0, gbvPaise: today[0]?.gbv || 0 },
    last30Days: { collectedPaise: collected30[0]?.sum || 0, refundedPaise: refunded30[0]?.sum || 0, commissionPaise: commission30[0]?.sum || 0 },
    queues: { kyc, vendorApprovals, vehicleReviews, openTickets, roadside, payouts, damageClaims, failedRefunds },
    trend: trend.map((t) => ({ date: t._id, bookings: t.bookings, gbvPaise: t.gbvPaise })),
  });
});

adminReportsRouter.get('/revenue', requirePermission('reports.read'), validate({ query: range }), async (req, res) => {
  const { from, to, cityId } = req.valid.query;
  const rows = await Booking.aggregate([
    { $match: { 'payment.paidAt': { $gte: from, $lt: to }, status: { $in: [...PAID_STATUSES, 'cancelled', 'rejected'] }, ...cityMatch(cityId) } },
    { $group: {
      _id: day('$payment.paidAt'),
      bookings: { $sum: 1 },
      rentalPaise: { $sum: '$pricing.rentalPaise' },
      discountPaise: { $sum: '$pricing.discountPaise' },
      convenienceFeePaise: { $sum: '$pricing.convenienceFeePaise' },
      deliveryFeePaise: { $sum: '$pricing.deliveryFeePaise' },
      gstPaise: { $sum: '$pricing.gstPaise' },
      gbvPaise: { $sum: '$pricing.chargesPaise' },
      commissionPaise: { $sum: { $ifNull: ['$settlement.commissionPaise', 0] } },
    } },
    { $sort: { _id: 1 } },
  ]);
  out(req, res, 'revenue', rows.map(({ _id, ...r }) => ({ date: _id, ...r })));
});

adminReportsRouter.get('/bookings', requirePermission('reports.read'), validate({ query: range }), async (req, res) => {
  const { from, to, cityId } = req.valid.query;
  const rows = await Booking.aggregate([
    { $match: { createdAt: { $gte: from, $lt: to }, ...cityMatch(cityId) } },
    { $group: { _id: { d: day('$createdAt'), s: '$status' }, n: { $sum: 1 } } },
    { $group: { _id: '$_id.d', statuses: { $push: { k: '$_id.s', v: '$n' } }, total: { $sum: '$n' } } },
    { $sort: { _id: 1 } },
  ]);
  out(req, res, 'bookings', rows.map((r) => ({ date: r._id, total: r.total, ...Object.fromEntries(r.statuses.map((s) => [s.k, s.v])) })));
});

adminReportsRouter.get('/vehicle-performance', requirePermission('reports.read'), validate({ query: range }), async (req, res) => {
  const { from, to, cityId } = req.valid.query;
  const rows = await Booking.aggregate([
    { $match: { status: 'completed', 'settlement.settledAt': { $gte: from, $lt: to }, ...cityMatch(cityId) } },
    { $group: { _id: '$vehicleId', trips: { $sum: 1 }, hours: { $sum: '$pricing.hours' }, rentalPaise: { $sum: '$pricing.rentalPaise' }, hostEarningsPaise: { $sum: '$settlement.vendorEarningPaise' }, kmDriven: { $sum: '$settlement.kmDriven' }, title: { $first: '$vehicleSnapshot.title' }, reg: { $first: '$vehicleSnapshot.registrationNumber' } } },
    { $lookup: { from: 'vehicles', localField: '_id', foreignField: '_id', as: 'v', pipeline: [{ $project: { rating: 1 } }] } },
    { $sort: { rentalPaise: -1 } },
    { $limit: 500 },
  ]);
  const periodHours = (to - from) / 3600_000;
  out(req, res, 'vehicle-performance', rows.map((r) => ({ vehicleId: String(r._id), vehicle: r.title, registration: r.reg, trips: r.trips, bookedHours: r.hours, utilisationPct: Math.round((r.hours / periodHours) * 1000) / 10, rentalPaise: r.rentalPaise, hostEarningsPaise: r.hostEarningsPaise, kmDriven: r.kmDriven, rating: r.v[0]?.rating?.avg || 0 })));
});

adminReportsRouter.get('/user-growth', requirePermission('reports.read'), validate({ query: range }), async (req, res) => {
  const { from, to } = req.valid.query;
  const [u, v] = await Promise.all([
    User.aggregate([{ $match: { createdAt: { $gte: from, $lt: to } } }, { $group: { _id: day('$createdAt'), n: { $sum: 1 } } }]),
    Vendor.aggregate([{ $match: { createdAt: { $gte: from, $lt: to } } }, { $group: { _id: day('$createdAt'), n: { $sum: 1 } } }]),
  ]);
  const dates = [...new Set([...u, ...v].map((x) => x._id))].sort();
  const um = new Map(u.map((x) => [x._id, x.n]));
  const vm = new Map(v.map((x) => [x._id, x.n]));
  out(req, res, 'user-growth', dates.map((d) => ({ date: d, newUsers: um.get(d) || 0, newHosts: vm.get(d) || 0 })));
});

adminReportsRouter.get('/host-earnings', requirePermission('reports.read'), validate({ query: range }), async (req, res) => {
  const { from, to } = req.valid.query;
  const rows = await LedgerEntry.aggregate([
    { $match: { 'owner.realm': 'vendor', createdAt: { $gte: from, $lt: to }, type: { $in: ['trip_earning', 'payout_paid'] } } },
    { $group: { _id: '$owner.id', earnedPaise: { $sum: { $cond: [{ $eq: ['$type', 'trip_earning'] }, '$amountPaise', 0] } }, paidOutPaise: { $sum: { $cond: [{ $eq: ['$type', 'payout_paid'] }, '$amountPaise', 0] } }, trips: { $sum: { $cond: [{ $eq: ['$type', 'trip_earning'] }, 1, 0] } } } },
    { $lookup: { from: 'vendor_accounts', localField: '_id', foreignField: '_id', as: 'v', pipeline: [{ $project: { name: 1, businessName: 1, phone: 1, wallet: 1 } }] } },
    { $sort: { earnedPaise: -1 } },
  ]);
  out(req, res, 'host-earnings', rows.map((r) => ({ vendorId: String(r._id), host: r.v[0]?.businessName || r.v[0]?.name, phone: r.v[0]?.phone, trips: r.trips, earnedPaise: r.earnedPaise, paidOutPaise: r.paidOutPaise, availablePaise: r.v[0]?.wallet?.availablePaise || 0, pendingPaise: r.v[0]?.wallet?.pendingPaise || 0 })));
});

adminReportsRouter.get('/payments', requirePermission('payments.read'), validate({ query: range.and(z.object({ status: z.enum(['created', 'paid', 'failed', 'amount_mismatch']).optional() })) }), async (req, res) => {
  const { from, to, status } = req.valid.query;
  const filter = { createdAt: { $gte: from, $lt: to } };
  if (status) filter.status = status;
  const rows = await Payment.find(filter).sort({ createdAt: -1 }).limit(5000).populate('bookingId', 'ref').lean();
  out(req, res, 'payments', rows.map((p) => ({ createdAt: p.createdAt.toISOString(), booking: p.bookingId?.ref, purpose: p.purpose, amountPaise: p.amountPaise, status: p.status, method: p.method || '', razorpayOrderId: p.razorpayOrderId, razorpayPaymentId: p.razorpayPaymentId || '', refundedPaise: p.refundedPaise, verifiedVia: p.verifiedVia || '' })));
});

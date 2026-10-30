import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { validate } from '../../middleware/validate.js';
import { analyticsLimiter } from '../../middleware/rateLimit.js';
import { requirePermission } from '../../middleware/auth.js';
import { verifyAccessToken } from '../auth/token.service.js';
import { audit } from '../../core/audit.js';
import { AnalyticsEvent, AnalyticsFollowUp, ANALYTICS_EVENTS } from './analytics.model.js';
import { Booking } from '../bookings/booking.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { User } from '../users/user.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const DAY = 86400_000;

// ================================================================ ingest (renter app, no login needed)
const eventSchema = z.object({
  event: z.enum(ANALYTICS_EVENTS),
  at: z.coerce.date(),
  sessionId: z.string().max(64).optional(),
  props: z.object({
    firstOpen: z.boolean().optional(),
    screen: z.string().max(60).optional(),
    vehicleId: objectId.optional(),
    bookingId: objectId.optional(),
    cityId: objectId.optional(),
    amountPaise: z.number().int().min(0).max(100_000_000).optional(),
    reason: z.string().max(200).optional(),
  }).strip().default({}),
}).strip();
const batchSchema = z.object({
  deviceId: z.string().min(8).max(64).regex(/^[\w-]+$/),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
  appVersion: z.string().max(20).optional(),
  events: z.array(eventSchema).min(1).max(50),
}).strict();

/** The signed-in renter, if the app sent a valid access token (anonymous otherwise). */
function optionalUserId(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return undefined;
  try {
    return verifyAccessToken(header.slice(7), 'user').sub;
  } catch {
    return undefined;
  }
}

export const publicAnalyticsRouter = Router();
publicAnalyticsRouter.post('/analytics/events', analyticsLimiter, validate({ body: batchSchema }), async (req, res) => {
  const { deviceId, platform, appVersion, events } = req.valid.body;
  const userId = optionalUserId(req);
  const now = Date.now();
  // Clock skew guard: keep events within the last 7 days and not in the future.
  const docs = events.map((e) => ({ ...e, at: new Date(Math.min(now, Math.max(now - 7 * DAY, e.at.getTime()))), deviceId, platform, appVersion, userId }));
  await AnalyticsEvent.insertMany(docs, { ordered: false });
  noContent(res);
});

// ================================================================ admin
const range = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const window = ({ from, to }) => {
  const end = to || new Date();
  return { from: from || new Date(end.getTime() - 30 * DAY), to: end };
};
const distinctCount = async (match, field) => (await AnalyticsEvent.aggregate([{ $match: match }, { $group: { _id: `$${field}` } }, { $count: 'n' }]))[0]?.n || 0;

export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(requirePermission('analytics.read'));

/** Installs, activity, funnel, bounce rate, payments and most-viewed cars for a date range. */
adminAnalyticsRouter.get('/overview', validate({ query: range }), async (req, res) => {
  const { from, to } = window(req.valid.query);
  const at = { $gte: from, $lt: to };
  const step = async (event) => ({ devices: await distinctCount({ at, event }, 'deviceId'), users: await distinctCount({ at, event, userId: { $ne: null } }, 'userId') });

  const [installs, activeDevices, activeUsers, searches, views, checkouts, payStarts, payFails, bookings, sessions, daily, topViewed] = await Promise.all([
    distinctCount({ at, event: 'app_open', 'props.firstOpen': true }, 'deviceId'),
    distinctCount({ at }, 'deviceId'),
    distinctCount({ at, userId: { $ne: null } }, 'userId'),
    step('search'), step('vehicle_view'), step('checkout_start'), step('payment_started'), step('payment_failed'),
    Booking.aggregate([
      { $match: { createdAt: at, source: { $ne: 'offline' } } },
      { $group: { _id: null, created: { $sum: 1 }, paid: { $sum: { $cond: [{ $gt: ['$payment.paidPaise', 0] }, 1, 0] } }, revenuePaise: { $sum: '$payment.paidPaise' }, users: { $addToSet: '$userId' } } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { at, sessionId: { $ne: null } } },
      { $group: { _id: '$sessionId', n: { $sum: 1 }, deep: { $max: { $cond: [{ $in: ['$event', ['vehicle_view', 'checkout_start', 'payment_started']] }, 1, 0] } } } },
      { $group: { _id: null, sessions: { $sum: 1 }, bounced: { $sum: { $cond: [{ $or: [{ $lte: ['$n', 2] }, { $eq: ['$deep', 0] }] }, 1, 0] } } } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { at, event: { $in: ['app_open', 'vehicle_view', 'checkout_start', 'payment_success'] } } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'Asia/Kolkata' } }, e: '$event' }, n: { $sum: 1 }, installs: { $sum: { $cond: ['$props.firstOpen', 1, 0] } } } },
      { $sort: { '_id.d': 1 } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { at, event: 'vehicle_view', 'props.vehicleId': { $ne: null } } },
      { $group: { _id: '$props.vehicleId', views: { $sum: 1 }, viewers: { $addToSet: '$deviceId' } } },
      { $sort: { views: -1 } }, { $limit: 10 },
    ]),
  ]);
  const b = bookings[0] || { created: 0, paid: 0, revenuePaise: 0, users: [] };
  const s = sessions[0] || { sessions: 0, bounced: 0 };
  const vehicles = await Vehicle.find({ _id: { $in: topViewed.map((t) => t._id) } }).select('model variant registrationNumber').populate('brandId', 'name').lean();
  const booked = await Booking.aggregate([{ $match: { vehicleId: { $in: topViewed.map((t) => t._id) }, createdAt: at, 'payment.paidPaise': { $gt: 0 } } }, { $group: { _id: '$vehicleId', n: { $sum: 1 } } }]);
  const vMap = new Map(vehicles.map((v) => [String(v._id), v]));
  const bMap = new Map(booked.map((x) => [String(x._id), x.n]));
  const days = new Map();
  for (const r of daily) {
    const d = days.get(r._id.d) || { date: r._id.d, opens: 0, installs: 0, vehicleViews: 0, checkouts: 0, payments: 0 };
    if (r._id.e === 'app_open') Object.assign(d, { opens: r.n, installs: r.installs });
    if (r._id.e === 'vehicle_view') d.vehicleViews = r.n;
    if (r._id.e === 'checkout_start') d.checkouts = r.n;
    if (r._id.e === 'payment_success') d.payments = r.n;
    days.set(r._id.d, d);
  }
  const pct = (a, b2) => (b2 ? Math.round((a / b2) * 1000) / 10 : 0);
  ok(res, {
    range: { from, to },
    installs,
    activeDevices,
    activeUsers,
    bounceRatePct: pct(s.bounced, s.sessions),
    sessions: s.sessions,
    funnel: [
      { step: 'Searched cars', devices: searches.devices, users: searches.users },
      { step: 'Viewed a car', devices: views.devices, users: views.users },
      { step: 'Started checkout', devices: checkouts.devices, users: checkouts.users },
      { step: 'Started payment', devices: payStarts.devices, users: payStarts.users },
      { step: 'Booked (paid)', devices: null, users: b.paid },
    ],
    payments: { started: payStarts.users, failed: payFails.users, bookingsCreated: b.created, bookingsPaid: b.paid, revenuePaise: b.revenuePaise },
    conversionPct: pct(b.paid, views.users || views.devices),
    daily: [...days.values()],
    topViewed: topViewed.map((t) => {
      const v = vMap.get(String(t._id));
      return { vehicleId: t._id, title: v ? [v.brandId?.name, v.model, v.variant].filter(Boolean).join(' ') : 'Removed car', registrationNumber: v?.registrationNumber, views: t.views, viewers: t.viewers.length, bookings: bMap.get(String(t._id)) || 0 };
    }),
  });
});

const STAGES = { vehicle_view: 1, checkout_start: 2, payment_started: 3, payment_failed: 4 };
const STAGE_LABEL = { 1: 'Viewed a car', 2: 'Started checkout', 3: 'Started payment', 4: 'Payment failed' };

/** Signed-in renters who looked at cars / started checkout or payment but have not paid for a booking since. */
adminAnalyticsRouter.get('/drop-offs', validate({ query: range.extend({ minStage: z.coerce.number().int().min(1).max(4).default(1), limit: z.coerce.number().int().min(1).max(200).default(100) }) }), async (req, res) => {
  const { from, to } = window(req.valid.query);
  const rows = await AnalyticsEvent.aggregate([
    { $match: { at: { $gte: from, $lt: to }, userId: { $ne: null }, event: { $in: Object.keys(STAGES) } } },
    { $sort: { at: 1 } },
    { $group: { _id: '$userId', stage: { $max: { $switch: { branches: Object.entries(STAGES).map(([e, n]) => ({ case: { $eq: ['$event', e] }, then: n })), default: 0 } } }, lastAt: { $last: '$at' }, vehicleId: { $last: '$props.vehicleId' }, events: { $sum: 1 } } },
    { $match: { stage: { $gte: req.valid.query.minStage } } },
    { $sort: { stage: -1, lastAt: -1 } },
    { $limit: 500 },
  ]);
  const ids = rows.map((r) => r._id);
  const paid = await Booking.find({ userId: { $in: ids }, createdAt: { $gte: from }, 'payment.paidPaise': { $gt: 0 } }).select('userId createdAt').lean();
  const paidAfter = new Map();
  for (const p of paid) paidAfter.set(String(p.userId), Math.max(paidAfter.get(String(p.userId)) || 0, p.createdAt.getTime()));
  const open = rows.filter((r) => !(paidAfter.get(String(r._id)) >= r.lastAt.getTime() - 60 * 60_000)).slice(0, req.valid.query.limit);
  const [users, vehicles, followUps] = await Promise.all([
    User.find({ _id: { $in: open.map((r) => r._id) } }).select('name phone email').lean(),
    Vehicle.find({ _id: { $in: open.map((r) => r.vehicleId).filter(Boolean) } }).select('model variant').populate('brandId', 'name').lean(),
    AnalyticsFollowUp.aggregate([{ $match: { userId: { $in: open.map((r) => r._id) } } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$userId', last: { $first: '$$ROOT' } } }]),
  ]);
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  const vMap = new Map(vehicles.map((v) => [String(v._id), v]));
  const fMap = new Map(followUps.map((f) => [String(f._id), f.last]));
  ok(res, open.map((r) => {
    const u = uMap.get(String(r._id));
    const v = r.vehicleId && vMap.get(String(r.vehicleId));
    const f = fMap.get(String(r._id));
    return {
      userId: r._id, name: u?.name || null, phone: u?.phone || null, email: u?.email || null,
      stage: STAGE_LABEL[r.stage], stageLevel: r.stage, lastActivityAt: r.lastAt, events: r.events,
      vehicle: v ? { id: v._id, title: [v.brandId?.name, v.model, v.variant].filter(Boolean).join(' ') } : null,
      followUp: f ? { status: f.status, note: f.note, at: f.createdAt } : null,
    };
  }));
});

/** One renter's recent activity (for the caller's context). */
adminAnalyticsRouter.get('/users/:id/activity', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const [events, followUps] = await Promise.all([
    AnalyticsEvent.find({ userId: req.valid.params.id }).sort({ at: -1 }).limit(100).lean(),
    AnalyticsFollowUp.find({ userId: req.valid.params.id }).sort({ createdAt: -1 }).limit(20).populate('by', 'name').lean(),
  ]);
  ok(res, {
    events: events.map((e) => ({ event: e.event, at: e.at, props: e.props, platform: e.platform, appVersion: e.appVersion })),
    followUps: followUps.map((f) => ({ status: f.status, note: f.note, by: f.by?.name, at: f.createdAt })),
  });
});

adminAnalyticsRouter.post('/follow-ups', validate({ body: z.object({ userId: objectId, status: z.enum(['contacted', 'no_answer', 'converted', 'not_interested']), note: z.string().trim().max(500).optional() }).strict() }), async (req, res) => {
  const { userId, status, note } = req.valid.body;
  if (!(await User.exists({ _id: new mongoose.Types.ObjectId(userId) }))) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
  const f = await AnalyticsFollowUp.create({ userId, status, note, by: req.auth.id });
  await audit(req, 'analytics.follow_up', { type: 'user', id: userId }, { changes: { status }, reason: note });
  created(res, { id: f._id, status: f.status, note: f.note, at: f.createdAt });
});

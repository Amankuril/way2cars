import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ok, created } from '../../core/http.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { claimFiles, attachFiles, registerFileAccessRule } from '../files/files.service.js';
import { notify, notifyAdmins } from '../notifications/notification.service.js';
import { reverseGeocode, mapsConfigured } from '../../integrations/maps.js';
import { Booking } from '../bookings/booking.model.js';
import { getSettings } from '../settings/settings.service.js';
import { SupportTicket, TICKET_CATEGORIES, ROADSIDE_TYPES } from './support.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const newRef = () => `T${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

function serialize(t, { admin = false } = {}) {
  return {
    id: t._id, ref: t.ref, category: t.category, subject: t.subject, priority: t.priority, status: t.status, bookingId: t.bookingId,
    roadside: t.roadside?.type ? { type: t.roadside.type, address: t.roadside.address, stage: t.roadside.stage, location: t.roadside.location?.coordinates ? { lat: t.roadside.location.coordinates[1], lng: t.roadside.location.coordinates[0] } : null } : null,
    messages: (t.messages || []).filter((m) => admin || !m.internal).map((m) => ({ id: m._id, from: { realm: m.from.realm, name: m.from.realm === 'admin' ? (admin ? m.from.name : 'WAY2CARS Support') : m.from.name }, body: m.body, attachmentFileIds: m.attachmentFileIds, internal: admin ? m.internal : undefined, createdAt: m.createdAt })),
    unread: admin ? t.unreadFor?.admin : t.unreadFor?.requester,
    raisedBy: admin ? t.raisedBy : undefined,
    assignedTo: admin ? t.assignedTo : undefined,
    lastMessageAt: t.lastMessageAt, createdAt: t.createdAt, resolvedAt: t.resolvedAt,
  };
}

/** Ticket routes for a requester realm (user or vendor). Messages are polled by the apps. */
export function requesterSupportRouter(realm) {
  const r = Router();
  const mine = (req) => ({ 'raisedBy.realm': realm, 'raisedBy.id': req.auth.id });

  r.get('/contact', async (_req, res) => ok(res, (await getSettings()).support));

  r.get('/tickets', validate({ query: z.object(paginationQuery) }), async (req, res) => {
    const { items, meta } = await paginate(SupportTicket, mine(req), { ...req.valid.query, sort: { updatedAt: -1 }, select: '-messages' });
    ok(res, items.map((t) => serialize(t)), meta);
  });

  r.post('/tickets', validate({
    body: z.object({ category: z.enum(TICKET_CATEGORIES.filter((c) => c !== 'roadside')), subject: z.string().trim().min(5).max(150), message: z.string().trim().min(10).max(2000), bookingId: objectId.optional(), attachmentFileIds: z.array(objectId).max(5).default([]) }).strict(),
  }), async (req, res) => {
    const b = req.valid.body;
    if (b.bookingId) {
      const owns = await Booking.exists({ _id: b.bookingId, [realm === 'user' ? 'userId' : 'vendorId']: req.auth.id });
      if (!owns) throw notFound('Booking');
    }
    await claimFiles(req.auth, b.attachmentFileIds, ['ticket_attachment']);
    const name = req.auth.account.name || req.auth.account.businessName || 'Customer';
    const t = await SupportTicket.create({
      ref: newRef(), raisedBy: { realm, id: req.auth.id }, bookingId: b.bookingId, category: b.category, subject: b.subject,
      priority: ['damage_dispute', 'refund', 'payment'].includes(b.category) ? 'high' : 'normal',
      messages: [{ from: { realm, id: req.auth.id, name }, body: b.message, attachmentFileIds: b.attachmentFileIds }], lastMessageAt: new Date(),
    });
    await attachFiles(b.attachmentFileIds, { type: 'support_ticket', id: t._id });
    created(res, serialize(t));
  });

  r.get('/tickets/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
    const t = await SupportTicket.findOneAndUpdate({ _id: req.valid.params.id, ...mine(req) }, { $set: { 'unreadFor.requester': false } }, { new: true }).lean();
    if (!t) throw notFound('Ticket');
    ok(res, serialize(t));
  });

  r.post('/tickets/:id/messages', validate({ params: z.object({ id: objectId }), body: z.object({ body: z.string().trim().min(1).max(2000), attachmentFileIds: z.array(objectId).max(5).default([]) }).strict() }), async (req, res) => {
    const t = await SupportTicket.findOne({ _id: req.valid.params.id, ...mine(req) });
    if (!t) throw notFound('Ticket');
    if (t.status === 'closed') throw conflict('This ticket is closed. Please open a new one.', 'TICKET_CLOSED');
    await claimFiles(req.auth, req.valid.body.attachmentFileIds, ['ticket_attachment']);
    t.messages.push({ from: { realm, id: req.auth.id, name: req.auth.account.name }, body: req.valid.body.body, attachmentFileIds: req.valid.body.attachmentFileIds });
    t.lastMessageAt = new Date();
    t.unreadFor = { requester: false, admin: true };
    if (['awaiting_customer', 'resolved'].includes(t.status)) t.status = 'open';
    await t.save();
    await attachFiles(req.valid.body.attachmentFileIds, { type: 'support_ticket', id: t._id });
    created(res, serialize(t.toObject()));
  });

  if (realm === 'user') {
    /** Roadside assistance during an active trip — urgent ticket + admin alert + host notification. */
    r.post('/roadside', validate({ body: z.object({ bookingId: objectId, type: z.enum(ROADSIDE_TYPES), description: z.string().trim().min(5).max(1000), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() }).strict() }), async (req, res) => {
      const b = req.valid.body;
      const booking = await Booking.findOne({ _id: b.bookingId, userId: req.auth.id, status: { $in: ['ongoing', 'confirmed'] } }).lean();
      if (!booking) throw badRequest('Roadside assistance is available during an active trip.', undefined, 'NO_ACTIVE_TRIP');
      let address;
      if (b.lat !== undefined && mapsConfigured()) address = (await reverseGeocode({ lat: b.lat, lng: b.lng }).catch(() => null))?.address;
      const t = await SupportTicket.create({
        ref: newRef(), raisedBy: { realm: 'user', id: req.auth.id }, bookingId: booking._id, category: 'roadside', priority: 'urgent',
        subject: `Roadside: ${b.type.replace('_', ' ')} — ${booking.vehicleSnapshot.title}`,
        roadside: { type: b.type, stage: 'requested', address, ...(b.lat !== undefined ? { location: { type: 'Point', coordinates: [b.lng, b.lat] } } : {}) },
        messages: [{ from: { realm: 'user', id: req.auth.id, name: req.auth.account.name }, body: b.description }], lastMessageAt: new Date(),
      });
      await audit(req, 'roadside.requested', { type: 'support_ticket', id: t._id }, { changes: { bookingId: booking._id, type: b.type } });
      notifyAdmins('admin.roadside_request', { type: b.type.replace('_', ' '), ref: booking.ref, ticketId: t._id }, 'support.manage');
      const support = (await getSettings()).support;
      created(res, { ...serialize(t.toObject()), roadsidePhone: support.roadsidePhone || support.phone, emergencyPhone: support.emergencyPhone });
    });
  }
  return r;
}

export const adminSupportRouter = Router();
adminSupportRouter.use(requirePermission('support.manage'));

adminSupportRouter.get('/tickets', validate({ query: z.object({ ...paginationQuery, status: z.enum(['open', 'in_progress', 'awaiting_customer', 'resolved', 'closed']).optional(), category: z.enum(TICKET_CATEGORIES).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), mine: z.enum(['true']).optional() }) }), async (req, res) => {
  const { page, limit, status, category, priority, mine } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  else filter.status = { $nin: ['closed'] };
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (mine) filter.assignedTo = req.auth.id;
  const { items, meta } = await paginate(SupportTicket, filter, { page, limit, sort: { lastMessageAt: -1 }, select: '-messages' });
  ok(res, items.map((t) => serialize(t, { admin: true })), meta);
});

adminSupportRouter.get('/tickets/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const t = await SupportTicket.findByIdAndUpdate(req.valid.params.id, { $set: { 'unreadFor.admin': false } }, { new: true }).lean();
  if (!t) throw notFound('Ticket');
  ok(res, serialize(t, { admin: true }));
});

adminSupportRouter.post('/tickets/:id/messages', validate({ params: z.object({ id: objectId }), body: z.object({ body: z.string().trim().min(1).max(2000), internal: z.boolean().default(false), status: z.enum(['in_progress', 'awaiting_customer', 'resolved']).optional() }).strict() }), async (req, res) => {
  const t = await SupportTicket.findById(req.valid.params.id);
  if (!t) throw notFound('Ticket');
  const { body, internal, status } = req.valid.body;
  t.messages.push({ from: { realm: 'admin', id: req.auth.id, name: req.auth.account.name }, body, internal });
  if (!internal) {
    t.lastMessageAt = new Date();
    t.unreadFor.requester = true;
  }
  if (status) {
    t.status = status;
    if (status === 'resolved') t.resolvedAt = new Date();
  } else if (t.status === 'open') t.status = 'in_progress';
  t.assignedTo ||= req.auth.id;
  await t.save();
  if (!internal) await notify('support.reply', { realm: t.raisedBy.realm, id: t.raisedBy.id }, { ref: t.ref, ticketId: t._id });
  ok(res, serialize(t.toObject(), { admin: true }));
});

adminSupportRouter.patch('/tickets/:id', validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['open', 'in_progress', 'awaiting_customer', 'resolved', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), assignToMe: z.boolean().optional(), roadsideStage: z.enum(['requested', 'assigned', 'en_route', 'resolved']).optional() }).strict() }), async (req, res) => {
  const { status, priority, assignToMe, roadsideStage } = req.valid.body;
  const set = {};
  if (status) set.status = status;
  if (status === 'resolved') set.resolvedAt = new Date();
  if (priority) set.priority = priority;
  if (assignToMe) set.assignedTo = req.auth.id;
  if (roadsideStage) set['roadside.stage'] = roadsideStage;
  const t = await SupportTicket.findByIdAndUpdate(req.valid.params.id, { $set: set }, { new: true }).lean();
  if (!t) throw notFound('Ticket');
  await audit(req, 'support.ticket_updated', { type: 'support_ticket', id: t._id }, { changes: set });
  ok(res, serialize(t, { admin: true }));
});

registerFileAccessRule('ticket_attachment', async () => false);

import { Router } from 'express';
import { z } from 'zod';
import { ok, noContent } from '../../core/http.js';
import { paginate, paginationQuery } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { Notification, DeviceToken } from './notification.model.js';
import { webPushConfig } from '../../integrations/firebase.js';

/** Inbox + device-token routes, mounted under each realm (owner scoped). */
export function notificationRoutes() {
  const r = Router();
  const mine = (req) => ({ 'recipient.realm': req.auth.realm, 'recipient.id': req.auth.id });

  r.get('/', validate({ query: z.object({ ...paginationQuery, unread: z.enum(['true', 'false']).optional() }) }), async (req, res) => {
    const { page, limit, unread } = req.valid.query;
    const filter = mine(req);
    if (unread === 'true') filter.readAt = null;
    const [{ items, meta }, unreadCount] = await Promise.all([
      paginate(Notification, filter, { page, limit, select: 'event category title body link readAt createdAt' }),
      Notification.countDocuments({ ...mine(req), readAt: null }),
    ]);
    ok(res, items, { ...meta, unreadCount });
  });

  r.post('/read', validate({ body: z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(100).optional(), all: z.boolean().optional() }).strict() }), async (req, res) => {
    const filter = { ...mine(req), readAt: null };
    if (!req.valid.body.all) filter._id = { $in: req.valid.body.ids || [] };
    await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    noContent(res);
  });

  r.get('/push-config', (_req, res) => ok(res, webPushConfig()));

  r.post('/devices', validate({ body: z.object({ token: z.string().min(20).max(4096), platform: z.enum(['web', 'android', 'ios']).default('web') }).strict() }), async (req, res) => {
    const { token, platform } = req.valid.body;
    // A token belongs to whoever registered it last (shared devices).
    await DeviceToken.updateOne(
      { token },
      { $set: { owner: { realm: req.auth.realm, id: req.auth.id }, platform, userAgent: req.get('user-agent')?.slice(0, 300), lastSeenAt: new Date() } },
      { upsert: true },
    );
    noContent(res);
  });

  r.delete('/devices', validate({ body: z.object({ token: z.string().min(20).max(4096) }).strict() }), async (req, res) => {
    await DeviceToken.deleteOne({ token: req.valid.body.token, 'owner.realm': req.auth.realm, 'owner.id': req.auth.id });
    noContent(res);
  });
  return r;
}

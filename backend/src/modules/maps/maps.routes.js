import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { ok } from '../../core/http.js';
import { validate } from '../../middleware/validate.js';
import { autocomplete, placeDetails, reverseGeocode } from '../../integrations/maps.js';
import { env } from '../../config/env.js';

/** Authenticated proxy so the Google server key never ships in an app. Rate-limited per caller. */
export const mapsRouter = Router();
mapsRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => env.isTest, keyGenerator: (req) => `${req.auth?.realm}:${req.auth?.id}` }));

mapsRouter.get('/autocomplete', validate({ query: z.object({ q: z.string().trim().min(2).max(200), sessionToken: z.string().uuid().optional(), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }) }), async (req, res) => {
  const { q, sessionToken, lat, lng } = req.valid.query;
  ok(res, await autocomplete(q, { sessionToken, near: lat !== undefined && lng !== undefined ? { lat, lng } : undefined }));
});
mapsRouter.get('/place/:placeId', validate({ params: z.object({ placeId: z.string().regex(/^[\w-]{10,300}$/) }), query: z.object({ sessionToken: z.string().uuid().optional() }) }), async (req, res) => {
  ok(res, await placeDetails(req.valid.params.placeId, { sessionToken: req.valid.query.sessionToken }));
});
mapsRouter.get('/reverse', validate({ query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }) }), async (req, res) => {
  ok(res, await reverseGeocode(req.valid.query));
});

import { Router } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { badRequest, conflict, notFound, forbidden } from '../../core/errors.js';
import { withTransaction, isDuplicateKey } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { paginate, paginationQuery, escapeRegex } from '../../core/pagination.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { publicUrl } from '../../integrations/storage.js';
import { claimFiles, attachFiles } from '../files/files.service.js';
import { FileRecord } from '../files/file.model.js';
import { notifyLater } from '../notifications/notification.service.js';
import { getSettings } from '../settings/settings.service.js';
import { Vendor } from '../vendors/vendor.model.js';
import { Booking, BLOCKING_STATUSES } from '../bookings/booking.model.js';
import { Vehicle, VehicleBlock, VehiclePriceOverride, APPROVAL_STATUSES, OPERATIONAL_STATUSES } from './vehicle.model.js';
import {
  vehicleBaseSchema, validateRefs, toVehicleDoc, touchesSensitive, refreshListing, submissionGaps, getOwnedVehicle,
  vehicleCalendar, addBlock, serializeVehicle,
} from './vehicle.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const idParams = z.object({ id: objectId });
const POPULATE = [{ path: 'brandId', select: 'name logoUrl' }, { path: 'categoryId', select: 'name bodyType' }, { path: 'cityId', select: 'name' }];
const dup = (err) => {
  if (isDuplicateKey(err)) throw conflict('A car with this registration number is already listed.', 'REGISTRATION_EXISTS');
  throw err;
};

// =============================================================== vendor
export const vendorVehicleRouter = Router();

vendorVehicleRouter.get('/', validate({ query: z.object({ ...paginationQuery, approval: z.enum(APPROVAL_STATUSES).optional(), status: z.enum(OPERATIONAL_STATUSES).optional() }) }), async (req, res) => {
  const { page, limit, approval, status } = req.valid.query;
  const filter = { vendorId: req.auth.id };
  if (approval) filter['approval.status'] = approval;
  if (status) filter.status = status;
  const { items, meta } = await paginate(Vehicle, filter, { page, limit, populate: POPULATE });
  ok(res, items.map((v) => serializeVehicle(v, { audience: 'owner' })), meta);
});

vendorVehicleRouter.post('/', validate({ body: vehicleBaseSchema }), async (req, res) => {
  const vendor = await Vendor.findById(req.auth.id).select('status').lean();
  if (['suspended', 'deleted'].includes(vendor.status)) throw forbidden();
  await validateRefs(req.valid.body);
  const v = await Vehicle.create({ ...toVehicleDoc(req.valid.body), vendorId: req.auth.id }).catch(dup);
  await audit(req, 'vehicle.created', { type: 'vehicle', id: v._id });
  created(res, serializeVehicle(await Vehicle.findById(v._id).populate(POPULATE).lean(), { audience: 'owner' }));
});

vendorVehicleRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const v = await Vehicle.findOne({ _id: req.valid.params.id, vendorId: req.auth.id }).populate(POPULATE).lean();
  if (!v) throw notFound('Car');
  const { trip } = await getSettings();
  ok(res, { ...serializeVehicle(v, { audience: 'owner' }), submissionGaps: submissionGaps(v, trip.minPickupPhotos) });
});

vendorVehicleRouter.patch('/:id', validate({ params: idParams, body: vehicleBaseSchema.partial() }), async (req, res) => {
  const body = req.valid.body;
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  await validateRefs({ cityId: body.cityId ?? (body.location ? String(v.cityId) : undefined), brandId: body.brandId, categoryId: body.categoryId, location: body.location });
  const doc = toVehicleDoc(body);
  const resubmit = v.approval.status === 'approved' && touchesSensitive(body);
  Object.assign(v, doc);
  if (resubmit) v.approval = { status: 'pending_review', submittedAt: new Date() };
  await v.save().catch(dup);
  await refreshListing(v._id);
  await audit(req, 'vehicle.updated', { type: 'vehicle', id: v._id }, { changes: { fields: Object.keys(body), resubmitted: resubmit } });
  ok(res, { ...serializeVehicle(await Vehicle.findById(v._id).populate(POPULATE).lean(), { audience: 'owner' }), resubmittedForReview: resubmit });
});

vendorVehicleRouter.put('/:id/photos', validate({ params: idParams, body: z.object({ fileIds: z.array(objectId).min(1).max(15) }).strict() }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  const updated = await withTransaction(async (session) => {
    const files = await claimFiles(req.auth, req.valid.body.fileIds, ['vehicle_photo'], { session, allowAttachedTo: { type: 'vehicle', id: v._id } });
    await attachFiles(files.map((f) => f._id), { type: 'vehicle', id: v._id }, session);
    const keep = new Set(files.map((f) => String(f._id)));
    const removed = v.photos.filter((p) => !keep.has(String(p.fileId))).map((p) => p.fileId);
    if (removed.length) await FileRecord.updateMany({ _id: { $in: removed } }, { $set: { status: 'temp', linkedTo: null } }, { session }); // purged by the orphan job
    return Vehicle.findByIdAndUpdate(v._id, { $set: { photos: files.map((f) => ({ fileId: f._id, url: publicUrl(f.storageKey) })) } }, { new: true, session }).populate(POPULATE).lean();
  });
  ok(res, serializeVehicle(updated, { audience: 'owner' }));
});

const docSchema = z.object({ fileId: objectId, number: z.string().trim().max(40).optional(), expiry: z.coerce.date().optional() }).strict();
vendorVehicleRouter.put('/:id/documents', validate({
  params: idParams,
  body: z.object({
    rc: docSchema.optional(),
    insurance: docSchema.extend({ provider: z.string().trim().min(2).max(80), type: z.enum(['comprehensive', 'zero_dep', 'third_party']), expiry: z.coerce.date() }).strict().optional(),
    puc: docSchema.extend({ expiry: z.coerce.date() }).strict().optional(),
    fitness: docSchema.optional(),
  }).strict(),
}), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  const body = req.valid.body;
  for (const [k, d] of Object.entries(body)) if (d.expiry && d.expiry < new Date()) throw badRequest(`The ${k.toUpperCase()} document has already expired.`, undefined, 'DOCUMENT_EXPIRED');
  const updated = await withTransaction(async (session) => {
    const ids = Object.values(body).map((d) => d.fileId);
    await claimFiles(req.auth, ids, ['vehicle_document'], { session, allowAttachedTo: { type: 'vehicle', id: v._id } });
    await attachFiles(ids, { type: 'vehicle', id: v._id }, session);
    const set = Object.fromEntries(Object.entries(body).map(([k, d]) => [`documents.${k}`, d]));
    // New documents on a live car need a fresh review.
    if (v.approval.status === 'approved') Object.assign(set, { 'approval.status': 'pending_review', 'approval.submittedAt': new Date() });
    return Vehicle.findByIdAndUpdate(v._id, { $set: set }, { new: true, session }).populate(POPULATE).lean();
  });
  await refreshListing(v._id);
  await audit(req, 'vehicle.documents_updated', { type: 'vehicle', id: v._id }, { changes: { documents: Object.keys(body) } });
  ok(res, serializeVehicle(updated, { audience: 'owner' }));
});

vendorVehicleRouter.post('/:id/submit', validate({ params: idParams }), async (req, res) => {
  const [v, vendor, { trip }] = await Promise.all([getOwnedVehicle(req.auth.id, req.valid.params.id), Vendor.findById(req.auth.id).select('status').lean(), getSettings()]);
  if (!['pending_approval', 'approved'].includes(vendor.status)) throw forbidden('Finish and submit your host application before listing cars.', 'VENDOR_NOT_SUBMITTED');
  if (!['draft', 'rejected'].includes(v.approval.status)) throw conflict('This car is already submitted.', 'ALREADY_SUBMITTED');
  const gaps = submissionGaps(v, trip.minPickupPhotos);
  if (gaps.length) throw badRequest('Add the missing details before submitting.', { missing: gaps }, 'VEHICLE_INCOMPLETE');
  v.approval = { status: 'pending_review', submittedAt: new Date() };
  await v.save();
  await audit(req, 'vehicle.submitted', { type: 'vehicle', id: v._id });
  ok(res, serializeVehicle(await Vehicle.findById(v._id).populate(POPULATE).lean(), { audience: 'owner' }));
});

vendorVehicleRouter.patch('/:id/status', validate({ params: idParams, body: z.object({ status: z.enum(OPERATIONAL_STATUSES) }).strict() }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  const upcoming = req.valid.body.status !== 'active'
    ? await Booking.countDocuments({ vehicleId: v._id, status: { $in: ['pending_vendor_approval', 'confirmed', 'ongoing'] } })
    : 0;
  v.status = req.valid.body.status;
  await v.save();
  await refreshListing(v._id);
  await audit(req, 'vehicle.status_changed', { type: 'vehicle', id: v._id }, { changes: { status: v.status } });
  // Existing bookings are honoured; the warning lets the host decide whether to contact support.
  ok(res, { ...serializeVehicle(await Vehicle.findById(v._id).populate(POPULATE).lean(), { audience: 'owner' }), upcomingBookings: upcoming });
});

vendorVehicleRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  if (!['draft', 'rejected'].includes(v.approval.status) || (await Booking.exists({ vehicleId: v._id }))) {
    throw conflict('Only cars that were never booked can be deleted. Set it offline instead.', 'VEHICLE_IN_USE');
  }
  await FileRecord.updateMany({ 'linkedTo.type': 'vehicle', 'linkedTo.id': v._id }, { $set: { status: 'temp', linkedTo: null } });
  await v.deleteOne();
  await audit(req, 'vehicle.deleted', { type: 'vehicle', id: v._id });
  noContent(res);
});

// ---- availability & pricing calendar
const range = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((r) => r.to > r.from && r.to - r.from <= 186 * 86400_000, 'Choose a range up to 6 months');
vendorVehicleRouter.get('/:id/calendar', validate({ params: idParams, query: range }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  ok(res, await vehicleCalendar(v._id, req.valid.query.from, req.valid.query.to));
});

vendorVehicleRouter.post('/:id/blocks', validate({ params: idParams, body: z.object({ startAt: z.coerce.date(), endAt: z.coerce.date(), reason: z.enum(['personal', 'maintenance', 'other']).default('personal'), note: z.string().trim().max(200).optional() }).strict() }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  // Serialise against concurrent bookings by taking the vehicle lock in a transaction.
  const block = await withTransaction(async (session) => {
    await Vehicle.updateOne({ _id: v._id }, { $inc: { lockVersion: 1 } }, { session });
    return addBlock(v, req.valid.body, session);
  });
  await audit(req, 'vehicle.block_added', { type: 'vehicle', id: v._id }, { changes: req.valid.body });
  created(res, { id: block._id, startAt: block.startAt, endAt: block.endAt, reason: block.reason, note: block.note });
});

vendorVehicleRouter.delete('/:id/blocks/:blockId', validate({ params: z.object({ id: objectId, blockId: objectId }) }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  const r = await VehicleBlock.deleteOne({ _id: req.valid.params.blockId, vehicleId: v._id });
  if (!r.deletedCount) throw notFound('Blocked period');
  noContent(res);
});

vendorVehicleRouter.put('/:id/pricing-calendar', validate({
  params: idParams,
  body: z.object({ entries: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dailyPaise: z.number().int().min(10000).max(10_000_000), hourlyPaise: z.number().int().min(1000).max(1_000_000).optional() }).strict()).min(1).max(120) }).strict(),
}), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  if (req.valid.body.entries.some((e) => e.date < today)) throw badRequest('Past dates cannot be priced.');
  await VehiclePriceOverride.bulkWrite(req.valid.body.entries.map((e) => ({
    updateOne: { filter: { vehicleId: v._id, date: e.date }, update: { $set: { dailyPaise: e.dailyPaise, hourlyPaise: e.hourlyPaise } }, upsert: true },
  })));
  await audit(req, 'vehicle.pricing_calendar_updated', { type: 'vehicle', id: v._id }, { changes: { dates: req.valid.body.entries.map((e) => e.date) } });
  noContent(res);
});

vendorVehicleRouter.delete('/:id/pricing-calendar/:date', validate({ params: z.object({ id: objectId, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) }), async (req, res) => {
  const v = await getOwnedVehicle(req.auth.id, req.valid.params.id);
  await VehiclePriceOverride.deleteOne({ vehicleId: v._id, date: req.valid.params.date });
  noContent(res);
});

// =============================================================== admin
export const adminVehicleRouter = Router();

adminVehicleRouter.get('/', requirePermission('vehicles.read'), validate({
  query: z.object({ ...paginationQuery, approval: z.enum(APPROVAL_STATUSES).optional(), status: z.enum(OPERATIONAL_STATUSES).optional(), cityId: objectId.optional(), vendorId: objectId.optional(), q: z.string().trim().max(40).optional(), featured: z.enum(['true', 'false']).optional() }),
}), async (req, res) => {
  const { page, limit, approval, status, cityId, vendorId, q, featured } = req.valid.query;
  const filter = {};
  if (approval) filter['approval.status'] = approval;
  if (status) filter.status = status;
  if (cityId) filter.cityId = cityId;
  if (vendorId) filter.vendorId = vendorId;
  if (featured) filter.isFeatured = featured === 'true';
  if (q) filter.$or = [{ registrationNumber: new RegExp(escapeRegex(q.replace(/\s/g, '').toUpperCase())) }, { model: new RegExp(escapeRegex(q), 'i') }];
  const sort = approval === 'pending_review' ? { 'approval.submittedAt': 1 } : { createdAt: -1 };
  const { items, meta } = await paginate(Vehicle, filter, { page, limit, sort, populate: [...POPULATE, { path: 'vendorId', select: 'name businessName phone status' }] });
  ok(res, items.map((v) => ({ ...serializeVehicle(v, { audience: 'admin' }), vendor: v.vendorId?.name !== undefined ? { id: v.vendorId._id, name: v.vendorId.businessName || v.vendorId.name, phone: v.vendorId.phone, status: v.vendorId.status } : null })), meta);
});

adminVehicleRouter.get('/:id', requirePermission('vehicles.read'), validate({ params: idParams }), async (req, res) => {
  const v = await Vehicle.findById(req.valid.params.id).populate([...POPULATE, { path: 'vendorId', select: 'name businessName phone status rating' }]).lean();
  if (!v) throw notFound('Car');
  const [upcoming, { trip }] = await Promise.all([
    Booking.find({ vehicleId: v._id, status: { $in: BLOCKING_STATUSES } }).select('ref status startAt endAt').sort({ startAt: 1 }).limit(20).lean(),
    getSettings(),
  ]);
  ok(res, { ...serializeVehicle(v, { audience: 'admin' }), vendor: v.vendorId, submissionGaps: submissionGaps(v, trip.minPickupPhotos), upcomingBookings: upcoming });
});

adminVehicleRouter.post('/:id/review', requirePermission('vehicles.review'), validate({
  params: idParams,
  body: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional(), isLuxury: z.boolean().optional() }).strict(),
}), async (req, res) => {
  const { decision, reason, isLuxury } = req.valid.body;
  const v = await Vehicle.findById(req.valid.params.id).populate('brandId', 'name');
  if (!v) throw notFound('Car');
  if (v.approval.status !== 'pending_review') throw conflict('This car is not awaiting review.', 'NOT_PENDING');
  if (decision === 'reject' && !reason) throw badRequest('Tell the host what to fix.', undefined, 'REASON_REQUIRED');
  if (decision === 'approve') {
    const { trip } = await getSettings();
    const gaps = submissionGaps(v, trip.minPickupPhotos);
    if (gaps.length) throw badRequest('This listing is incomplete.', { missing: gaps }, 'VEHICLE_INCOMPLETE');
  }
  v.approval = { ...v.approval.toObject(), status: decision === 'approve' ? 'approved' : 'rejected', reviewedAt: new Date(), reviewedBy: req.auth.id, reason: decision === 'reject' ? reason : undefined };
  if (isLuxury !== undefined) v.isLuxury = isLuxury;
  await v.save();
  await refreshListing(v._id);
  await audit(req, `vehicle.${v.approval.status}`, { type: 'vehicle', id: v._id }, { reason });
  const title = `${v.brandId?.name || ''} ${v.model}`.trim();
  notifyLater(decision === 'approve' ? 'vendor.vehicle_approved' : 'vendor.vehicle_rejected', { realm: 'vendor', id: v.vendorId }, { vehicle: title, vehicleId: v._id, reason });
  ok(res, serializeVehicle(await Vehicle.findById(v._id).populate(POPULATE).lean(), { audience: 'admin' }));
});

adminVehicleRouter.patch('/:id/flags', requirePermission('vehicles.manage'), validate({
  params: idParams,
  body: z.object({ isLuxury: z.boolean().optional(), isFeatured: z.boolean().optional(), featuredRank: z.number().int().min(0).max(1000).optional(), adminSuspended: z.boolean().optional(), reason: z.string().trim().max(300).optional() }).strict(),
}), async (req, res) => {
  const { reason, ...flags } = req.valid.body;
  const v = await Vehicle.findByIdAndUpdate(req.valid.params.id, { $set: flags }, { new: true });
  if (!v) throw notFound('Car');
  await refreshListing(v._id);
  await audit(req, 'vehicle.flags_updated', { type: 'vehicle', id: v._id }, { changes: flags, reason });
  ok(res, serializeVehicle(await Vehicle.findById(v._id).populate(POPULATE).lean(), { audience: 'admin' }));
});

adminVehicleRouter.get('/:id/calendar', requirePermission('vehicles.read'), validate({ params: idParams, query: range }), async (req, res) => {
  if (!(await Vehicle.exists({ _id: req.valid.params.id }))) throw notFound('Car');
  ok(res, await vehicleCalendar(req.valid.params.id, req.valid.query.from, req.valid.query.to));
});

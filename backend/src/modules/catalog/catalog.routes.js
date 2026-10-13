import { Router } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { notFound, conflict } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { City, Brand, Category, BODY_TYPES } from './catalog.model.js';
import { FileRecord } from '../files/file.model.js';
import { publicUrl } from '../../integrations/storage.js';
import { fromGeoPoint } from '../../integrations/maps.js';
import { Vehicle } from '../vehicles/vehicle.model.js';

const id = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
const slugSchema = z.string().regex(/^[a-z0-9-]{2,60}$/, 'Use lowercase letters, numbers and dashes');
const fileId = z.string().regex(/^[a-f0-9]{24}$/).nullable().optional();

const citySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  state: z.string().trim().max(80).optional(),
  gstStateCode: z.string().regex(/^\d{2}$/).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().min(1).max(300).default(40),
  geofencePolygon: z.array(z.tuple([z.number(), z.number()])).min(3).max(500).optional(),
  imageFileId: fileId,
  isActive: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
}).strict();
const brandSchema = z.object({ name: z.string().trim().min(1).max(60), slug: slugSchema, logoFileId: fileId, isActive: z.boolean().default(true), sortOrder: z.number().int().min(0).max(10000).default(0) }).strict();
const categorySchema = z.object({
  name: z.string().trim().min(2).max(60), slug: slugSchema, bodyType: z.enum(BODY_TYPES), description: z.string().max(300).optional(),
  imageFileId: fileId, isActive: z.boolean().default(true), isPopular: z.boolean().default(false), sortOrder: z.number().int().min(0).max(10000).default(0),
}).strict();

async function resolveImage(fileIdValue, purpose) {
  if (!fileIdValue) return { fileId: null, url: null };
  const f = await FileRecord.findOne({ _id: fileIdValue, purpose, visibility: 'public', status: { $ne: 'deleted' } }).lean();
  if (!f) throw notFound('Image');
  await FileRecord.updateOne({ _id: f._id }, { $set: { status: 'attached' } });
  return { fileId: f._id, url: publicUrl(f.storageKey) };
}

export const serializeCity = (c) => ({
  id: c._id, name: c.name, slug: c.slug, state: c.state, center: fromGeoPoint(c.center), serviceRadiusKm: c.serviceRadiusKm,
  hasPolygon: Boolean(c.geofencePolygon?.length), imageUrl: c.imageUrl || null, isActive: c.isActive, isPopular: c.isPopular, sortOrder: c.sortOrder,
});
const serializeBrand = (b) => ({ id: b._id, name: b.name, slug: b.slug, logoUrl: b.logoUrl || null, isActive: b.isActive, sortOrder: b.sortOrder });
const serializeCategory = (c) => ({ id: c._id, name: c.name, slug: c.slug, bodyType: c.bodyType, description: c.description, imageUrl: c.imageUrl || null, isActive: c.isActive, isPopular: c.isPopular, sortOrder: c.sortOrder });

/** Public catalogue (active items only). */
export const publicCatalogRouter = Router();
publicCatalogRouter.get('/cities', async (_req, res) => ok(res, (await City.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean()).map(serializeCity)));
publicCatalogRouter.get('/brands', async (_req, res) => ok(res, (await Brand.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean()).map(serializeBrand)));
publicCatalogRouter.get('/categories', async (_req, res) => ok(res, (await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean()).map(serializeCategory)));

/** Admin CRUD. Deleting is blocked when vehicles reference the item — deactivate instead. */
export const adminCatalogRouter = Router();
adminCatalogRouter.use(requirePermission('catalog.manage'));

function crud(path, Model, schema, serialize, { imageField, imagePurpose, toDoc, refField }) {
  adminCatalogRouter.get(`/${path}`, async (_req, res) => ok(res, (await Model.find().sort({ sortOrder: 1, name: 1 }).lean()).map(serialize)));

  const build = async (body) => {
    const doc = toDoc ? toDoc(body) : { ...body };
    if (imageField in body) {
      const img = await resolveImage(body[imageField], imagePurpose);
      doc[imageField] = img.fileId;
      doc[imageField.replace('FileId', 'Url')] = img.url;
    }
    return doc;
  };

  adminCatalogRouter.post(`/${path}`, validate({ body: schema }), async (req, res) => {
    const doc = await Model.create(await build(req.valid.body));
    await audit(req, `catalog.${path}.created`, { type: path, id: doc._id }, { changes: req.valid.body });
    created(res, serialize(doc.toObject()));
  });

  adminCatalogRouter.patch(`/${path}/:id`, validate({ params: id, body: schema.partial() }), async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.valid.params.id, { $set: await build(req.valid.body) }, { new: true, runValidators: true }).lean();
    if (!doc) throw notFound();
    await audit(req, `catalog.${path}.updated`, { type: path, id: doc._id }, { changes: req.valid.body });
    ok(res, serialize(doc));
  });

  adminCatalogRouter.delete(`/${path}/:id`, validate({ params: id }), async (req, res) => {
    const inUse = await Vehicle.exists({ [refField]: req.valid.params.id });
    if (inUse) throw conflict('Vehicles use this item. Deactivate it instead of deleting.', 'IN_USE');
    const doc = await Model.findByIdAndDelete(req.valid.params.id).lean();
    if (!doc) throw notFound();
    await audit(req, `catalog.${path}.deleted`, { type: path, id: doc._id });
    noContent(res);
  });
}

crud('cities', City, citySchema, serializeCity, {
  imageField: 'imageFileId', imagePurpose: 'city_image', refField: 'cityId',
  toDoc: ({ lat, lng, ...rest }) => (lat !== undefined && lng !== undefined ? { ...rest, center: { type: 'Point', coordinates: [lng, lat] } } : rest),
});
crud('brands', Brand, brandSchema, serializeBrand, { imageField: 'logoFileId', imagePurpose: 'brand_logo', refField: 'brandId' });
crud('categories', Category, categorySchema, serializeCategory, { imageField: 'imageFileId', imagePurpose: 'category_image', refField: 'categoryId' });

import { Router } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../../core/http.js';
import { notFound } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { sha256 } from '../../core/crypto.js';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { CmsPage, Faq, Banner, CMS_PAGES } from './cms.model.js';
import { FileRecord } from '../files/file.model.js';
import { publicUrl } from '../../integrations/storage.js';

const id = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
const blocks = z.array(z.object({ type: z.enum(['heading', 'paragraph', 'list']), text: z.string().max(5000).optional(), items: z.array(z.string().max(1000)).max(50).optional() }).strict()).max(200);
const serializePage = (p) => ({ slug: p.slug, title: p.title, blocks: p.blocks, version: p.version, updatedAt: p.updatedAt, contentHash: sha256(JSON.stringify(p.blocks)) });
const serializeBanner = (b) => ({ id: b._id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, link: b.link, couponCode: b.couponCode, cityIds: b.cityIds, startsAt: b.startsAt, endsAt: b.endsAt, sortOrder: b.sortOrder, isActive: b.isActive });

export async function getPublishedPage(slug) {
  return CmsPage.findOne({ slug, isPublished: true }).lean();
}

// ---------------------------------------------------------------- public
export const publicCmsRouter = Router();
publicCmsRouter.get('/pages/:slug', validate({ params: z.object({ slug: z.enum(CMS_PAGES) }) }), async (req, res) => {
  const p = await getPublishedPage(req.valid.params.slug);
  if (!p) throw notFound('Page');
  ok(res, serializePage(p));
});
publicCmsRouter.get('/faqs', validate({ query: z.object({ audience: z.enum(['user', 'vendor']).default('user') }) }), async (req, res) => {
  const faqs = await Faq.find({ isPublished: true, audience: { $in: [req.valid.query.audience, 'all'] } }).sort({ category: 1, sortOrder: 1 }).lean();
  ok(res, faqs.map((f) => ({ id: f._id, category: f.category, question: f.question, answer: f.answer })));
});
publicCmsRouter.get('/banners', validate({ query: z.object({ cityId: z.string().regex(/^[a-f0-9]{24}$/).optional() }) }), async (req, res) => {
  const now = new Date();
  const filter = {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  if (req.valid.query.cityId) filter.$and.push({ $or: [{ cityIds: { $size: 0 } }, { cityIds: req.valid.query.cityId }] });
  ok(res, (await Banner.find(filter).sort({ sortOrder: 1 }).limit(10).lean()).map(serializeBanner));
});

// ---------------------------------------------------------------- admin
export const adminCmsRouter = Router();

adminCmsRouter.get('/pages', requirePermission('cms.manage'), async (_req, res) => {
  const pages = await CmsPage.find().lean();
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  ok(res, CMS_PAGES.map((slug) => (bySlug.get(slug) ? { ...serializePage(bySlug.get(slug)), isPublished: bySlug.get(slug).isPublished } : { slug, title: null, blocks: [], version: 0, isPublished: false })));
});
adminCmsRouter.get('/pages/:slug', requirePermission('cms.manage'), validate({ params: z.object({ slug: z.enum(CMS_PAGES) }) }), async (req, res) => {
  const page = await CmsPage.findOne({ slug: req.valid.params.slug }).lean();
  ok(res, page ? { ...serializePage(page), isPublished: page.isPublished } : { slug: req.valid.params.slug, title: null, blocks: [], version: 0, isPublished: false });
});
adminCmsRouter.put('/pages/:slug', requirePermission('cms.manage'),
  validate({ params: z.object({ slug: z.enum(CMS_PAGES) }), body: z.object({ title: z.string().trim().min(2).max(150), blocks, isPublished: z.boolean().default(true) }).strict() }),
  async (req, res) => {
    const page = await CmsPage.findOneAndUpdate(
      { slug: req.valid.params.slug },
      { $set: { ...req.valid.body, updatedBy: req.auth.id }, $inc: { version: 1 } },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    await audit(req, 'cms.page.updated', { type: 'cms_page', id: page._id }, { changes: { slug: page.slug, version: page.version } });
    ok(res, serializePage(page));
  });

const faqSchema = z.object({ audience: z.enum(['user', 'vendor', 'all']).default('all'), category: z.string().trim().max(60).default('General'), question: z.string().trim().min(5).max(300), answer: z.string().trim().min(2).max(3000), sortOrder: z.number().int().min(0).max(10000).default(0), isPublished: z.boolean().default(true) }).strict();
adminCmsRouter.get('/faqs', requirePermission('cms.manage'), async (_req, res) => ok(res, await Faq.find().sort({ audience: 1, category: 1, sortOrder: 1 }).lean()));
adminCmsRouter.post('/faqs', requirePermission('cms.manage'), validate({ body: faqSchema }), async (req, res) => {
  const faq = await Faq.create(req.valid.body);
  await audit(req, 'cms.faq.created', { type: 'faq', id: faq._id });
  created(res, faq);
});
adminCmsRouter.patch('/faqs/:id', requirePermission('cms.manage'), validate({ params: id, body: faqSchema.partial() }), async (req, res) => {
  const faq = await Faq.findByIdAndUpdate(req.valid.params.id, { $set: req.valid.body }, { new: true, runValidators: true }).lean();
  if (!faq) throw notFound('FAQ');
  await audit(req, 'cms.faq.updated', { type: 'faq', id: faq._id });
  ok(res, faq);
});
adminCmsRouter.delete('/faqs/:id', requirePermission('cms.manage'), validate({ params: id }), async (req, res) => {
  if (!(await Faq.findByIdAndDelete(req.valid.params.id))) throw notFound('FAQ');
  await audit(req, 'cms.faq.deleted', { type: 'faq', id: req.valid.params.id });
  noContent(res);
});

const bannerSchema = z.object({
  title: z.string().trim().min(2).max(80), subtitle: z.string().trim().max(160).optional(),
  imageFileId: z.string().regex(/^[a-f0-9]{24}$/), link: z.string().regex(/^\/[\w\-/?=&.%]*$/, 'Use an in-app path like /search').max(200).optional(),
  couponCode: z.string().trim().toUpperCase().max(30).optional(), cityIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(50).default([]),
  startsAt: z.coerce.date().nullable().optional(), endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().default(true),
}).strict();
async function bannerDoc(body) {
  if (!body.imageFileId) return body;
  const f = await FileRecord.findOne({ _id: body.imageFileId, purpose: 'banner', status: { $ne: 'deleted' } }).lean();
  if (!f) throw notFound('Banner image');
  await FileRecord.updateOne({ _id: f._id }, { $set: { status: 'attached' } });
  return { ...body, imageUrl: publicUrl(f.storageKey) };
}
adminCmsRouter.get('/banners', requirePermission('banners.manage'), async (_req, res) => ok(res, (await Banner.find().sort({ sortOrder: 1 }).lean()).map(serializeBanner)));
adminCmsRouter.post('/banners', requirePermission('banners.manage'), validate({ body: bannerSchema }), async (req, res) => {
  const b = await Banner.create(await bannerDoc(req.valid.body));
  await audit(req, 'cms.banner.created', { type: 'banner', id: b._id });
  created(res, serializeBanner(b));
});
adminCmsRouter.patch('/banners/:id', requirePermission('banners.manage'), validate({ params: id, body: bannerSchema.partial() }), async (req, res) => {
  const b = await Banner.findByIdAndUpdate(req.valid.params.id, { $set: await bannerDoc(req.valid.body) }, { new: true, runValidators: true }).lean();
  if (!b) throw notFound('Banner');
  await audit(req, 'cms.banner.updated', { type: 'banner', id: b._id });
  ok(res, serializeBanner(b));
});
adminCmsRouter.delete('/banners/:id', requirePermission('banners.manage'), validate({ params: id }), async (req, res) => {
  if (!(await Banner.findByIdAndDelete(req.valid.params.id))) throw notFound('Banner');
  await audit(req, 'cms.banner.deleted', { type: 'banner', id: req.valid.params.id });
  noContent(res);
});

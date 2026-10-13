import mongoose from 'mongoose';

export const CMS_PAGES = ['privacy-policy', 'terms-and-conditions', 'about-us', 'contact-us', 'cancellation-policy', 'rental-agreement', 'host-terms'];

const page = new mongoose.Schema(
  {
    slug: { type: String, enum: CMS_PAGES, required: true },
    title: { type: String, required: true, maxlength: 150 },
    // Plain structured blocks (no raw HTML) — rendered safely by the clients.
    blocks: [{ _id: false, type: { type: String, enum: ['heading', 'paragraph', 'list'], required: true }, text: String, items: [String] }],
    version: { type: Number, default: 1 },
    isPublished: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, versionKey: false },
);
page.index({ slug: 1 }, { unique: true });
export const CmsPage = mongoose.model('CmsPage', page, 'admin_cms_pages');

const faq = new mongoose.Schema(
  {
    audience: { type: String, enum: ['user', 'vendor', 'all'], default: 'all' },
    category: { type: String, maxlength: 60, default: 'General' },
    question: { type: String, required: true, maxlength: 300 },
    answer: { type: String, required: true, maxlength: 3000 },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);
faq.index({ audience: 1, isPublished: 1, sortOrder: 1 });
export const Faq = mongoose.model('Faq', faq, 'admin_faqs');

const banner = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 80 },
    subtitle: { type: String, maxlength: 160 },
    imageFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    imageUrl: { type: String, required: true },
    link: { type: String, maxlength: 200 }, // in-app path only, e.g. /search?category=suv
    couponCode: { type: String, maxlength: 30 },
    cityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'City' }], // empty = all cities
    startsAt: Date,
    endsAt: Date,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);
banner.index({ isActive: 1, sortOrder: 1 });
export const Banner = mongoose.model('Banner', banner, 'admin_banners');

import mongoose from 'mongoose';
import { geoPoint } from '../../core/schemas.js';

const slug = { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,60}$/ };

const city = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug,
    state: { type: String, trim: true, maxlength: 80 },
    gstStateCode: { type: String, match: /^\d{2}$/ }, // place of supply for invoices
    center: { type: geoPoint, required: true },
    // Service area used for geofencing and doorstep delivery eligibility.
    serviceRadiusKm: { type: Number, default: 40, min: 1, max: 300 },
    geofencePolygon: { type: [[Number]], default: undefined }, // optional [[lng,lat],...]
    imageFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    imageUrl: String,
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
city.index({ slug: 1 }, { unique: true });
city.index({ center: '2dsphere' });
export const City = mongoose.model('City', city, 'admin_cities');

const brand = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug,
    logoFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    logoUrl: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
brand.index({ slug: 1 }, { unique: true });
export const Brand = mongoose.model('Brand', brand, 'admin_vehicle_brands');

export const BODY_TYPES = ['hatchback', 'sedan', 'suv', 'muv', 'compact_suv', 'coupe', 'convertible', 'pickup', 'van'];
const category = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug,
    bodyType: { type: String, enum: BODY_TYPES, required: true },
    description: { type: String, maxlength: 300 },
    imageFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    imageUrl: String,
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
category.index({ slug: 1 }, { unique: true });
export const Category = mongoose.model('Category', category, 'admin_vehicle_categories');

/** Catalogue models per brand, each with its variants (hosts and admins pick from these). */
const variant = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    fuelType: { type: String, enum: ['petrol', 'diesel', 'cng', 'electric', 'hybrid'] },
    transmission: { type: String, enum: ['manual', 'automatic'] },
    seats: { type: Number, min: 2, max: 12 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);
const vehicleModel = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // suggested car type
    variants: { type: [variant], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
vehicleModel.index({ brandId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
export const VehicleModel = mongoose.model('VehicleModel', vehicleModel, 'admin_vehicle_models');

/** Way2Cars pickup / drop-off points (hubs) inside a city. Renters of fleet cars can choose them. */
export const LOCATION_KINDS = ['pickup', 'dropoff'];
const location = new mongoose.Schema(
  {
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    point: { type: geoPoint, required: true },
    kinds: { type: [String], enum: LOCATION_KINDS, default: () => [...LOCATION_KINDS] },
    instructions: { type: String, maxlength: 300 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
location.index({ cityId: 1, isActive: 1, sortOrder: 1 });
export const ServiceLocation = mongoose.model('ServiceLocation', location, 'admin_locations');

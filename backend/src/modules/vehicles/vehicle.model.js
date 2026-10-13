import mongoose from 'mongoose';
import { geoPoint } from '../../core/schemas.js';

const oid = mongoose.Schema.Types.ObjectId;

export const FUEL_TYPES = ['petrol', 'diesel', 'cng', 'electric', 'hybrid'];
export const TRANSMISSIONS = ['manual', 'automatic'];
export const VEHICLE_FEATURES = [
  'ac', 'bluetooth', 'gps_navigation', 'reverse_camera', 'parking_sensors', 'sunroof', 'cruise_control',
  'usb_charger', 'airbags', 'abs', 'keyless_entry', 'push_start', 'android_auto', 'apple_carplay',
  'child_seat', 'music_system', 'power_windows', 'fastag', 'roof_carrier', 'spare_tyre', 'first_aid_kit',
];
export const APPROVAL_STATUSES = ['draft', 'pending_review', 'approved', 'rejected'];
export const OPERATIONAL_STATUSES = ['active', 'offline', 'maintenance'];

const doc = { fileId: { type: oid, ref: 'File' }, expiry: Date, number: String };

const schema = new mongoose.Schema(
  {
    vendorId: { type: oid, ref: 'Vendor', required: true },
    cityId: { type: oid, ref: 'City', required: true },
    brandId: { type: oid, ref: 'Brand', required: true },
    categoryId: { type: oid, ref: 'Category', required: true },
    model: { type: String, required: true, trim: true, maxlength: 60 },
    variant: { type: String, trim: true, maxlength: 60 },
    year: { type: Number, required: true, min: 2005, max: 2100 },
    registrationNumber: { type: String, required: true, uppercase: true, trim: true },
    color: { type: String, trim: true, maxlength: 30 },
    fuelType: { type: String, enum: FUEL_TYPES, required: true },
    transmission: { type: String, enum: TRANSMISSIONS, required: true },
    seats: { type: Number, required: true, min: 2, max: 12 },
    luggageBags: { type: Number, default: 2, min: 0, max: 10 },
    rangeKm: Number, // EVs: claimed range per charge
    features: { type: [String], enum: VEHICLE_FEATURES, default: [] },
    description: { type: String, maxlength: 1500 },
    photos: { type: [{ _id: false, fileId: { type: oid, ref: 'File' }, url: String }], default: [] },
    documents: {
      rc: doc,
      insurance: { ...doc, provider: String, type: { type: String, enum: ['comprehensive', 'zero_dep', 'third_party'] } },
      puc: doc,
      fitness: doc,
    },
    location: {
      address: { type: String, maxlength: 300 },
      area: { type: String, maxlength: 100 },
      pincode: String,
      placeId: String,
      point: { type: geoPoint, required: true },
    },
    pricing: {
      hourlyPaise: { type: Number, required: true, min: 100 },
      dailyPaise: { type: Number, required: true, min: 100 },
      weekendDailyPaise: { type: Number, min: 100 },
      securityDepositPaise: { type: Number, required: true, min: 0 },
      includedKmPerDay: { type: Number, required: true, min: 0, max: 2000 },
      extraKmChargePaise: { type: Number, required: true, min: 0 },
    },
    delivery: { enabled: { type: Boolean, default: false }, maxKm: { type: Number, default: 10, min: 0, max: 100 } },
    instantBooking: { type: Boolean, default: false },
    // Admin-controlled flags.
    isLuxury: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    featuredRank: { type: Number, default: 0 },
    adminSuspended: { type: Boolean, default: false },
    approval: {
      status: { type: String, enum: APPROVAL_STATUSES, default: 'draft' },
      submittedAt: Date,
      reviewedAt: Date,
      reviewedBy: { type: oid, ref: 'AdminUser' },
      reason: String,
    },
    status: { type: String, enum: OPERATIONAL_STATUSES, default: 'active' },
    // Denormalised for fast search: true only when everything allows bookings.
    isListed: { type: Boolean, default: false },
    rating: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    stats: { trips: { type: Number, default: 0 }, earningsPaise: { type: Number, default: 0 } },
    lastOdometerKm: Number,
    lockVersion: { type: Number, default: 0 }, // bumped inside booking transactions (write-conflict lock)
  },
  { timestamps: true, versionKey: false },
);
schema.index({ registrationNumber: 1 }, { unique: true });
schema.index({ vendorId: 1, createdAt: -1 });
schema.index({ 'location.point': '2dsphere' });
schema.index({ isListed: 1, cityId: 1, 'pricing.dailyPaise': 1 });
schema.index({ isListed: 1, isFeatured: 1, featuredRank: -1 });
schema.index({ 'approval.status': 1, 'approval.submittedAt': 1 });

/** Recomputes the listing flag from approval, operational status and vendor approval. */
export function computeListed(v, vendorStatus) {
  return v.approval?.status === 'approved' && v.status === 'active' && !v.adminSuspended && vendorStatus === 'approved';
}

export const Vehicle = mongoose.model('Vehicle', schema, 'vehicles');

const block = new mongoose.Schema(
  {
    vehicleId: { type: oid, ref: 'Vehicle', required: true },
    vendorId: { type: oid, ref: 'Vendor', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    reason: { type: String, enum: ['personal', 'maintenance', 'other'], default: 'personal' },
    note: { type: String, maxlength: 200 },
  },
  { timestamps: true, versionKey: false },
);
block.index({ vehicleId: 1, startAt: 1, endAt: 1 });
export const VehicleBlock = mongoose.model('VehicleBlock', block, 'vehicle_blocks');

const override = new mongoose.Schema(
  {
    vehicleId: { type: oid, ref: 'Vehicle', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // IST calendar date
    dailyPaise: { type: Number, required: true, min: 100 },
    hourlyPaise: { type: Number, min: 100 },
  },
  { timestamps: true, versionKey: false },
);
override.index({ vehicleId: 1, date: 1 }, { unique: true });
export const VehiclePriceOverride = mongoose.model('VehiclePriceOverride', override, 'vehicle_price_overrides');

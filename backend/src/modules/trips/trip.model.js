import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

export const PHOTO_ANGLES = ['front', 'rear', 'left', 'right', 'interior', 'dashboard', 'other'];
export const CHECKLIST_ITEMS = ['documents_in_car', 'spare_tyre_and_tools', 'exterior_clean', 'interior_clean', 'tyres_ok', 'lights_ok', 'ac_working', 'no_warning_lights', 'keys_received'];

const inspection = new mongoose.Schema(
  {
    bookingId: { type: oid, ref: 'Booking', required: true },
    kind: { type: String, enum: ['pickup', 'return'], required: true },
    submittedBy: { realm: { type: String, enum: ['user', 'vendor', 'admin'] }, id: oid },
    photos: [{ _id: false, fileId: { type: oid, ref: 'File' }, angle: { type: String, enum: PHOTO_ANGLES } }],
    odometerKm: { type: Number, required: true, min: 0 },
    fuelEighths: { type: Number, min: 0, max: 8 }, // ICE vehicles
    batteryPercent: { type: Number, min: 0, max: 100 }, // EVs
    checklist: [{ _id: false, item: { type: String, enum: CHECKLIST_ITEMS }, ok: Boolean, note: { type: String, maxlength: 200 } }],
    damages: [{ _id: false, area: { type: String, maxlength: 60 }, description: { type: String, maxlength: 300 }, severity: { type: String, enum: ['minor', 'major'] }, photoFileIds: [{ type: oid, ref: 'File' }] }],
    notes: { type: String, maxlength: 1000 },
    location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
inspection.index({ bookingId: 1, kind: 1 }, { unique: true });
export const TripInspection = mongoose.model('TripInspection', inspection, 'trip_inspections');

const agreement = new mongoose.Schema(
  {
    bookingId: { type: oid, ref: 'Booking', required: true },
    userId: { type: oid, ref: 'User', required: true },
    documentVersion: Number,
    contentHash: { type: String, required: true },
    title: String,
    acceptedName: { type: String, required: true, maxlength: 100 },
    acceptedAt: { type: Date, required: true },
    ip: String,
    userAgent: String,
    snapshot: { renter: String, phone: String, licenceMasked: String, vehicle: String, registrationNumber: String, startAt: Date, endAt: Date, depositPaise: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
agreement.index({ bookingId: 1 }, { unique: true });
export const RentalAgreement = mongoose.model('RentalAgreement', agreement, 'rental_agreements');

/** Host damage claim on return — needs admin approval before it is charged. */
const claim = new mongoose.Schema(
  {
    bookingId: { type: oid, ref: 'Booking', required: true },
    vendorId: { type: oid, ref: 'Vendor', required: true },
    amountPaise: { type: Number, required: true, min: 100 },
    description: { type: String, required: true, maxlength: 1000 },
    photoFileIds: [{ type: oid, ref: 'File' }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedPaise: Number,
    review: { by: { type: oid, ref: 'AdminUser' }, at: Date, note: String },
  },
  { timestamps: true, versionKey: false },
);
claim.index({ bookingId: 1 }, { unique: true });
claim.index({ status: 1, createdAt: 1 });
export const DamageClaim = mongoose.model('DamageClaim', claim, 'damage_claims');

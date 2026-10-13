import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

const schema = new mongoose.Schema(
  {
    bookingId: { type: oid, ref: 'Booking', required: true },
    userId: { type: oid, ref: 'User', required: true },
    vehicleId: { type: oid, ref: 'Vehicle', required: true },
    vendorId: { type: oid, ref: 'Vendor', required: true },
    vehicleRating: { type: Number, required: true, min: 1, max: 5 },
    hostRating: { type: Number, required: true, min: 1, max: 5 },
    tags: { type: [String], default: [] },
    comment: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
    moderation: { by: { type: oid, ref: 'AdminUser' }, at: Date, reason: String },
    hostReply: { text: { type: String, maxlength: 500 }, at: Date },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ bookingId: 1 }, { unique: true });
schema.index({ vehicleId: 1, status: 1, createdAt: -1 });
schema.index({ vendorId: 1, createdAt: -1 });

export const Review = mongoose.model('Review', schema, 'reviews');

import mongoose from 'mongoose';
import { geoPoint } from '../../core/schemas.js';

const oid = mongoose.Schema.Types.ObjectId;

export const TICKET_CATEGORIES = ['booking', 'payment', 'refund', 'vehicle_issue', 'damage_dispute', 'account', 'kyc', 'payout', 'roadside', 'other'];
export const ROADSIDE_TYPES = ['breakdown', 'flat_tyre', 'battery', 'accident', 'fuel', 'lockout', 'other'];

const message = new mongoose.Schema(
  {
    from: { realm: { type: String, enum: ['user', 'vendor', 'admin', 'system'] }, id: oid, name: String },
    body: { type: String, required: true, maxlength: 2000 },
    attachmentFileIds: [{ type: oid, ref: 'File' }],
    internal: { type: Boolean, default: false }, // admin-only notes
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const schema = new mongoose.Schema(
  {
    ref: { type: String, required: true },
    raisedBy: { realm: { type: String, enum: ['user', 'vendor'], required: true }, id: { type: oid, required: true } },
    bookingId: { type: oid, ref: 'Booking' },
    category: { type: String, enum: TICKET_CATEGORIES, required: true },
    subject: { type: String, required: true, maxlength: 150 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['open', 'in_progress', 'awaiting_customer', 'resolved', 'closed'], default: 'open' },
    assignedTo: { type: oid, ref: 'AdminUser' },
    roadside: {
      type: { type: String, enum: ROADSIDE_TYPES },
      location: geoPoint,
      address: String,
      stage: { type: String, enum: ['requested', 'assigned', 'en_route', 'resolved'] },
    },
    messages: [message],
    lastMessageAt: Date,
    unreadFor: { requester: { type: Boolean, default: false }, admin: { type: Boolean, default: true } },
    resolvedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
schema.index({ ref: 1 }, { unique: true });
schema.index({ 'raisedBy.realm': 1, 'raisedBy.id': 1, updatedAt: -1 });
schema.index({ status: 1, priority: 1, updatedAt: -1 });
schema.index({ category: 1, status: 1 });
export const SupportTicket = mongoose.model('SupportTicket', schema, 'support_tickets');

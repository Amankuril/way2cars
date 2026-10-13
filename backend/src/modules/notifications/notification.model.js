import mongoose from 'mongoose';

const recipient = {
  realm: { type: String, enum: ['user', 'vendor', 'admin'], required: true },
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
};

const inbox = new mongoose.Schema(
  {
    recipient,
    event: { type: String, required: true },
    category: { type: String, enum: ['booking', 'payment', 'trip', 'kyc', 'account', 'promo', 'support', 'payout', 'vehicle', 'system'], required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: String, // in-app route, e.g. /trips/<id>
    data: mongoose.Schema.Types.Mixed,
    dedupeKey: String,
    readAt: Date,
    channels: { push: String, sms: String, email: String }, // delivery outcome per channel
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
inbox.index({ 'recipient.realm': 1, 'recipient.id': 1, createdAt: -1 });
inbox.index({ 'recipient.realm': 1, 'recipient.id': 1, readAt: 1 });
inbox.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
inbox.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 });
export const Notification = mongoose.model('Notification', inbox, 'notifications');

const token = new mongoose.Schema(
  {
    owner: recipient,
    token: { type: String, required: true },
    platform: { type: String, enum: ['web', 'android', 'ios'], default: 'web' },
    userAgent: String,
    lastSeenAt: Date,
  },
  { timestamps: true, versionKey: false },
);
token.index({ token: 1 }, { unique: true });
token.index({ 'owner.realm': 1, 'owner.id': 1 });
export const DeviceToken = mongoose.model('DeviceToken', token, 'device_tokens');

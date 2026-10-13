import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    realm: { type: String, enum: ['user', 'vendor'], required: true },
    codeHash: { type: String, required: true },
    mode: { type: String, enum: ['sms', 'static'], required: true }, // never returned to clients
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: Date,
    ip: String,
    providerRef: String,
    deliveryStatus: { type: String, enum: ['sent', 'failed', 'skipped'], default: 'sent' },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ phone: 1, realm: 1, createdAt: -1 });
schema.index({ ip: 1, createdAt: -1 });
// Rows are kept for 24h so hourly rate limits survive OTP expiry.
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge = mongoose.model('OtpChallenge', schema, 'otp_challenges');

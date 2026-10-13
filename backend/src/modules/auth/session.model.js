import mongoose from 'mongoose';

/** One schema, one collection per realm (user_sessions, vendor_sessions, admin_sessions). */
function sessionSchema() {
  const s = new mongoose.Schema(
    {
      accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
      tokenHash: { type: String, required: true },
      prevTokenHash: String,
      rotatedAt: Date,
      expiresAt: { type: Date, required: true },
      revokedAt: Date,
      revokedReason: String,
      ip: String,
      userAgent: String,
      lastUsedAt: Date,
    },
    { timestamps: true, versionKey: false },
  );
  // Purge a week after expiry; revoked sessions stay for that long for forensics.
  s.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 86400 });
  return s;
}

export const sessionModels = {
  user: mongoose.model('UserSession', sessionSchema(), 'user_sessions'),
  vendor: mongoose.model('VendorSession', sessionSchema(), 'vendor_sessions'),
  admin: mongoose.model('AdminSession', sessionSchema(), 'admin_sessions'),
};

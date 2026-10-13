import mongoose from 'mongoose';

export const ADMIN_ROLES = ['super_admin', 'operations', 'kyc_reviewer', 'finance', 'support', 'content'];

const schema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    mfa: {
      enabled: { type: Boolean, default: false },
      secretEnc: { type: String, select: false },
      pendingSecretEnc: { type: String, select: false },
    },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    passwordChangedAt: Date,
    lastLoginAt: Date,
    lastLoginIp: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ email: 1 }, { unique: true });

export const AdminUser = mongoose.model('AdminUser', schema, 'admin_users');

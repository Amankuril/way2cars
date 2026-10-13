import mongoose from 'mongoose';
import { logger } from './logger.js';

const schema = new mongoose.Schema(
  {
    actor: {
      realm: { type: String, enum: ['user', 'vendor', 'admin', 'system', 'webhook'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId },
      label: String,
    },
    action: { type: String, required: true }, // e.g. kyc.approved, booking.cancelled
    entity: { type: { type: String }, id: mongoose.Schema.Types.ObjectId },
    changes: mongoose.Schema.Types.Mixed,
    reason: String,
    ip: String,
    userAgent: String,
    requestId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ 'entity.type': 1, 'entity.id': 1, createdAt: -1 });
schema.index({ 'actor.realm': 1, 'actor.id': 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', schema, 'admin_audit_logs');

export function actorFrom(req) {
  if (!req?.auth) return { realm: 'system' };
  return { realm: req.auth.realm, id: req.auth.id, label: req.auth.label };
}

/** Append-only audit record. Never throws into the business flow. */
export async function audit(req, action, entity, { changes, reason, actor, session } = {}) {
  try {
    await AuditLog.create(
      [
        {
          actor: actor || actorFrom(req),
          action,
          entity,
          changes,
          reason,
          ip: req?.ip,
          userAgent: req?.get?.('user-agent')?.slice(0, 300),
          requestId: req?.id,
        },
      ],
      session ? { session } : undefined,
    );
  } catch (err) {
    if (session) throw err;
    logger.error({ err, action }, 'audit write failed');
  }
}

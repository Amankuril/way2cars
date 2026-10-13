import { FileRecord, FILE_PURPOSES } from './file.model.js';
import { processUpload, writeFile, deleteFile, publicUrl } from '../../integrations/storage.js';
import { badRequest, notFound } from '../../core/errors.js';
import { isValidId } from '../../core/db.js';
import { hasPermission } from '../auth/permissions.js';

const accessRules = new Map(); // purpose → async (auth, file) => boolean

/** Modules register who (besides the owner and permitted admins) may read their private files. */
export function registerFileAccessRule(purpose, fn) {
  accessRules.set(purpose, fn);
}

const ADMIN_READ_PERMISSION = {
  kyc_document: 'kyc.review',
  kyc_selfie: 'kyc.review',
  vehicle_document: 'vehicles.review',
  bank_proof: 'vendors.bank.review',
  inspection_photo: 'trips.manage',
  damage_photo: 'trips.manage',
  ticket_attachment: 'support.manage',
};

/** Stores an uploaded file for the authenticated owner. Cleans up the bytes if the DB write fails. */
export async function storeUpload(auth, purpose, upload) {
  const spec = FILE_PURPOSES[purpose];
  if (!spec) throw badRequest('Unknown upload purpose.');
  const processed = await processUpload(upload.buffer, spec);
  const { key, sha256 } = await writeFile(spec.visibility, purpose, processed);
  try {
    const rec = await FileRecord.create({
      visibility: spec.visibility,
      purpose,
      owner: { realm: auth.realm, id: auth.id },
      storageKey: key,
      mimeType: processed.mimeType,
      size: processed.buffer.length,
      width: processed.width,
      height: processed.height,
      sha256,
      originalName: String(upload.originalname || '').replace(/[^\w.\- ]+/g, '').slice(0, 120),
    });
    return serializeFile(rec);
  } catch (err) {
    await deleteFile(spec.visibility, key);
    throw err;
  }
}

export function serializeFile(f) {
  if (!f) return null;
  return {
    id: f._id,
    purpose: f.purpose,
    mimeType: f.mimeType,
    size: f.size,
    width: f.width,
    height: f.height,
    url: f.visibility === 'public' ? publicUrl(f.storageKey) : `/api/v1/files/${f._id}`,
    createdAt: f.createdAt,
  };
}

/**
 * Validates that the given file ids belong to the caller, match the expected purposes and are
 * not already attached elsewhere. Returns the file docs in input order.
 */
export async function claimFiles(auth, ids, purposes, { session, allowAttachedTo } = {}) {
  const list = [...new Set((ids || []).map(String))];
  if (!list.length) return [];
  if (!list.every(isValidId)) throw badRequest('Invalid file reference.', undefined, 'FILE_INVALID');
  const files = await FileRecord.find({ _id: { $in: list }, status: { $ne: 'deleted' } }).session(session || null);
  const byId = new Map(files.map((f) => [String(f._id), f]));
  for (const id of list) {
    const f = byId.get(id);
    const ownedByCaller = f && f.owner.realm === auth.realm && String(f.owner.id) === String(auth.id);
    const purposeOk = f && [].concat(purposes).includes(f.purpose);
    const free = f && (f.status === 'temp' || (allowAttachedTo && f.linkedTo?.type === allowAttachedTo.type && String(f.linkedTo?.id) === String(allowAttachedTo.id)));
    if (!ownedByCaller || !purposeOk || !free) throw badRequest('One of the uploaded files is invalid or already used. Please upload it again.', { fileId: id }, 'FILE_INVALID');
  }
  return list.map((id) => byId.get(id));
}

export async function attachFiles(ids, linkedTo, session) {
  if (!ids?.length) return;
  await FileRecord.updateMany({ _id: { $in: ids } }, { $set: { status: 'attached', linkedTo } }, { session });
}

export async function canReadFile(auth, file) {
  if (file.visibility === 'public') return true;
  if (!auth) return false;
  if (file.owner.realm === auth.realm && String(file.owner.id) === String(auth.id)) return true;
  if (auth.realm === 'admin') {
    const perm = ADMIN_READ_PERMISSION[file.purpose];
    return Boolean(perm && hasPermission(auth.role, perm));
  }
  const rule = accessRules.get(file.purpose);
  return rule ? Boolean(await rule(auth, file)) : false;
}

export async function getReadableFile(auth, id) {
  if (!isValidId(id)) throw notFound('File');
  const file = await FileRecord.findOne({ _id: id, status: { $ne: 'deleted' } }).lean();
  if (!file || !(await canReadFile(auth, file))) throw notFound('File');
  return file;
}

/** Deletes temp uploads nobody attached within maxAgeHours (abandoned forms). */
export async function purgeOrphanFiles(maxAgeHours = 24) {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);
  const orphans = await FileRecord.find({ status: 'temp', createdAt: { $lt: cutoff } }).limit(500).lean();
  for (const f of orphans) {
    await deleteFile(f.visibility, f.storageKey);
    await FileRecord.updateOne({ _id: f._id }, { $set: { status: 'deleted', deletedAt: new Date() } });
  }
  return orphans.length;
}

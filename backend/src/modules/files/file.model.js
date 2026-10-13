import mongoose from 'mongoose';

/**
 * Upload purposes. `visibility` is fixed per purpose — a client can never choose to make a KYC
 * document public.
 */
export const FILE_PURPOSES = {
  vehicle_photo: { visibility: 'public', kinds: ['image'] },
  banner: { visibility: 'public', kinds: ['image'] },
  brand_logo: { visibility: 'public', kinds: ['image'], minImageSide: 64 }, // wordmarks are short and wide
  category_image: { visibility: 'public', kinds: ['image'] },
  city_image: { visibility: 'public', kinds: ['image'] },
  avatar: { visibility: 'public', kinds: ['image'] },
  kyc_document: { visibility: 'private', kinds: ['image', 'pdf'] },
  kyc_selfie: { visibility: 'private', kinds: ['image'] },
  vehicle_document: { visibility: 'private', kinds: ['image', 'pdf'] },
  bank_proof: { visibility: 'private', kinds: ['image', 'pdf'] },
  inspection_photo: { visibility: 'private', kinds: ['image'] },
  damage_photo: { visibility: 'private', kinds: ['image'] },
  ticket_attachment: { visibility: 'private', kinds: ['image', 'pdf'] },
};

const schema = new mongoose.Schema(
  {
    visibility: { type: String, enum: ['public', 'private'], required: true },
    purpose: { type: String, enum: Object.keys(FILE_PURPOSES), required: true },
    owner: {
      realm: { type: String, enum: ['user', 'vendor', 'admin', 'system'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
    storageKey: { type: String, required: true }, // path relative to the visibility root
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    sha256: String,
    originalName: { type: String, maxlength: 200 },
    // A file starts "temp" and becomes "attached" when a business record references it.
    status: { type: String, enum: ['temp', 'attached', 'deleted'], default: 'temp' },
    linkedTo: { type: { type: String }, id: mongoose.Schema.Types.ObjectId },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
schema.index({ 'owner.realm': 1, 'owner.id': 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });
schema.index({ 'linkedTo.type': 1, 'linkedTo.id': 1 });

export const FileRecord = mongoose.model('File', schema, 'files');

import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

/**
 * A withdrawal request. It is NOT a payout: money moves only when finance records the bank
 * transfer reference (UTR) — or a future RazorpayX integration confirms it — and status becomes "paid".
 */
const schema = new mongoose.Schema(
  {
    vendorId: { type: oid, ref: 'Vendor', required: true },
    amountPaise: { type: Number, required: true, min: 100 },
    bankAccountId: { type: oid, ref: 'VendorBankAccount', required: true },
    bankSnapshot: { accountHolderName: String, accountNumberLast4: String, ifsc: String, bankName: String },
    status: { type: String, enum: ['requested', 'approved', 'paid', 'rejected'], default: 'requested' },
    utr: { type: String, trim: true, maxlength: 40 },
    paidAt: Date,
    reviewedBy: { type: oid, ref: 'AdminUser' },
    reviewedAt: Date,
    rejectionReason: String,
    note: { type: String, maxlength: 300 },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ vendorId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });
schema.index({ utr: 1 }, { unique: true, partialFilterExpression: { utr: { $type: 'string' } } });

export const PayoutRequest = mongoose.model('PayoutRequest', schema, 'vendor_payout_requests');

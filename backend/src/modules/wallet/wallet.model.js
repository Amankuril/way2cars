import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

/**
 * Append-only ledger. Every balance change on user_accounts.walletBalancePaise or
 * vendor_accounts.wallet.* happens in the same transaction as one ledger row.
 */
export const LEDGER_TYPES = [
  // user wallet
  'referral_reward', 'loyalty_reward', 'wallet_redeemed', 'wallet_redeem_reversed', 'admin_adjustment',
  // vendor earnings
  'trip_earning', 'earning_released', 'payout_requested', 'payout_rejected', 'payout_paid', 'earning_reversed',
];

const schema = new mongoose.Schema(
  {
    owner: { realm: { type: String, enum: ['user', 'vendor'], required: true }, id: { type: oid, required: true } },
    type: { type: String, enum: LEDGER_TYPES, required: true },
    bucket: { type: String, enum: ['wallet', 'pending', 'available', 'locked', 'paid_out'], required: true },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    balanceAfterPaise: Number,
    bookingId: { type: oid, ref: 'Booking' },
    payoutRequestId: { type: oid, ref: 'PayoutRequest' },
    releaseAt: Date, // for pending vendor earnings
    released: Boolean,
    note: { type: String, maxlength: 300 },
    idempotencyKey: String,
    createdBy: { realm: String, id: oid },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ 'owner.realm': 1, 'owner.id': 1, createdAt: -1 });
schema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
schema.index({ type: 1, released: 1, releaseAt: 1 });
schema.index({ bookingId: 1 });

export const LedgerEntry = mongoose.model('LedgerEntry', schema, 'wallet_ledger');

const referral = new mongoose.Schema(
  {
    referrerId: { type: oid, ref: 'User', required: true },
    refereeId: { type: oid, ref: 'User', required: true },
    code: { type: String, required: true },
    status: { type: String, enum: ['pending', 'rewarded', 'void'], default: 'pending' },
    referrerRewardPaise: Number,
    refereeRewardPaise: Number,
    qualifyingBookingId: { type: oid, ref: 'Booking' },
    rewardedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
referral.index({ refereeId: 1 }, { unique: true });
referral.index({ referrerId: 1, createdAt: -1 });
export const Referral = mongoose.model('Referral', referral, 'referrals');

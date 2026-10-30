import mongoose from 'mongoose';

/**
 * Investors who fund cars of Way2Cars' own fleet. A fleet car may name one investor and their share
 * (vehicle.investor); on each settled trip that share of the car's earnings is credited here and paid
 * out by finance against a bank reference. Fleet cars without an investor earn 100% for Way2Cars.
 */
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 15 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    panMasked: String,
    panEnc: String,
    bank: {
      accountHolderName: { type: String, trim: true, maxlength: 120 },
      accountNumberEnc: String, // AES-GCM, see core/crypto
      accountNumberLast4: String,
      ifsc: { type: String, uppercase: true },
      bankName: String,
      upiId: String,
    },
    notes: { type: String, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
    wallet: {
      availablePaise: { type: Number, default: 0, min: 0 }, // earned, not yet paid out
      lifetimeEarnedPaise: { type: Number, default: 0, min: 0 },
      lifetimePaidOutPaise: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ name: 1 });

export const Investor = mongoose.model('Investor', schema, 'admin_investors');

const payout = new mongoose.Schema(
  {
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    utr: { type: String, required: true },
    note: String,
    bankSnapshot: { accountHolderName: String, accountNumberLast4: String, ifsc: String, bankName: String },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    paidAt: Date,
  },
  { timestamps: true, versionKey: false },
);
export const InvestorPayout = mongoose.model('InvestorPayout', payout, 'investor_payouts');

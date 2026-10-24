import mongoose from 'mongoose';

const oid = mongoose.Schema.Types.ObjectId;

const payment = new mongoose.Schema(
  {
    bookingId: { type: oid, ref: 'Booking', required: true },
    userId: { type: oid, ref: 'User', required: true },
    purpose: { type: String, enum: ['booking', 'balance', 'extension', 'settlement'], required: true },
    // gateway = Razorpay; offline = cash/UPI/card/bank transfer recorded by operations at the office.
    mode: { type: String, enum: ['gateway', 'offline'], default: 'gateway' },
    offline: { method: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer'] }, reference: String, note: String, recordedBy: { type: oid, ref: 'AdminUser' } },
    extensionId: oid,
    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, required() { return this.mode !== 'offline'; } },
    razorpayPaymentId: String,
    // created → paid | failed; amount_mismatch is held for manual review and never confirms a booking.
    status: { type: String, enum: ['created', 'paid', 'failed', 'amount_mismatch'], default: 'created' },
    method: String,
    verifiedVia: { type: String, enum: ['checkout', 'webhook', 'reconcile'] },
    paidAt: Date,
    failureReason: String,
    refundedPaise: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    lastCheckedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
payment.index({ razorpayOrderId: 1 }, { unique: true, partialFilterExpression: { razorpayOrderId: { $type: 'string' } } });
payment.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } });
payment.index({ bookingId: 1, createdAt: -1 });
payment.index({ userId: 1, createdAt: -1 });
payment.index({ status: 1, createdAt: 1 });
export const Payment = mongoose.model('Payment', payment, 'payments');

const refund = new mongoose.Schema(
  {
    bookingId: { type: oid, ref: 'Booking', required: true },
    paymentId: { type: oid, ref: 'Payment', required: true },
    userId: { type: oid, ref: 'User', required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    reason: { type: String, enum: ['user_cancellation', 'vendor_rejection', 'approval_timeout', 'admin_cancellation', 'deposit_settlement', 'late_payment', 'admin_adjustment', 'extension_unavailable', 'extension_rejected'], required: true },
    // pending: recorded, provider call not yet accepted · initiated: accepted by Razorpay · processed · failed
    // manual: the money was collected offline, so finance returns it by hand and records the reference.
    status: { type: String, enum: ['pending', 'initiated', 'processed', 'failed', 'manual'], default: 'pending' },
    manualReference: String,
    idempotencyKey: { type: String, required: true },
    razorpayRefundId: String,
    attempts: { type: Number, default: 0 },
    lastError: String,
    processedAt: Date,
    initiatedBy: { realm: String, id: oid },
    note: { type: String, maxlength: 300 },
  },
  { timestamps: true, versionKey: false },
);
refund.index({ idempotencyKey: 1 }, { unique: true });
refund.index({ razorpayRefundId: 1 }, { unique: true, partialFilterExpression: { razorpayRefundId: { $type: 'string' } } });
refund.index({ bookingId: 1 });
refund.index({ status: 1, updatedAt: 1 });
export const Refund = mongoose.model('Refund', refund, 'refunds');

const invoice = new mongoose.Schema(
  {
    number: { type: String, required: true },
    bookingId: { type: oid, ref: 'Booking', required: true },
    paymentId: { type: oid, ref: 'Payment' },
    userId: { type: oid, ref: 'User', required: true },
    type: { type: String, enum: ['booking', 'extension', 'settlement'], required: true },
    billedTo: { name: String, phone: String, email: String },
    lines: [{ _id: false, description: String, sac: String, amountPaise: Number }],
    taxablePaise: Number,
    gst: { bps: Number, cgstPaise: Number, sgstPaise: Number, igstPaise: Number, totalPaise: Number },
    nonTaxable: [{ _id: false, description: String, amountPaise: Number }], // e.g. refundable deposit
    totalPaise: Number,
    walletAppliedPaise: Number,
    paidPaise: Number,
    paidOffline: Boolean,
    issuedAt: { type: Date, default: Date.now },
    supplier: { legalName: String, gstin: String, address: String, stateCode: String },
  },
  { timestamps: true, versionKey: false },
);
invoice.index({ number: 1 }, { unique: true });
invoice.index({ bookingId: 1, type: 1 });
invoice.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'objectId' } } });
export const Invoice = mongoose.model('Invoice', invoice, 'invoices');

const webhookEvent = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    event: String,
    status: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], default: 'received' },
    error: String,
    payload: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, versionKey: false },
);
webhookEvent.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEvent.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
export const WebhookEvent = mongoose.model('WebhookEvent', webhookEvent, 'webhook_events');

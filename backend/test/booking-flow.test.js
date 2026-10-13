import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { api, useDb, auth, tokenFor, upload, slot } from './helpers.js';

// Only network calls to Razorpay are mocked; signature verification stays real.
const rzpState = { orders: new Map(), refunds: [] };
vi.mock('../src/integrations/razorpay.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createOrder: vi.fn(async ({ amountPaise }) => {
      const id = `order_${crypto.randomBytes(7).toString('hex')}`;
      rzpState.orders.set(id, amountPaise);
      return { id, amount: amountPaise };
    }),
    fetchPayment: vi.fn(async (paymentId) => rzpState.payments?.get(paymentId)),
    fetchOrderPayments: vi.fn(async () => ({ items: [] })),
    createCustomer: vi.fn(async () => ({ id: `cust_${crypto.randomBytes(5).toString('hex')}` })),
    createRefund: vi.fn(async ({ amountPaise, receipt }) => {
      rzpState.refunds.push({ amountPaise, receipt });
      return { id: `rfnd_${crypto.randomBytes(6).toString('hex')}`, status: 'processed' };
    }),
  };
});

const { User } = await import('../src/modules/users/user.model.js');
const { Vendor } = await import('../src/modules/vendors/vendor.model.js');
const { AdminUser } = await import('../src/modules/admin/admin.model.js');
const { City, Brand, Category } = await import('../src/modules/catalog/catalog.model.js');
const { CmsPage } = await import('../src/modules/cms/cms.model.js');
const { Booking } = await import('../src/modules/bookings/booking.model.js');
const { Payment, Refund, Invoice } = await import('../src/modules/payments/payment.model.js');
const { LedgerEntry } = await import('../src/modules/wallet/wallet.model.js');

useDb();

const SECRET = process.env.RAZORPAY_KEY_SECRET;
const sign = (orderId, paymentId) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

/** Simulates the Android Razorpay SDK success callback followed by our verify call. */
async function pay(token, payment) {
  const paymentId = `pay_${crypto.randomBytes(7).toString('hex')}`;
  rzpState.payments ||= new Map();
  rzpState.payments.set(paymentId, { id: paymentId, order_id: payment.orderId, amount: payment.amountPaise, currency: 'INR', status: 'captured', method: 'upi', created_at: Math.floor(Date.now() / 1000) });
  const res = await api().post('/api/v1/user/bookings/payments/verify').set(auth(token)).send({ razorpayOrderId: payment.orderId, razorpayPaymentId: paymentId, razorpaySignature: sign(payment.orderId, paymentId) });
  return { res, paymentId };
}

const ctx = {};

beforeAll(async () => {
  ctx.city = await City.create({ name: 'Pune', slug: 'pune', state: 'Maharashtra', gstStateCode: '27', center: { type: 'Point', coordinates: [73.8567, 18.5204] }, serviceRadiusKm: 35 });
  ctx.brand = await Brand.create({ name: 'Hyundai', slug: 'hyundai' });
  ctx.category = await Category.create({ name: 'SUV', slug: 'suv', bodyType: 'suv' });
  await CmsPage.create({ slug: 'rental-agreement', title: 'Rental Agreement', blocks: [{ type: 'paragraph', text: 'Test agreement' }] });
  const admin = await AdminUser.create({ email: 'ops@test.in', name: 'Ops', role: 'super_admin', passwordHash: 'x' });
  ctx.adminToken = await tokenFor('admin', admin);
  ctx.vendor = await Vendor.create({ phone: '9800000001' });
  ctx.vendorToken = await tokenFor('vendor', ctx.vendor);
  ctx.user = await User.create({ phone: '9800000002', referralCode: 'W2CAAAAAA' });
  ctx.userToken = await tokenFor('user', ctx.user);
  ctx.user2 = await User.create({ phone: '9800000003', referralCode: 'W2CBBBBBB' });
  ctx.user2Token = await tokenFor('user', ctx.user2);
});

describe('host onboarding and approval', () => {
  it('cannot list a car before submitting the host application', async () => {
    const res = await api().post('/api/v1/vendor/bookings').set(auth(ctx.vendorToken));
    expect([403, 404]).toContain(res.status);
  });

  it('completes profile, business, KYC and bank, then submits', async () => {
    const v = ctx.vendorToken;
    await api().put('/api/v1/vendor/me/profile').set(auth(v)).send({ name: 'Ravi Kumar', email: 'ravi@example.com' }).expect(200);
    await api().put('/api/v1/vendor/me/business').set(auth(v)).send({ businessType: 'individual', cityId: String(ctx.city._id), address: { line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } }).expect(200);
    const kyc = await api().post('/api/v1/vendor/me/kyc').set(auth(v)).send({
      idProofType: 'aadhaar', idProofNumber: '123412341234', idProofFrontFileId: await upload('vendor', v, 'kyc_document'),
      panNumber: 'ABCDE1234F', panFileId: await upload('vendor', v, 'kyc_document', { pdf: true }), selfieFileId: await upload('vendor', v, 'kyc_selfie'), dateOfBirth: '1985-04-01',
    });
    expect(kyc.status).toBe(201);
    expect(kyc.body.data.idProof.numberMasked).toBe('XXXX XXXX 1234');
    ctx.vendorKycId = kyc.body.data.id;
    const bank = await api().put('/api/v1/vendor/me/bank').set(auth(v)).send({ accountHolderName: 'Ravi Kumar', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'HDFC0001234', proofFileId: await upload('vendor', v, 'bank_proof') });
    expect(bank.status).toBe(200);
    expect(bank.body.data.accountNumberMasked).toBe('XXXXXX9012');
    expect(JSON.stringify(bank.body)).not.toContain('123456789012');
    const sub = await api().post('/api/v1/vendor/me/onboarding/submit').set(auth(v)).expect(200);
    expect(sub.body.data.status).toBe('pending_approval');
  });

  it('admin cannot approve the host before KYC and bank are verified', async () => {
    const res = await api().post(`/api/v1/admin/vendors/${ctx.vendor._id}/decision`).set(auth(ctx.adminToken)).send({ action: 'approve' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('KYC_NOT_APPROVED');
  });

  it('admin approves KYC (all checks required), bank and host', async () => {
    const partial = await api().post(`/api/v1/admin/kyc/${ctx.vendorKycId}/review`).set(auth(ctx.adminToken)).send({ decision: 'approve', checks: { idValid: true, selfieMatches: false, ageEligible: true } });
    expect(partial.body.error.code).toBe('KYC_CHECKS_INCOMPLETE');
    await api().post(`/api/v1/admin/kyc/${ctx.vendorKycId}/review`).set(auth(ctx.adminToken)).send({ decision: 'approve', checks: { idValid: true, selfieMatches: true, ageEligible: true } }).expect(200);
    await api().post(`/api/v1/admin/vendors/${ctx.vendor._id}/bank/verify`).set(auth(ctx.adminToken)).send({ decision: 'verified' }).expect(200);
    const res = await api().post(`/api/v1/admin/vendors/${ctx.vendor._id}/decision`).set(auth(ctx.adminToken)).send({ action: 'approve' }).expect(200);
    expect(res.body.data.status).toBe('approved');
  });
});

describe('vehicle listing', () => {
  it('rejects a pickup location outside the city service area', async () => {
    const res = await api().post('/api/v1/vendor/vehicles').set(auth(ctx.vendorToken)).send(vehicleBody({ location: { address: 'Somewhere far away', lat: 19.9975, lng: 73.7898 } }));
    expect(res.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });

  it('creates, uploads photos and documents, submits, and admin approves', async () => {
    const v = ctx.vendorToken;
    const created = await api().post('/api/v1/vendor/vehicles').set(auth(v)).send(vehicleBody()).expect(201);
    ctx.vehicleId = created.body.data.id;
    const early = await api().post(`/api/v1/vendor/vehicles/${ctx.vehicleId}/submit`).set(auth(v));
    expect(early.body.error.code).toBe('VEHICLE_INCOMPLETE');
    const photos = [];
    for (let i = 0; i < 4; i++) photos.push(await upload('vendor', v, 'vehicle_photo'));
    const ph = await api().put(`/api/v1/vendor/vehicles/${ctx.vehicleId}/photos`).set(auth(v)).send({ fileIds: photos }).expect(200);
    expect(ph.body.data.photos[0]).toMatch(/^http:\/\/localhost:4000\/uploads\/vehicle_photo\/.+\.webp$/);
    const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString();
    await api().put(`/api/v1/vendor/vehicles/${ctx.vehicleId}/documents`).set(auth(v)).send({
      rc: { fileId: await upload('vendor', v, 'vehicle_document', { pdf: true }) },
      insurance: { fileId: await upload('vendor', v, 'vehicle_document'), provider: 'ICICI Lombard', type: 'comprehensive', expiry: nextYear },
      puc: { fileId: await upload('vendor', v, 'vehicle_document'), expiry: nextYear },
    }).expect(200);
    await api().post(`/api/v1/vendor/vehicles/${ctx.vehicleId}/submit`).set(auth(v)).expect(200);
    const approved = await api().post(`/api/v1/admin/vehicles/${ctx.vehicleId}/review`).set(auth(ctx.adminToken)).send({ decision: 'approve' }).expect(200);
    expect(approved.body.data.isListed).toBe(true);
  });
});

function vehicleBody(over = {}) {
  return {
    cityId: String(ctx.city._id), brandId: String(ctx.brand._id), categoryId: String(ctx.category._id),
    model: 'Creta', variant: 'SX', year: 2023, registrationNumber: over.registrationNumber || 'MH12AB1234', fuelType: 'petrol', transmission: 'automatic',
    seats: 5, luggageBags: 3, features: ['ac', 'bluetooth', 'reverse_camera'],
    location: over.location || { address: 'Koregaon Park, Pune', area: 'Koregaon Park', pincode: '411001', lat: 18.536, lng: 73.893 },
    pricing: { hourlyPaise: 25000, dailyPaise: 300000, securityDepositPaise: 500000, includedKmPerDay: 240, extraKmChargePaise: 1200 },
    instantBooking: false,
  };
}

describe('renter onboarding and KYC', () => {
  it('blocks booking until profile and KYC are complete', async () => {
    const start = slot(24 * 60);
    const res = await api().post('/api/v1/user/bookings').set(auth(ctx.userToken)).send({ vehicleId: ctx.vehicleId, startAt: start, endAt: new Date(start.getTime() + 24 * 3600_000) });
    expect(res.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('onboards and verifies two renters', async () => {
    for (const [token, name] of [[ctx.userToken, 'Asha Patil'], [ctx.user2Token, 'Neel Shah']]) {
      await api().post('/api/v1/user/me/onboarding').set(auth(token)).send({ name }).expect(200);
      const kyc = await api().post('/api/v1/user/me/kyc').set(auth(token)).send({
        licenceNumber: 'MH1420110012345', licenceExpiry: new Date(Date.now() + 3 * 365 * 86400_000).toISOString(), licenceFrontFileId: await upload('user', token, 'kyc_document'), licenceBackFileId: await upload('user', token, 'kyc_document'),
        idProofType: 'passport', idProofNumber: 'K1234567', idProofFrontFileId: await upload('user', token, 'kyc_document'), selfieFileId: await upload('user', token, 'kyc_selfie'), dateOfBirth: '1995-06-15',
      }).expect(201);
      await api().post(`/api/v1/admin/kyc/${kyc.body.data.id}/review`).set(auth(ctx.adminToken)).send({ decision: 'approve', checks: { licenceValid: true, idValid: true, selfieMatches: true, ageEligible: true } }).expect(200);
    }
  });

  it('rejects under-age renters', async () => {
    const u = await User.create({ phone: '9800000009', referralCode: 'W2CCCCCCC', name: 'Kid', profileCompleted: true });
    const t = await tokenFor('user', u);
    const res = await api().post('/api/v1/user/me/kyc').set(auth(t)).send({
      licenceNumber: 'MH1420110012345', licenceExpiry: new Date(Date.now() + 365 * 86400_000).toISOString(), licenceFrontFileId: await upload('user', t, 'kyc_document'), licenceBackFileId: await upload('user', t, 'kyc_document'),
      idProofType: 'passport', idProofNumber: 'K1234567', idProofFrontFileId: await upload('user', t, 'kyc_document'), selfieFileId: await upload('user', t, 'kyc_selfie'), dateOfBirth: new Date(Date.now() - 19 * 365 * 86400_000).toISOString(),
    });
    expect(res.body.error.code).toBe('KYC_UNDERAGE');
  });
});

describe('search, quote and booking', () => {
  it('finds the car for a date range with an estimate, and filters it out by fuel type', async () => {
    ctx.start = slot(26 * 60);
    ctx.end = new Date(ctx.start.getTime() + 24 * 3600_000);
    const q = `cityId=${ctx.city._id}&startAt=${ctx.start.toISOString()}&endAt=${ctx.end.toISOString()}`;
    const res = await api().get(`/api/v1/public/vehicles?${q}`).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].estimate.rentalPaise).toBe(300000);
    expect(res.body.data[0].location.address).toBeUndefined(); // exact address hidden publicly
    const none = await api().get(`/api/v1/public/vehicles?${q}&fuelTypes=diesel`).expect(200);
    expect(none.body.data).toHaveLength(0);
  });

  it('quote is computed server-side, including GST and deposit', async () => {
    const res = await api().post('/api/v1/user/bookings/quote').set(auth(ctx.userToken)).send({ vehicleId: ctx.vehicleId, startAt: ctx.start, endAt: ctx.end }).expect(200);
    const q = res.body.data;
    expect(q.rentalPaise).toBe(300000);
    expect(q.taxablePaise).toBe(300000 + 9900);
    expect(q.gstPaise).toBe(Math.round(309900 * 0.18));
    expect(q.payablePaise).toBe(q.taxablePaise + q.gstPaise + 500000);
  });

  it('two renters racing for the same slot: exactly one wins', async () => {
    const body = { vehicleId: ctx.vehicleId, startAt: ctx.start, endAt: ctx.end };
    const [a, b] = await Promise.all([
      api().post('/api/v1/user/bookings').set(auth(ctx.userToken)).send(body),
      api().post('/api/v1/user/bookings').set(auth(ctx.user2Token)).send(body),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    ctx.bookingToken = winner === a ? ctx.userToken : ctx.user2Token;
    ctx.loserToken = winner === a ? ctx.user2Token : ctx.userToken;
    ctx.booking = winner.body.data.booking;
    ctx.payment = winner.body.data.payment;
    expect(ctx.booking.status).toBe('pending_payment');
    expect(ctx.payment.orderId).toMatch(/^order_/);
    expect(ctx.payment.amountPaise).toBe(ctx.booking.pricing.payablePaise);
    expect(await Booking.countDocuments({ vehicleId: ctx.vehicleId })).toBe(1);
  });

  it('idempotency key returns the same booking on retry', async () => {
    const start = slot(30 * 24 * 60);
    const body = { vehicleId: ctx.vehicleId, startAt: start, endAt: new Date(start.getTime() + 6 * 3600_000) };
    const r1 = await api().post('/api/v1/user/bookings').set(auth(ctx.loserToken)).set('Idempotency-Key', 'abc-123').send(body).expect(201);
    const r2 = await api().post('/api/v1/user/bookings').set(auth(ctx.loserToken)).set('Idempotency-Key', 'abc-123').send(body).expect(200);
    expect(r2.body.data.booking.id).toBe(r1.body.data.booking.id);
    ctx.secondBookingId = r1.body.data.booking.id;
  });

  it('a forged signature is rejected and does not confirm anything', async () => {
    const res = await api().post('/api/v1/user/bookings/payments/verify').set(auth(ctx.bookingToken)).send({ razorpayOrderId: ctx.payment.orderId, razorpayPaymentId: 'pay_FORGED12345', razorpaySignature: 'a'.repeat(64) });
    expect(res.body.error.code).toBe('PAYMENT_SIGNATURE_INVALID');
    expect((await Booking.findById(ctx.booking.id)).status).toBe('pending_payment');
  });

  it('verified payment moves the booking to host approval and issues an invoice', async () => {
    const { res, paymentId } = await pay(ctx.bookingToken, ctx.payment);
    expect(res.body.data.status).toBe('paid');
    ctx.rzpPaymentId = paymentId;
    const b = await Booking.findById(ctx.booking.id).lean();
    expect(b.status).toBe('pending_vendor_approval');
    expect(b.payment.paidPaise).toBe(ctx.payment.amountPaise);
    expect(await Invoice.countDocuments({ bookingId: b._id })).toBe(1);
  });

  it('webhook with a bad signature is rejected; replays are idempotent', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', created_at: 1, payload: { payment: { entity: { id: ctx.rzpPaymentId, order_id: ctx.payment.orderId, amount: ctx.payment.amountPaise, currency: 'INR', status: 'captured', method: 'upi' } } } });
    const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
    await api().post('/api/v1/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', 'bad').send(payload).expect(400);
    for (let i = 0; i < 2; i++) {
      await api().post('/api/v1/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', sig).set('x-razorpay-event-id', 'evt_1').send(payload).expect(200);
    }
    const b = await Booking.findById(ctx.booking.id).lean();
    expect(b.payment.paidPaise).toBe(ctx.payment.amountPaise);
    expect(await Payment.countDocuments({ bookingId: b._id, status: 'paid' })).toBe(1);
  });

  it('only the owning host can accept; then it is confirmed', async () => {
    const other = await Vendor.create({ phone: '9800000004', status: 'approved' });
    const otherToken = await tokenFor('vendor', other);
    await api().post(`/api/v1/vendor/bookings/${ctx.booking.id}/decision`).set(auth(otherToken)).send({ decision: 'accept' }).expect(404);
    await api().post(`/api/v1/vendor/bookings/${ctx.booking.id}/decision`).set(auth(ctx.vendorToken)).send({ decision: 'accept' }).expect(200);
    expect((await Booking.findById(ctx.booking.id)).status).toBe('confirmed');
  });
});

describe('access control', () => {
  it('a user token cannot call vendor or admin APIs', async () => {
    await api().get('/api/v1/vendor/me').set(auth(ctx.userToken)).expect(401);
    await api().get('/api/v1/admin/reports/dashboard').set(auth(ctx.userToken)).expect(401);
  });
  it('a renter cannot read another renter’s booking', async () => {
    await api().get(`/api/v1/user/bookings/${ctx.booking.id}`).set(auth(ctx.loserToken)).expect(404);
  });
  it('KYC documents are private: hosts cannot read them, owners can', async () => {
    const { FileRecord } = await import('../src/modules/files/file.model.js');
    const userId = (await Booking.findById(ctx.booking.id)).userId;
    const doc = await FileRecord.findOne({ 'owner.id': userId, purpose: 'kyc_document' }).lean();
    await api().get(`/api/v1/files/${doc._id}`).set(auth(ctx.vendorToken)).expect(404);
    const owner = await api().get(`/api/v1/files/${doc._id}`).set(auth(ctx.bookingToken)).expect(200);
    expect(owner.headers['content-type']).toBe('image/webp');
    expect(owner.headers['cache-control']).toContain('no-store');
  });
  it('a kyc_reviewer admin cannot manage payouts', async () => {
    const reviewer = await AdminUser.create({ email: 'kyc@test.in', name: 'KYC', role: 'kyc_reviewer', passwordHash: 'x' });
    const t = await tokenFor('admin', reviewer);
    await api().get('/api/v1/admin/payouts').set(auth(t)).expect(403);
    await api().get('/api/v1/admin/kyc').set(auth(t)).expect(200);
  });
  it('rejects operator injection in bodies', async () => {
    const res = await api().post('/api/v1/user/bookings/quote').set(auth(ctx.userToken)).send({ vehicleId: { $ne: null }, startAt: ctx.start, endAt: ctx.end });
    expect(res.status).toBe(400);
  });
});

describe('cancellation of an unpaid booking', () => {
  it('cancels without any gateway refund', async () => {
    await api().post(`/api/v1/user/bookings/${ctx.secondBookingId}/cancel`).set(auth(ctx.loserToken)).send({ reason: 'Plans changed' }).expect(200);
    expect(await Refund.countDocuments({ bookingId: ctx.secondBookingId })).toBe(0);
  });
});

describe('trip lifecycle and settlement', () => {
  it('pickup is refused before the window opens', async () => {
    const res = await api().post(`/api/v1/user/bookings/${ctx.booking.id}/pickup`).set(auth(ctx.bookingToken)).send(await inspection(ctx.bookingToken, { agreement: true }));
    expect(res.body.error.code).toBe('PICKUP_NOT_OPEN');
  });

  it('starts the trip with inspection + signed agreement', async () => {
    // Move the trip into the pickup window (time travel for the test).
    const now = Date.now();
    await Booking.updateOne({ _id: ctx.booking.id }, { $set: { startAt: new Date(now - 10 * 60_000), endAt: new Date(now + 23 * 3600_000), blockEndAt: new Date(now + 23 * 3600_000) } });
    const bad = await api().post(`/api/v1/user/bookings/${ctx.booking.id}/pickup`).set(auth(ctx.bookingToken)).send({ ...(await inspection(ctx.bookingToken, { agreement: true })), agreement: { accept: true, fullName: 'Renter Name', contentHash: '0'.repeat(64) } });
    expect(bad.body.error.code).toBe('AGREEMENT_CHANGED');
    const res = await api().post(`/api/v1/user/bookings/${ctx.booking.id}/pickup`).set(auth(ctx.bookingToken)).send(await inspection(ctx.bookingToken, { agreement: true }));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ongoing');
  });

  it('host can see pickup photos of their booking', async () => {
    const det = await api().get(`/api/v1/vendor/bookings/${ctx.booking.id}`).set(auth(ctx.vendorToken)).expect(200);
    const photo = det.body.data.inspections.pickup.photos[0];
    await api().get(photo.url).set(auth(ctx.vendorToken)).expect(200);
    expect(det.body.data.renter.phone).toBeDefined();
  });

  it('return with extra km and less fuel → host accepts → settled with deposit refund and earnings', async () => {
    await api().post(`/api/v1/user/bookings/${ctx.booking.id}/return`).set(auth(ctx.bookingToken)).send(await inspection(ctx.bookingToken, { odometerKm: 12340 + 300, fuelEighths: 6 })).expect(200);
    const preview = await api().get(`/api/v1/user/bookings/${ctx.booking.id}`).set(auth(ctx.bookingToken)).expect(200);
    expect(preview.body.data.settlementPreview.extraKm).toBe(300 - preview.body.data.pricing.includedKm);
    await api().post(`/api/v1/vendor/bookings/${ctx.booking.id}/return-review`).set(auth(ctx.vendorToken)).send({ decision: 'accept' }).expect(200);
    const b = await Booking.findById(ctx.booking.id).lean();
    expect(b.status).toBe('completed');
    expect(b.settlement.fuelPaise).toBe(2 * 40000);
    expect(b.settlement.depositRefundPaise).toBe(500000 - b.settlement.totalDeductionsPaise);
    const refunds = await Refund.find({ bookingId: b._id, reason: 'deposit_settlement' }).lean();
    expect(refunds.reduce((s, r) => s + r.amountPaise, 0)).toBe(b.settlement.depositRefundPaise);
    expect(refunds.every((r) => r.status === 'processed')).toBe(true);
    const earning = await LedgerEntry.findOne({ 'owner.id': ctx.vendor._id, type: 'trip_earning' }).lean();
    expect(earning.amountPaise).toBe(b.settlement.vendorEarningPaise);
    expect((await Vendor.findById(ctx.vendor._id)).wallet.pendingPaise).toBe(earning.amountPaise);
    const loyalty = await LedgerEntry.findOne({ 'owner.id': b.userId, type: 'loyalty_reward' }).lean();
    expect(loyalty.amountPaise).toBeGreaterThan(0);
  });

  it('renter reviews once; ratings aggregate onto the car', async () => {
    await api().post('/api/v1/user/reviews').set(auth(ctx.bookingToken)).send({ bookingId: ctx.booking.id, vehicleRating: 5, hostRating: 4, comment: 'Clean car' }).expect(201);
    await api().post('/api/v1/user/reviews').set(auth(ctx.bookingToken)).send({ bookingId: ctx.booking.id, vehicleRating: 1, hostRating: 1 }).expect(409);
    const v = await api().get(`/api/v1/public/vehicles/${ctx.vehicleId}`).expect(200);
    expect(v.body.data.rating).toEqual({ avg: 5, count: 1 });
  });

  it('admin dashboard reflects real data', async () => {
    const d = await api().get('/api/v1/admin/reports/dashboard').set(auth(ctx.adminToken)).expect(200);
    expect(d.body.data.totals.bookings.completed).toBe(1);
    expect(d.body.data.totals.vehicles.listed).toBe(1);
    const csv = await api().get('/api/v1/admin/reports/payments?format=csv').set(auth(ctx.adminToken)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
  });
});

async function inspection(token, { agreement = false, odometerKm = 12340, fuelEighths = 8 } = {}) {
  const angles = ['front', 'rear', 'left', 'right'];
  const photos = [];
  for (const angle of angles) photos.push({ fileId: await upload('user', token, 'inspection_photo'), angle });
  const body = { photos, odometerKm, fuelEighths, checklist: [{ item: 'keys_received', ok: true }] };
  if (agreement) {
    const a = await api().get(`/api/v1/user/bookings/${ctx.booking.id}/agreement`).set(auth(token)).expect(200);
    body.agreement = { accept: true, fullName: 'Renter Name', contentHash: a.body.data.contentHash };
  }
  return body;
}

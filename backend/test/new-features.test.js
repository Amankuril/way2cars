import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { api, useDb, auth, tokenFor, upload, slot } from './helpers.js';

// Only network calls to Razorpay are mocked; signature verification stays real.
const rzp = { payments: new Map(), refunds: [] };
vi.mock('../src/integrations/razorpay.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createOrder: vi.fn(async ({ amountPaise }) => ({ id: `order_${crypto.randomBytes(7).toString('hex')}`, amount: amountPaise })),
    fetchPayment: vi.fn(async (id) => rzp.payments.get(id)),
    fetchOrderPayments: vi.fn(async () => ({ items: [] })),
    createCustomer: vi.fn(async () => ({ id: `cust_${crypto.randomBytes(5).toString('hex')}` })),
    createRefund: vi.fn(async ({ amountPaise, receipt }) => {
      rzp.refunds.push({ amountPaise, receipt });
      return { id: `rfnd_${crypto.randomBytes(6).toString('hex')}`, status: 'processed' };
    }),
  };
});

const { User } = await import('../src/modules/users/user.model.js');
const { Vendor, companyVendor } = await import('../src/modules/vendors/vendor.model.js');
const { AdminUser } = await import('../src/modules/admin/admin.model.js');
const { City, Brand, Category } = await import('../src/modules/catalog/catalog.model.js');
const { CmsPage } = await import('../src/modules/cms/cms.model.js');
const { Vehicle } = await import('../src/modules/vehicles/vehicle.model.js');
const { Booking } = await import('../src/modules/bookings/booking.model.js');
const { Refund } = await import('../src/modules/payments/payment.model.js');
const { LedgerEntry } = await import('../src/modules/wallet/wallet.model.js');
const { Investor } = await import('../src/modules/investors/investor.model.js');
const { finalizeTrip, processScheduledDepositRefunds } = await import('../src/modules/trips/trip.service.js');
const { withTransaction } = await import('../src/core/db.js');

useDb();

const sign = (orderId, paymentId) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
async function pay(token, order) {
  const id = `pay_${crypto.randomBytes(7).toString('hex')}`;
  rzp.payments.set(id, { id, order_id: order.orderId, amount: order.amountPaise, currency: 'INR', status: 'captured', method: 'upi', created_at: Math.floor(Date.now() / 1000) });
  return api().post('/api/v1/user/bookings/payments/verify').set(auth(token)).send({ razorpayOrderId: order.orderId, razorpayPaymentId: id, razorpaySignature: sign(order.orderId, id) }).expect(200);
}

const ctx = {};
const H = 3600_000;
let regSeq = 2000;
let phoneSeq = 100;

async function listedCar(vendorId, over = {}) {
  return Vehicle.create({
    vendorId, cityId: ctx.city._id, brandId: ctx.brand._id, categoryId: ctx.category._id, model: 'Creta', year: 2024,
    registrationNumber: `MP09NF${regSeq++}`, fuelType: 'petrol', transmission: 'manual', seats: 5,
    location: { address: 'Palasia, Indore', point: { type: 'Point', coordinates: [75.88, 22.72] } },
    pricing: { hourlyPaise: 20000, dailyPaise: 240000, securityDepositPaise: 500000, includedKmPerDay: 240, extraKmChargePaise: 1200, unlimitedKmDailyPaise: 60000 },
    instantBooking: true, approval: { status: 'approved' }, status: 'active', isListed: true, ...over,
  });
}

async function renter(name) {
  const phone = `98333${String(phoneSeq++).padStart(5, '0')}`;
  const u = await User.create({ phone, name, referralCode: `W2CNF${phone.slice(-5)}`, profileCompleted: true, kyc: { status: 'approved', licenceExpiry: new Date(Date.now() + 1000 * 86400_000) } });
  return { user: u, token: await tokenFor('user', u) };
}

async function book(token, body) {
  const res = await api().post('/api/v1/user/bookings').set(auth(token)).send(body);
  if (res.status !== 201) throw new Error(`booking failed: ${res.status} ${JSON.stringify(res.body)}`);
  await pay(token, res.body.data.payment);
  return Booking.findById(res.body.data.booking.id);
}

/** Moves a confirmed booking through its trip and settles it. */
async function completeTrip(b, { km = 100, fuel = 8 } = {}) {
  Object.assign(b, { status: 'return_pending', trip: { startOdometerKm: 1000, endOdometerKm: 1000 + km, startFuelEighths: 8, endFuelEighths: fuel, returnSubmittedAt: b.endAt } });
  await b.save();
  await withTransaction((session) => finalizeTrip(b._id, { by: { realm: 'system' } }, session));
  return Booking.findById(b._id).lean();
}

beforeAll(async () => {
  ctx.city = await City.create({ name: 'Indore', slug: 'indore-nf', gstStateCode: '23', center: { type: 'Point', coordinates: [75.86, 22.72] }, serviceRadiusKm: 30 });
  ctx.brand = await Brand.create({ name: 'Hyundai', slug: 'hyundai-nf' });
  ctx.category = await Category.create({ name: 'SUV', slug: 'suv-nf', bodyType: 'suv' });
  await CmsPage.create({ slug: 'rental-agreement', title: 'Rental Agreement', blocks: [{ type: 'paragraph', text: 'Test agreement' }] });
  const admin = await AdminUser.create({ email: 'nf-admin@test.in', name: 'Asha Admin', role: 'super_admin', passwordHash: 'x' });
  ctx.admin = await tokenFor('admin', admin);
  ctx.host = await Vendor.create({ phone: '9833300001', name: 'Vikram', status: 'approved', kyc: { status: 'approved' } });
  ctx.hostToken = await tokenFor('vendor', ctx.host);
  ctx.car = await listedCar(ctx.host._id);
  await api().patch('/api/v1/admin/settings').set(auth(ctx.admin)).send({ support: { phone: '9876543210' } }).expect(200);
});

describe('1. booking errors carry the support number', () => {
  it('adds the support phone to wrong-timing errors on quotes and search', async () => {
    const { token } = await renter('Timing Test');
    const start = slot(30 * 60);
    const res = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + H) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TRIP_TOO_SHORT');
    expect(res.body.error.message).toMatch(/Call us on 9876543210/);
    expect(res.body.error.support.phone).toBe('9876543210');
    const search = await api().get(`/api/v1/public/vehicles?cityId=${ctx.city._id}&startAt=${new Date(Date.now() + 5 * 60_000).toISOString()}&endAt=${new Date(Date.now() + 10 * H).toISOString()}`);
    expect(search.status).toBe(400);
    expect(search.body.error.support.phone).toBe('9876543210');
  });

  it('does not add it to unrelated errors', async () => {
    const res = await api().get('/api/v1/user/me').set({ Authorization: 'Bearer nope' });
    expect(res.body.error.support).toBeUndefined();
  });
});

describe('2. booked cars show a BOOKED badge with the next free time', () => {
  it('lists booked cars after free ones with nextAvailableAt, and explains in the quote error', async () => {
    const car = await listedCar(ctx.host._id, { model: 'Verna' });
    const { token } = await renter('First Renter');
    const start = slot(48 * 60);
    const end = new Date(start.getTime() + 24 * H);
    await book(token, { vehicleId: String(car._id), startAt: start, endAt: end });
    const q = `cityId=${ctx.city._id}&startAt=${start.toISOString()}&endAt=${end.toISOString()}`;
    const plain = await api().get(`/api/v1/public/vehicles?${q}`).expect(200);
    expect(plain.body.data.find((v) => v.id === String(car._id))).toBeUndefined();
    const withBooked = await api().get(`/api/v1/public/vehicles?${q}&includeBooked=true`).expect(200);
    const row = withBooked.body.data.find((v) => v.id === String(car._id));
    expect(row.availability.available).toBe(false);
    // Free again after the trip plus the 60-minute buffer.
    expect(new Date(row.availability.nextAvailableAt).getTime()).toBe(end.getTime() + H);
    expect(withBooked.body.data.at(-1).id).toBe(String(car._id));
    const detail = await api().get(`/api/v1/public/vehicles/${car._id}?startAt=${start.toISOString()}&endAt=${end.toISOString()}`).expect(200);
    expect(detail.body.data.availability).toMatchObject({ available: false });
    expect(detail.body.data.availability.nextAvailableAt).toBeTruthy();
    const { token: other } = await renter('Second Renter');
    const quote = await api().post('/api/v1/user/bookings/quote').set(auth(other)).send({ vehicleId: String(car._id), startAt: start, endAt: end });
    expect(quote.status).toBe(409);
    expect(quote.body.error.message).toMatch(/next available from/);
    expect(quote.body.error.details.nextAvailableAt).toBeTruthy();
  });
});

describe('3. unlimited kilometres', () => {
  it('adds the per-day surcharge and waives extra-km charges at settlement', async () => {
    const { token } = await renter('Road Tripper');
    const start = slot(72 * 60);
    const body = { vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 48 * H), unlimitedKm: true };
    const quote = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send(body).expect(200);
    expect(quote.body.data.unlimitedKm).toBe(true);
    expect(quote.body.data.unlimitedKmPaise).toBe(120000);
    expect(quote.body.data.rentalPaise).toBe(480000 + 120000);
    expect(quote.body.data.lines.at(-1)).toMatchObject({ kind: 'unlimited_km', amountPaise: 120000 });
    const b = await book(token, body);
    const done = await completeTrip(b, { km: 2000 });
    expect(done.settlement.extraKm).toBe(0);
    expect(done.settlement.extraKmPaise).toBe(0);
  });

  it('rejects unlimited km on cars that do not offer it', async () => {
    const car = await listedCar(ctx.host._id, { pricing: { hourlyPaise: 20000, dailyPaise: 240000, securityDepositPaise: 0, includedKmPerDay: 240, extraKmChargePaise: 1200 } });
    const { token } = await renter('No Unlimited');
    const start = slot(72 * 60);
    const res = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ vehicleId: String(car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H), unlimitedKm: true });
    expect(res.body.error.code).toBe('UNLIMITED_KM_UNAVAILABLE');
  });
});

describe('4 + 12. security deposit options, inspection and refunds', () => {
  it('charges at least ₹15,000 as a money deposit', async () => {
    const { token } = await renter('Cash Deposit');
    const start = slot(96 * 60);
    const q = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) }).expect(200);
    expect(q.body.data.depositPaise).toBe(1500000);
    expect(q.body.data.depositOptions).toMatchObject({ selected: 'cash', cashPaise: 1500000, bike: { minYear: 2022 }, laptop: { minYear: 2023 } });
  });

  it('takes a 2022+ bike instead: no money deposit, pickup waits until the bike is received, returned after handover', async () => {
    const { token } = await renter('Bike Deposit');
    const start = slot(120 * 60);
    const base = { vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H), depositOption: 'bike' };
    const old = await api().post('/api/v1/user/bookings').set(auth(token)).send({ ...base, collateral: { make: 'Honda', model: 'Shine', year: 2019, registrationNumber: 'MP09XY1111' } });
    expect(old.body.error.code).toBe('COLLATERAL_TOO_OLD');
    const b = await book(token, { ...base, collateral: { make: 'Honda', model: 'Shine', year: 2023, registrationNumber: 'MP09 XY 1111' } });
    expect(b.pricing.depositPaise).toBe(0);
    expect(b.deposit).toMatchObject({ type: 'bike', status: 'awaiting' });
    expect(b.deposit.collateral.registrationNumber).toBe('MP09XY1111');

    const early = await api().post(`/api/v1/admin/bookings/${b._id}/collateral`).set(auth(ctx.admin)).send({ action: 'returned' });
    expect(early.body.error.code).toBe('COLLATERAL_STATE');
    // The host can mark it received at pickup.
    const rec = await api().post(`/api/v1/vendor/bookings/${b._id}/collateral`).set(auth(ctx.hostToken)).send({ action: 'received', note: 'Keys + RC copy' }).expect(200);
    expect(rec.body.data.deposit.status).toBe('received');
    const fresh = await Booking.findById(b._id);
    const done = await completeTrip(fresh);
    expect(done.settlement.depositRefundStatus).toBe('none');
    const ret = await api().post(`/api/v1/admin/bookings/${b._id}/collateral`).set(auth(ctx.admin)).send({ action: 'returned' }).expect(200);
    expect(ret.body.data.deposit.status).toBe('returned');
  });

  it('refuses pickup while a laptop deposit has not been received', async () => {
    const { token } = await renter('Laptop Deposit');
    const start = slot(180 * 60);
    const car = await listedCar(ctx.host._id, { model: 'Kona' });
    const b = await book(token, { vehicleId: String(car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H), depositOption: 'laptop', collateral: { make: 'Apple', model: 'MacBook Air M3', year: 2024, serialNumber: 'C02XYZ123' } });
    await Booking.updateOne({ _id: b._id }, { $set: { startAt: new Date(Date.now() + 10 * 60_000) } }); // pickup window is open
    const photo = await upload('user', token, 'inspection_photo');
    const res = await api().post(`/api/v1/user/bookings/${b._id}/pickup`).set(auth(token)).send({ photos: [{ fileId: photo, angle: 'front' }], odometerKm: 100, fuelEighths: 8, checklist: [], agreement: { accept: true, fullName: 'Laptop Deposit', contentHash: 'a'.repeat(64) } });
    expect(res.body.error.code).toBe('COLLATERAL_PENDING');
  });

  it('holds the money deposit for inspection; ops add charges and schedule the refund', async () => {
    const { token } = await renter('Inspection');
    const start = slot(144 * 60);
    const b = await book(token, { vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    const before = rzp.refunds.length;
    const done = await completeTrip(b, { km: 250 }); // 10 extra km × ₹12
    expect(done.settlement).toMatchObject({ depositRefundStatus: 'pending_review', extraKmPaise: 12000, depositRefundPaise: 1500000 - 12000 });
    expect(rzp.refunds.length).toBe(before); // nothing refunded yet

    const list = await api().get('/api/v1/admin/bookings?attention=deposit_review').set(auth(ctx.admin)).expect(200);
    expect(list.body.data.some((x) => x.id === String(b._id))).toBe(true);
    const detail = await api().get(`/api/v1/admin/bookings/${b._id}`).set(auth(ctx.admin)).expect(200);
    expect(detail.body.data.lateFeePerHourPaise).toBe(30000);

    const later = new Date(Date.now() + 7 * 86400_000);
    await api().post(`/api/v1/admin/bookings/${b._id}/deposit-review`).set(auth(ctx.admin)).send({ extraCharges: [{ label: 'Interior cleaning', amountPaise: 50000 }, { label: 'Late handover (2 h)', amountPaise: 60000 }], refundAt: later, note: 'Seats stained' }).expect(200);
    let after = await Booking.findById(b._id).lean();
    expect(after.settlement).toMatchObject({ depositRefundStatus: 'scheduled', totalDeductionsPaise: 12000 + 110000, depositRefundPaise: 1500000 - 122000 });
    expect(rzp.refunds.length).toBe(before);

    // The renter sees the charges and the date.
    const mine = await api().get(`/api/v1/user/bookings/${b._id}`).set(auth(token)).expect(200);
    expect(mine.body.data.settlement.extraCharges).toHaveLength(2);
    expect(mine.body.data.settlement.depositRefundAt).toBeTruthy();
    expect(mine.body.data.settlement.investorEarningPaise).toBeUndefined();

    // Re-review with a refund date of today refunds at once.
    await api().post(`/api/v1/admin/bookings/${b._id}/deposit-review`).set(auth(ctx.admin)).send({ extraCharges: [{ label: 'Interior cleaning', amountPaise: 50000 }] }).expect(200);
    after = await Booking.findById(b._id).lean();
    expect(after.settlement.depositRefundStatus).toBe('refunded');
    const refund = await Refund.findOne({ bookingId: b._id, reason: 'deposit_settlement' }).lean();
    expect(refund.amountPaise).toBe(1500000 - 62000);
    const again = await api().post(`/api/v1/admin/bookings/${b._id}/deposit-review`).set(auth(ctx.admin)).send({});
    expect(again.body.error.code).toBe('DEPOSIT_NOT_IN_REVIEW');
  });

  it('the scheduler refunds deposits whose date has come', async () => {
    const { token } = await renter('Scheduled');
    const start = slot(168 * 60);
    const b = await book(token, { vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    await completeTrip(b);
    await api().post(`/api/v1/admin/bookings/${b._id}/deposit-review`).set(auth(ctx.admin)).send({ refundAt: new Date(Date.now() + 86400_000) }).expect(200);
    await Booking.updateOne({ _id: b._id }, { $set: { 'settlement.depositRefundAt': new Date(Date.now() - 1000) } });
    await processScheduledDepositRefunds();
    const after = await Booking.findById(b._id).lean();
    expect(after.settlement.depositRefundStatus).toBe('refunded');
    expect(await Refund.exists({ bookingId: b._id, reason: 'deposit_settlement' })).toBeTruthy();
  });
});

describe('5. booking confirmation on WhatsApp / SMS with terms', () => {
  it('logs the confirmation attempt, gives staff the message and a WhatsApp link, and shows terms to the renter', async () => {
    const { token } = await renter('Message Renter');
    const start = slot(200 * 60);
    const b = await book(token, { vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    await new Promise((r) => setTimeout(r, 300));
    const logged = await Booking.findById(b._id).lean();
    expect(logged.messages.map((m) => m.channel).sort()).toEqual(['sms', 'whatsapp']);
    expect(logged.messages.every((m) => m.status === 'skipped')).toBe(true); // providers not configured in tests
    const preview = await api().get(`/api/v1/admin/bookings/${b._id}/confirmation-message`).set(auth(ctx.admin)).expect(200);
    expect(preview.body.data.text).toMatch(/Speed limit: 80 km\/h/);
    expect(preview.body.data.text).toMatch(/₹12 per extra km/);
    expect(preview.body.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/91/);
    await api().post(`/api/v1/admin/bookings/${b._id}/confirmation-message`).set(auth(ctx.admin)).expect(200);
    const mine = await api().get(`/api/v1/user/bookings/${b._id}`).set(auth(token)).expect(200);
    expect(mine.body.data.terms).toMatchObject({ speedLimitKmph: 80, kmAllowance: '240 km included' });
    expect(mine.body.data.terms.rules.length).toBeGreaterThan(0);
  });
});

describe('6 + 13. advance payments', () => {
  it('uses a separate advance percentage for Way2Cars fleet cars', async () => {
    await api().patch('/api/v1/admin/settings').set(auth(ctx.admin)).send({ advance: { percentBps: 3000, companyPercentBps: 5000 } }).expect(200);
    const company = await companyVendor();
    const fleet = await listedCar(company._id, { ownership: 'company' });
    const { token } = await renter('Advance');
    const start = slot(240 * 60);
    const body = { startAt: start, endAt: new Date(start.getTime() + 24 * H), paymentPlan: 'advance' };
    const host = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ ...body, vehicleId: String(ctx.car._id) }).expect(200);
    const own = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ ...body, vehicleId: String(fleet._id) }).expect(200);
    expect(host.body.data.advance.percentBps).toBe(3000);
    expect(own.body.data.advance.percentBps).toBe(5000);
    expect(own.body.data.advancePaise).toBe(Math.round(own.body.data.chargesPaise * 0.5));
    const b = await book(token, { ...body, vehicleId: String(fleet._id) });
    const list = await api().get('/api/v1/user/bookings').set(auth(token)).expect(200);
    const row = list.body.data.find((x) => x.id === String(b._id));
    expect(row.pricing.advancePaise).toBe(own.body.data.advancePaise);
    expect(row.payment.paidPaise).toBe(own.body.data.advancePaise);
    expect(row.balance.status).toBe('due');
  });
});

describe('7. admin uploads host documents and puts cars live', () => {
  it('uploads and approves a host’s KYC, adds a car for the host and publishes it', async () => {
    const host = await Vendor.create({ phone: '9833300099', name: 'Office Host', status: 'pending_approval' });
    const idFront = await upload('admin', ctx.admin, 'kyc_document');
    const pan = await upload('admin', ctx.admin, 'kyc_document');
    const kyc = await api().post(`/api/v1/admin/vendors/${host._id}/kyc`).set(auth(ctx.admin)).send({ idProofType: 'aadhaar', idProofNumber: '123412341234', idProofFrontFileId: idFront, panNumber: 'ABCDE1234F', panFileId: pan, dateOfBirth: '1985-01-01', approve: true }).expect(200);
    expect(kyc.body.data.status).toBe('approved');
    const car = await api().post('/api/v1/admin/vehicles').set(auth(ctx.admin)).send({
      vendorId: String(host._id), cityId: String(ctx.city._id), brandId: String(ctx.brand._id), categoryId: String(ctx.category._id), model: 'i20', year: 2023,
      registrationNumber: 'MP09OF4321', fuelType: 'petrol', transmission: 'manual', seats: 5, luggageBags: 2,
      location: { address: 'Office host garage, Indore', lat: 22.72, lng: 75.87 },
      pricing: { hourlyPaise: 15000, dailyPaise: 180000, securityDepositPaise: 300000, includedKmPerDay: 200, extraKmChargePaise: 1000 },
    }).expect(201);
    expect(car.body.data.ownership).toBe('host');
    const id = car.body.data.id;
    const photos = await Promise.all([1, 2, 3, 4].map(() => upload('admin', ctx.admin, 'vehicle_photo')));
    await api().put(`/api/v1/admin/vehicles/${id}/photos`).set(auth(ctx.admin)).send({ fileIds: photos }).expect(200);
    const doc = () => upload('admin', ctx.admin, 'vehicle_document', { pdf: true });
    const exp = new Date(Date.now() + 200 * 86400_000);
    await api().put(`/api/v1/admin/vehicles/${id}/documents`).set(auth(ctx.admin)).send({ rc: { fileId: await doc() }, insurance: { fileId: await doc(), provider: 'ICICI Lombard', type: 'comprehensive', expiry: exp }, puc: { fileId: await doc(), expiry: exp } }).expect(200);
    const blocked = await api().post(`/api/v1/admin/vehicles/${id}/publish`).set(auth(ctx.admin));
    expect(blocked.body.error.code).toBe('VENDOR_NOT_APPROVED');
    await Vendor.updateOne({ _id: host._id }, { $set: { status: 'approved' } });
    const live = await api().post(`/api/v1/admin/vehicles/${id}/publish`).set(auth(ctx.admin)).expect(200);
    expect(live.body.data).toMatchObject({ isListed: true, approval: { status: 'approved' } });
  });
});

describe('8. catalogue: models, variants and pickup points', () => {
  it('admins manage models with variants; hosts pick them; fleet renters choose pickup and drop-off points', async () => {
    const m = await api().post('/api/v1/admin/catalog/models').set(auth(ctx.admin)).send({ brandId: String(ctx.brand._id), name: 'Venue', categoryId: String(ctx.category._id), variants: [{ name: 'S(O) Turbo', fuelType: 'petrol', transmission: 'automatic', seats: 5 }, { name: 'E', fuelType: 'petrol', transmission: 'manual', seats: 5 }] }).expect(201);
    expect(m.body.data.variants).toHaveLength(2);
    const pub = await api().get(`/api/v1/public/models?brandId=${ctx.brand._id}`).expect(200);
    expect(pub.body.data.find((x) => x.name === 'Venue')).toBeTruthy();
    const otherBrand = await Brand.create({ name: 'Kia', slug: 'kia-nf' });
    const bad = await api().post('/api/v1/vendor/vehicles').set(auth(ctx.hostToken)).send({
      cityId: String(ctx.city._id), brandId: String(otherBrand._id), categoryId: String(ctx.category._id), modelId: m.body.data.id, model: 'Venue', year: 2024,
      registrationNumber: 'MP09MD1234', fuelType: 'petrol', transmission: 'manual', seats: 5, luggageBags: 2,
      location: { address: 'Host garage, Indore', lat: 22.72, lng: 75.87 },
      pricing: { hourlyPaise: 15000, dailyPaise: 180000, securityDepositPaise: 300000, includedKmPerDay: 200, extraKmChargePaise: 1000 },
    });
    expect(bad.body.error.code).toBe('MODEL_INVALID');

    const hub = await api().post('/api/v1/admin/catalog/locations').set(auth(ctx.admin)).send({ cityId: String(ctx.city._id), name: 'Way2Cars Vijay Nagar hub', address: 'Scheme 54, Vijay Nagar, Indore', lat: 22.75, lng: 75.89 }).expect(201);
    const airport = await api().post('/api/v1/admin/catalog/locations').set(auth(ctx.admin)).send({ cityId: String(ctx.city._id), name: 'Indore Airport', address: 'Devi Ahilyabai Holkar Airport', lat: 22.72, lng: 75.80, kinds: ['dropoff'] }).expect(201);
    const listed = await api().get(`/api/v1/public/locations?cityId=${ctx.city._id}`).expect(200);
    expect(listed.body.data).toHaveLength(2);

    const company = await companyVendor();
    const fleet = await listedCar(company._id, { ownership: 'company' });
    const { token } = await renter('Hub Renter');
    const start = slot(260 * 60);
    const window = { startAt: start, endAt: new Date(start.getTime() + 24 * H) };
    const wrongKind = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ ...window, vehicleId: String(fleet._id), pickupLocationId: airport.body.data.id });
    expect(wrongKind.body.error.code).toBe('HUB_INVALID');
    const hostCar = await api().post('/api/v1/user/bookings/quote').set(auth(token)).send({ ...window, vehicleId: String(ctx.car._id), pickupLocationId: hub.body.data.id });
    expect(hostCar.body.error.code).toBe('HUB_UNAVAILABLE');
    const b = await book(token, { ...window, vehicleId: String(fleet._id), pickupLocationId: hub.body.data.id, dropoffLocationId: airport.body.data.id });
    expect(b.pickup).toMatchObject({ type: 'hub', name: 'Way2Cars Vijay Nagar hub' });
    expect(b.dropoff).toMatchObject({ type: 'hub', name: 'Indore Airport' });
  });
});

describe('9. commissions and investors', () => {
  it('per-car commission overrides the host rate', async () => {
    const car = await listedCar(ctx.host._id, { model: 'Alcazar' });
    await api().patch(`/api/v1/admin/vehicles/${car._id}/commercials`).set(auth(ctx.admin)).send({ commissionBps: 2000 }).expect(200);
    const { token } = await renter('Commission');
    const start = slot(280 * 60);
    const b = await book(token, { vehicleId: String(car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    expect(b.pricing.commissionBps).toBe(2000);
    const done = await completeTrip(b);
    expect(done.settlement.vendorEarningPaise).toBe(240000 - 48000);
  });

  it('splits a fleet car between the investor and Way2Cars; cars without an investor stay 100% Way2Cars', async () => {
    const inv = await api().post('/api/v1/admin/investors').set(auth(ctx.admin)).send({ name: 'Sunil Mehta', phone: '9812345678', pan: 'ABCPM1234Q', bank: { accountHolderName: 'Sunil Mehta', accountNumber: '123456789012', ifsc: 'HDFC0001234', bankName: 'HDFC' } }).expect(201);
    expect(inv.body.data.bank.accountNumberMasked).toBe('XXXXXX9012');
    const company = await companyVendor();
    const funded = await listedCar(company._id, { ownership: 'company', model: 'Tucson' });
    const ownCar = await listedCar(company._id, { ownership: 'company', model: 'Exter' });
    const hostCar = await api().patch(`/api/v1/admin/vehicles/${ctx.car._id}/commercials`).set(auth(ctx.admin)).send({ investor: { investorId: inv.body.data.id, shareBps: 6000 } });
    expect(hostCar.body.error.code).toBe('NOT_COMPANY_FLEET');
    await api().patch(`/api/v1/admin/vehicles/${funded._id}/commercials`).set(auth(ctx.admin)).send({ investor: { investorId: inv.body.data.id, shareBps: 6000 } }).expect(200);

    const { token } = await renter('Investor Trip');
    const start = slot(300 * 60);
    const b1 = await book(token, { vehicleId: String(funded._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    expect(b1.pricing).toMatchObject({ investorShareBps: 6000 });
    const d1 = await completeTrip(b1);
    expect(d1.settlement.investorEarningPaise).toBe(144000);
    expect(d1.settlement.vendorEarningPaise).toBe(0);
    const start2 = slot(330 * 60);
    const b2 = await book(token, { vehicleId: String(ownCar._id), startAt: start2, endAt: new Date(start2.getTime() + 24 * H) });
    const d2 = await completeTrip(b2);
    expect(d2.settlement.investorEarningPaise).toBe(0);

    const detail = await api().get(`/api/v1/admin/investors/${inv.body.data.id}`).set(auth(ctx.admin)).expect(200);
    expect(detail.body.data.wallet.availablePaise).toBe(144000);
    expect(detail.body.data.cars).toHaveLength(1);
    expect(detail.body.data.ledger[0]).toMatchObject({ type: 'investor_earning', amountPaise: 144000, bookingRef: b1.ref });
    const split = await api().get(`/api/v1/admin/bookings/${b1._id}`).set(auth(ctx.admin)).expect(200);
    expect(split.body.data.split).toMatchObject({ ownership: 'company', investorPaise: 144000, ownerPaise: 0 });
    const tooMuch = await api().post(`/api/v1/admin/investors/${inv.body.data.id}/payouts`).set(auth(ctx.admin)).send({ amountPaise: 200000, utr: 'UTR99887766' });
    expect(tooMuch.body.error.code).toBe('INSUFFICIENT_BALANCE');
    await api().post(`/api/v1/admin/investors/${inv.body.data.id}/payouts`).set(auth(ctx.admin)).send({ amountPaise: 144000, utr: 'UTR99887766' }).expect(201);
    expect((await Investor.findById(inv.body.data.id).lean()).wallet).toMatchObject({ availablePaise: 0, lifetimePaidOutPaise: 144000 });
    const full = await api().get(`/api/v1/admin/investors/${inv.body.data.id}/bank-details`).set(auth(ctx.admin)).expect(200);
    expect(full.body.data.accountNumber).toBe('123456789012');
  });
});

describe('10. app analytics', () => {
  it('ingests app events and reports installs, funnel, drop-offs to call, and follow-ups', async () => {
    const { user, token } = await renter('Window Shopper');
    const now = new Date();
    await api().post('/api/v1/public/analytics/events').send({ deviceId: 'device-anon-1', platform: 'android', appVersion: '1.2.0', events: [{ event: 'app_open', at: now, sessionId: 's1', props: { firstOpen: true } }] }).expect(204);
    await api().post('/api/v1/public/analytics/events').set(auth(token)).send({
      deviceId: 'device-user-1', appVersion: '1.2.0',
      events: [
        { event: 'app_open', at: now, sessionId: 's2', props: { firstOpen: true } },
        { event: 'search', at: now, sessionId: 's2', props: { cityId: String(ctx.city._id) } },
        { event: 'vehicle_view', at: now, sessionId: 's2', props: { vehicleId: String(ctx.car._id) } },
        { event: 'checkout_start', at: now, sessionId: 's2', props: { vehicleId: String(ctx.car._id) } },
      ],
    }).expect(204);
    const bad = await api().post('/api/v1/public/analytics/events').send({ deviceId: 'x', events: [] });
    expect(bad.status).toBe(422);

    const ov = await api().get('/api/v1/admin/analytics/overview').set(auth(ctx.admin)).expect(200);
    expect(ov.body.data.installs).toBeGreaterThanOrEqual(2);
    expect(ov.body.data.funnel[2]).toMatchObject({ step: 'Started checkout', users: 1 });
    expect(ov.body.data.topViewed[0].vehicleId).toBe(String(ctx.car._id));
    expect(ov.body.data.bounceRatePct).toBe(50);

    const drops = await api().get('/api/v1/admin/analytics/drop-offs').set(auth(ctx.admin)).expect(200);
    const row = drops.body.data.find((r) => r.userId === String(user._id));
    expect(row).toMatchObject({ stage: 'Started checkout', phone: user.phone, name: 'Window Shopper' });
    await api().post('/api/v1/admin/analytics/follow-ups').set(auth(ctx.admin)).send({ userId: String(user._id), status: 'contacted', note: 'Will book next week' }).expect(201);
    const again = await api().get('/api/v1/admin/analytics/drop-offs').set(auth(ctx.admin)).expect(200);
    expect(again.body.data.find((r) => r.userId === String(user._id)).followUp.status).toBe('contacted');
    const act = await api().get(`/api/v1/admin/analytics/users/${user._id}/activity`).set(auth(ctx.admin)).expect(200);
    expect(act.body.data.events.length).toBe(4);
  });
});

describe('11. wallet credits and debits by admins', () => {
  it('requires a reason, records category, booking and admin, and lists the history', async () => {
    const { user, token } = await renter('Wallet Renter');
    const noReason = await api().post(`/api/v1/admin/users/${user._id}/wallet-adjustment`).set(auth(ctx.admin)).send({ amountPaise: 50000, reason: '' });
    expect(noReason.status).toBe(422);
    await api().post(`/api/v1/admin/users/${user._id}/wallet-adjustment`).set(auth(ctx.admin)).send({ direction: 'credit', category: 'refund', amountPaise: 50000, reason: 'Refund for AC not working' }).expect(200);
    const tooMuch = await api().post(`/api/v1/admin/users/${user._id}/wallet-adjustment`).set(auth(ctx.admin)).send({ direction: 'debit', amountPaise: 90000, reason: 'Correction of wrong credit' });
    expect(tooMuch.body.error.code).toBe('WALLET_INSUFFICIENT');
    await api().post(`/api/v1/admin/users/${user._id}/wallet-adjustment`).set(auth(ctx.admin)).send({ direction: 'debit', category: 'adjustment', amountPaise: 10000, reason: 'Correction of duplicate credit' }).expect(200);
    expect((await User.findById(user._id).lean()).walletBalancePaise).toBe(40000);
    const hist = await api().get(`/api/v1/admin/users/${user._id}/wallet`).set(auth(ctx.admin)).expect(200);
    expect(hist.body.data).toHaveLength(2);
    expect(hist.body.data[1]).toMatchObject({ direction: 'credit', category: 'refund', note: 'Refund for AC not working', createdBy: { realm: 'admin', name: 'Asha Admin' } });
    const all = await api().get('/api/v1/admin/wallet/transactions?category=refund').set(auth(ctx.admin)).expect(200);
    expect(all.body.data.find((r) => r.user.id === String(user._id))).toBeTruthy();
    const mine = await api().get('/api/v1/user/wallet').set(auth(token));
    if (mine.status === 200) expect(JSON.stringify(mine.body.data)).toMatch(/Refund for AC not working/);
    expect(await LedgerEntry.countDocuments({ 'owner.id': user._id, type: 'admin_adjustment' })).toBe(2);
  });
});

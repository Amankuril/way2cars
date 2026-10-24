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
const { Vendor, VendorBankAccount } = await import('../src/modules/vendors/vendor.model.js');
const { AdminUser } = await import('../src/modules/admin/admin.model.js');
const { City, Brand, Category } = await import('../src/modules/catalog/catalog.model.js');
const { CmsPage } = await import('../src/modules/cms/cms.model.js');
const { Vehicle } = await import('../src/modules/vehicles/vehicle.model.js');
const { Booking } = await import('../src/modules/bookings/booking.model.js');
const { Refund } = await import('../src/modules/payments/payment.model.js');
const { LedgerEntry } = await import('../src/modules/wallet/wallet.model.js');
const { finalizeTrip } = await import('../src/modules/trips/trip.service.js');
const { processBalances } = await import('../src/modules/bookings/booking.service.js');
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
let regSeq = 1000;

async function listedCar(vendorId, over = {}) {
  const v = await Vehicle.create({
    vendorId, cityId: ctx.city._id, brandId: ctx.brand._id, categoryId: ctx.category._id, model: 'Nexon', year: 2023,
    registrationNumber: `MP09AB${regSeq++}`, fuelType: 'petrol', transmission: 'manual', seats: 5,
    location: { address: 'Vijay Nagar, Indore', point: { type: 'Point', coordinates: [75.89, 22.75] } },
    pricing: { hourlyPaise: 20000, dailyPaise: 200000, securityDepositPaise: 300000, includedKmPerDay: 200, extraKmChargePaise: 1000 },
    instantBooking: true, approval: { status: 'approved' }, status: 'active', isListed: true, ...over,
  });
  return v;
}

async function renter(phone, name) {
  const u = await User.create({ phone, name, referralCode: `W2C${phone.slice(-6)}`, profileCompleted: true, kyc: { status: 'approved', licenceExpiry: new Date(Date.now() + 1000 * 86400_000) } });
  return { user: u, token: await tokenFor('user', u) };
}

beforeAll(async () => {
  ctx.city = await City.create({ name: 'Indore', slug: 'indore-ops', gstStateCode: '23', center: { type: 'Point', coordinates: [75.86, 22.72] }, serviceRadiusKm: 30 });
  ctx.brand = await Brand.create({ name: 'Tata', slug: 'tata-ops' });
  ctx.category = await Category.create({ name: 'Compact SUV', slug: 'compact-suv-ops', bodyType: 'suv' });
  await CmsPage.create({ slug: 'rental-agreement', title: 'Rental Agreement', blocks: [{ type: 'paragraph', text: 'Test agreement' }] });
  const admin = await AdminUser.create({ email: 'ops-features@test.in', name: 'Ops', role: 'super_admin', passwordHash: 'x' });
  ctx.admin = await tokenFor('admin', admin);
  const ops = await AdminUser.create({ email: 'ops-team@test.in', name: 'Ops team', role: 'operations', passwordHash: 'x' });
  ctx.ops = await tokenFor('admin', ops);
  ctx.host = await Vendor.create({ phone: '9822200001', name: 'Ravi', status: 'approved', kyc: { status: 'approved' } });
  ctx.hostToken = await tokenFor('vendor', ctx.host);
  ctx.car = await listedCar(ctx.host._id);
  ({ user: ctx.user, token: ctx.userToken } = await renter('9822200002', 'Meera Joshi'));
});

describe('commission and host settlements', () => {
  it('defaults Way2Cars commission to 30% and lets finance override it per host', async () => {
    const s = await api().get('/api/v1/admin/settings').set(auth(ctx.admin)).expect(200);
    expect(s.body.data.commissionBps).toBe(3000);
    const res = await api().patch(`/api/v1/admin/vendors/${ctx.host._id}/commission`).set(auth(ctx.admin)).send({ commissionBps: 3500 }).expect(200);
    expect(res.body.data.effectiveCommissionBps).toBe(3500);
    const denied = await api().patch(`/api/v1/admin/vendors/${ctx.host._id}/commission`).set(auth(ctx.ops)).send({ commissionBps: 4000 });
    expect(denied.status).toBe(403);
  });

  it('admin enters the host bank account (verified) and finance can read it in full', async () => {
    const proof = await upload('admin', ctx.admin, 'bank_proof');
    await api().put(`/api/v1/admin/vendors/${ctx.host._id}/bank`).set(auth(ctx.admin)).send({ accountHolderName: 'Ravi Kumar', accountNumber: '998877665544', confirmAccountNumber: '998877665544', ifsc: 'SBIN0001234', bankName: 'SBI', proofFileId: proof }).expect(200);
    const bank = await VendorBankAccount.findOne({ vendorId: ctx.host._id, isActive: true }).lean();
    expect(bank.verification.status).toBe('verified');
    const full = await api().get(`/api/v1/admin/vendors/${ctx.host._id}/bank/details`).set(auth(ctx.admin)).expect(200);
    expect(full.body.data.accountNumber).toBe('998877665544');
  });

  it('snapshots the host commission on the booking and splits earnings on settlement', async () => {
    const start = slot(30 * 60);
    const res = await api().post('/api/v1/user/bookings').set(auth(ctx.userToken)).send({ vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) }).expect(201);
    await pay(ctx.userToken, res.body.data.payment);
    const b = await Booking.findById(res.body.data.booking.id);
    expect(b.pricing.commissionBps).toBe(3500);
    expect(b.status).toBe('confirmed');
    // Fast-forward through the trip.
    Object.assign(b, { status: 'return_pending', trip: { startOdometerKm: 1000, endOdometerKm: 1100, startFuelEighths: 8, endFuelEighths: 8, returnSubmittedAt: b.endAt } });
    await b.save();
    await withTransaction((session) => finalizeTrip(b._id, { by: { realm: 'system' } }, session));
    const done = await Booking.findById(b._id).lean();
    expect(done.settlement.vendorEarningPaise).toBe(200000 - 70000);
    const detail = await api().get(`/api/v1/admin/bookings/${b._id}`).set(auth(ctx.admin)).expect(200);
    expect(detail.body.data.split).toMatchObject({ ownership: 'host', ownerPaise: 130000, status: 'settled' });
    ctx.settledBookingId = String(b._id);
  });

  it('reports booking-wise splits and host balances; finance settles a host directly', async () => {
    const from = new Date(Date.now() - 86400_000).toISOString();
    const to = new Date(Date.now() + 5 * 86400_000).toISOString();
    const rep = await api().get(`/api/v1/admin/reports/settlements?from=${from}&to=${to}`).set(auth(ctx.admin)).expect(200);
    const row = rep.body.data.rows.find((r) => r.bookingId === ctx.settledBookingId);
    expect(row).toMatchObject({ ownerSharePaise: 130000, ownerPayout: 'on_hold', commissionBps: 3500 });
    // Release the hold, then settle.
    await LedgerEntry.updateMany({ 'owner.id': ctx.host._id, type: 'trip_earning' }, { $set: { releaseAt: new Date(Date.now() - 1000) } });
    const { releaseDueEarnings } = await import('../src/modules/payouts/payout.routes.js');
    await releaseDueEarnings();
    const balances = await api().get('/api/v1/admin/reports/host-balances').set(auth(ctx.admin)).expect(200);
    expect(balances.body.data.rows.find((r) => r.vendorId === String(ctx.host._id)).availablePaise).toBe(130000);
    await api().post('/api/v1/admin/payouts/settle').set(auth(ctx.admin)).send({ vendorId: String(ctx.host._id), amountPaise: 130000, utr: 'UTR12345678' }).expect(201);
    const host = await Vendor.findById(ctx.host._id).lean();
    expect(host.wallet).toMatchObject({ availablePaise: 0, lifetimePaidOutPaise: 130000 });
  });
});

describe('company fleet', () => {
  it('admin adds a company car, publishes it, and it is listed as company-owned', async () => {
    const body = {
      cityId: String(ctx.city._id), brandId: String(ctx.brand._id), categoryId: String(ctx.category._id), model: 'Harrier', year: 2024,
      registrationNumber: 'MP09ZZ0001', fuelType: 'diesel', transmission: 'automatic', seats: 5, luggageBags: 3,
      location: { address: 'Way2Cars hub, AB Road, Indore', lat: 22.74, lng: 75.88 },
      pricing: { hourlyPaise: 30000, dailyPaise: 350000, securityDepositPaise: 500000, includedKmPerDay: 250, extraKmChargePaise: 1500 },
      instantBooking: true,
    };
    const created = await api().post('/api/v1/admin/vehicles').set(auth(ctx.admin)).send(body).expect(201);
    const id = created.body.data.id;
    expect(created.body.data.ownership).toBe('company');
    const early = await api().post(`/api/v1/admin/vehicles/${id}/publish`).set(auth(ctx.admin));
    expect(early.body.error.code).toBe('VEHICLE_INCOMPLETE');
    const photos = [];
    for (let i = 0; i < 4; i++) photos.push(await upload('admin', ctx.admin, 'vehicle_photo'));
    await api().put(`/api/v1/admin/vehicles/${id}/photos`).set(auth(ctx.admin)).send({ fileIds: photos }).expect(200);
    const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString();
    await api().put(`/api/v1/admin/vehicles/${id}/documents`).set(auth(ctx.admin)).send({
      rc: { fileId: await upload('admin', ctx.admin, 'vehicle_document', { pdf: true }) },
      insurance: { fileId: await upload('admin', ctx.admin, 'vehicle_document'), provider: 'Tata AIG', type: 'comprehensive', expiry: nextYear },
      puc: { fileId: await upload('admin', ctx.admin, 'vehicle_document'), expiry: nextYear },
    }).expect(200);
    const live = await api().post(`/api/v1/admin/vehicles/${id}/publish`).set(auth(ctx.admin)).expect(200);
    expect(live.body.data.isListed).toBe(true);
    const list = await api().get('/api/v1/admin/vehicles?ownership=company').set(auth(ctx.admin)).expect(200);
    expect(list.body.data.map((v) => v.id)).toEqual([id]);
    const hosts = await api().get('/api/v1/admin/vendors').set(auth(ctx.admin)).expect(200);
    expect(hosts.body.data.some((h) => h.isCompany)).toBe(false); // the internal fleet account is not a host
    ctx.companyCar = id;
  });

  it('admin edits pricing and blocks dates on any car', async () => {
    await api().patch(`/api/v1/admin/vehicles/${ctx.companyCar}`).set(auth(ctx.admin)).send({ pricing: { hourlyPaise: 32000, dailyPaise: 380000, securityDepositPaise: 500000, includedKmPerDay: 250, extraKmChargePaise: 1500 } }).expect(200);
    const start = slot(10 * 24 * 60);
    await api().post(`/api/v1/admin/vehicles/${ctx.companyCar}/blocks`).set(auth(ctx.admin)).send({ startAt: start, endAt: new Date(start.getTime() + 24 * H), reason: 'maintenance' }).expect(201);
    const q = await api().post('/api/v1/user/bookings/quote').set(auth(ctx.userToken)).send({ vehicleId: ctx.companyCar, startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    expect(q.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });

  it('company-car bookings keep all revenue with Way2Cars', async () => {
    const start = slot(4 * 24 * 60);
    const res = await api().post('/api/v1/user/bookings').set(auth(ctx.userToken)).send({ vehicleId: ctx.companyCar, startAt: start, endAt: new Date(start.getTime() + 24 * H) }).expect(201);
    await pay(ctx.userToken, res.body.data.payment);
    const b = await Booking.findById(res.body.data.booking.id);
    expect(b.ownership).toBe('company');
    expect(b.pricing.commissionBps).toBe(10000);
    Object.assign(b, { status: 'return_pending', trip: { startOdometerKm: 10, endOdometerKm: 50, startFuelEighths: 8, endFuelEighths: 8, returnSubmittedAt: b.endAt } });
    await b.save();
    await api().post(`/api/v1/admin/bookings/${b._id}/return-review`).set(auth(ctx.admin)).send({ decision: 'accept' }).expect(200);
    const done = await Booking.findById(b._id).lean();
    expect(done.status).toBe('completed');
    expect(done.settlement.vendorEarningPaise).toBe(0);
    expect(await LedgerEntry.exists({ bookingId: b._id, type: 'trip_earning' })).toBeNull();
  });
});

describe('advance payment', () => {
  it('quotes a 30% advance and books with it; the balance stays due', async () => {
    ({ user: ctx.advUser, token: ctx.advToken } = await renter('9822200010', 'Kabir'));
    ctx.advStart = slot(6 * 24 * 60);
    const body = { vehicleId: String(ctx.car._id), startAt: ctx.advStart, endAt: new Date(ctx.advStart.getTime() + 48 * H) };
    const q = await api().post('/api/v1/user/bookings/quote').set(auth(ctx.advToken)).send(body).expect(200);
    const { advance, chargesPaise, payablePaise } = q.body.data;
    expect(advance.available).toBe(true);
    expect(advance.advancePaise).toBe(Math.round(chargesPaise * 0.3));
    expect(advance.balancePaise).toBe(payablePaise - advance.advancePaise);
    const res = await api().post('/api/v1/user/bookings').set(auth(ctx.advToken)).send({ ...body, paymentPlan: 'advance' }).expect(201);
    expect(res.body.data.payment.amountPaise).toBe(advance.advancePaise);
    await pay(ctx.advToken, res.body.data.payment);
    const b = await api().get(`/api/v1/user/bookings/${res.body.data.booking.id}`).set(auth(ctx.advToken)).expect(200);
    expect(b.body.data.status).toBe('confirmed'); // dates are blocked
    expect(b.body.data.balance).toMatchObject({ status: 'due', duePaise: advance.balancePaise });
    ctx.advBooking = b.body.data;
    // Nobody else can take those dates.
    const other = await api().post('/api/v1/user/bookings/quote').set(auth(ctx.userToken)).send(body);
    expect(other.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });

  it('cancelling with only the advance paid refunds per policy from what was paid', async () => {
    const preview = await api().get(`/api/v1/user/bookings/${ctx.advBooking.id}/cancellation-preview`).set(auth(ctx.advToken)).expect(200);
    // More than 24 h out: 100% of charges refundable → the whole advance comes back, balance is waived.
    expect(preview.body.data.refundToSourcePaise).toBe(ctx.advBooking.pricing.advancePaise);
    expect(preview.body.data.balanceWaivedPaise).toBe(ctx.advBooking.balance.duePaise);
  });

  it('pickup is refused until the balance is paid; paying it clears the balance', async () => {
    const photo = await upload('user', ctx.advToken, 'inspection_photo');
    const pickup = await api().post(`/api/v1/user/bookings/${ctx.advBooking.id}/pickup`).set(auth(ctx.advToken)).send({ photos: [{ fileId: photo, angle: 'front' }], odometerKm: 1, fuelEighths: 8, checklist: [], agreement: { accept: true, fullName: 'Kabir', contentHash: 'a'.repeat(64) } });
    expect(pickup.body.error.code).toBe('BALANCE_DUE');
    const order = await api().post(`/api/v1/user/bookings/${ctx.advBooking.id}/balance-payment-order`).set(auth(ctx.advToken)).expect(200);
    expect(order.body.data.amountPaise).toBe(ctx.advBooking.balance.duePaise);
    await pay(ctx.advToken, order.body.data);
    const b = await Booking.findById(ctx.advBooking.id).lean();
    expect(b.balance.status).toBe('paid');
    expect(b.payment.paidPaise).toBe(b.pricing.payablePaise);
  });

  it('cancels unpaid advance bookings at pickup time and keeps what the policy allows', async () => {
    const { token } = await renter('9822200011', 'Isha');
    const start = slot(3 * 24 * 60);
    const res = await api().post('/api/v1/user/bookings').set(auth(token)).send({ vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H), paymentPlan: 'advance' }).expect(201);
    await pay(token, res.body.data.payment);
    await Booking.updateOne({ _id: res.body.data.booking.id }, { $set: { startAt: new Date(Date.now() - 60_000) } });
    await processBalances();
    const b = await Booking.findById(res.body.data.booking.id).lean();
    expect(b.status).toBe('cancelled');
    expect(b.balance.status).toBe('waived');
    expect(b.cancellation.refundPaise).toBe(0); // 0% refund tier at pickup time → advance retained
  });
});

describe('extensions', () => {
  beforeAll(async () => {
    ({ token: ctx.extToken } = await renter('9822200020', 'Dev'));
    const start = slot(9 * 24 * 60);
    const res = await api().post('/api/v1/user/bookings').set(auth(ctx.extToken)).send({ vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) }).expect(201);
    await pay(ctx.extToken, res.body.data.payment);
    ctx.ext = res.body.data.booking;
    ctx.extEnd = new Date(start.getTime() + 24 * H);
  });

  it('a renter request waits for operations approval, with the extra time held', async () => {
    const res = await api().post(`/api/v1/user/bookings/${ctx.ext.id}/extensions`).set(auth(ctx.extToken)).send({ endAt: new Date(ctx.extEnd.getTime() + 6 * H) }).expect(201);
    expect(res.body.data.extension.status).toBe('pending_approval');
    expect(res.body.data.payment).toBeNull();
    const queue = await api().get('/api/v1/admin/bookings?attention=extension_requests').set(auth(ctx.ops)).expect(200);
    expect(queue.body.data.map((b) => b.id)).toContain(ctx.ext.id);
    const check = await api().get(`/api/v1/admin/bookings/${ctx.ext.id}/extension-check?endAt=${new Date(ctx.extEnd.getTime() + 6 * H).toISOString()}`).set(auth(ctx.ops)).expect(200);
    expect(check.body.data.available).toBe(true);
    ctx.extId = res.body.data.extension.id;
  });

  it('approval moves the return time in the renter app and leaves the charge due; paying clears it', async () => {
    await api().post(`/api/v1/admin/bookings/${ctx.ext.id}/extensions/${ctx.extId}/decision`).set(auth(ctx.ops)).send({ decision: 'approve' }).expect(200);
    const b = await api().get(`/api/v1/user/bookings/${ctx.ext.id}`).set(auth(ctx.extToken)).expect(200);
    expect(new Date(b.body.data.endAt).getTime()).toBe(ctx.extEnd.getTime() + 6 * H);
    const ext = b.body.data.extensions.find((e) => e.id === ctx.extId);
    expect(ext).toMatchObject({ status: 'approved', chargeStatus: 'due' });
    const order = await api().post(`/api/v1/user/bookings/${ctx.ext.id}/extensions/${ctx.extId}/payment-order`).set(auth(ctx.extToken)).expect(200);
    expect(order.body.data.amountPaise).toBe(ext.pricing.totalPaise);
    await pay(ctx.extToken, order.body.data);
    const after = await Booking.findById(ctx.ext.id).lean();
    expect(after.extensions[0].chargeStatus).toBe('paid');
  });

  it('rejection releases the held time', async () => {
    const end = new Date(ctx.extEnd.getTime() + 12 * H);
    const res = await api().post(`/api/v1/user/bookings/${ctx.ext.id}/extensions`).set(auth(ctx.extToken)).send({ endAt: end }).expect(201);
    await api().post(`/api/v1/admin/bookings/${ctx.ext.id}/extensions/${res.body.data.extension.id}/decision`).set(auth(ctx.ops)).send({ decision: 'reject', reason: 'Car is booked for service' }).expect(200);
    const b = await Booking.findById(ctx.ext.id).lean();
    expect(b.blockEndAt.getTime()).toBe(b.endAt.getTime());
    expect(b.extensions.at(-1).status).toBe('rejected');
  });

  it('requests closer than 12 hours to the return time are refused', async () => {
    await Booking.updateOne({ _id: ctx.ext.id }, { $set: { endAt: new Date(Date.now() + 6 * H), blockEndAt: new Date(Date.now() + 6 * H) } });
    const res = await api().post(`/api/v1/user/bookings/${ctx.ext.id}/extensions`).set(auth(ctx.extToken)).send({ endAt: slot(24 * 60) });
    expect(res.body.error.code).toBe('EXTENSION_TOO_LATE');
  });

  it('operations can extend directly, recording an office payment, but never over another booking', async () => {
    const b0 = await Booking.findById(ctx.ext.id).lean();
    const newEnd = new Date(Math.ceil((b0.endAt.getTime() + 3 * H) / (30 * 60_000)) * 30 * 60_000);
    const res = await api().post(`/api/v1/admin/bookings/${ctx.ext.id}/extensions`).set(auth(ctx.ops)).send({ endAt: newEnd, charge: 'paid_offline', method: 'cash' }).expect(200);
    expect(new Date(res.body.data.endAt).getTime()).toBe(newEnd.getTime());
    expect(res.body.data.extensions.at(-1)).toMatchObject({ status: 'approved', chargeStatus: 'paid' });
    // Another renter takes the slot right after; extending into it is refused.
    const { token } = await renter('9822200021', 'Tara');
    const nextStart = new Date(newEnd.getTime() + 4 * H);
    const nb = await api().post('/api/v1/user/bookings').set(auth(token)).send({ vehicleId: String(ctx.car._id), startAt: nextStart, endAt: new Date(nextStart.getTime() + 24 * H) }).expect(201);
    await pay(token, nb.body.data.payment);
    const clash = await api().post(`/api/v1/admin/bookings/${ctx.ext.id}/extensions`).set(auth(ctx.ops)).send({ endAt: new Date(nextStart.getTime() + 2 * H), charge: 'waive' });
    expect(clash.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });
});

describe('offline (office) bookings', () => {
  it('creates a confirmed booking for a walk-in by mobile number, visible once they sign in', async () => {
    const start = slot(12 * 24 * 60);
    ctx.offStart = start;
    const quote = await api().post('/api/v1/admin/bookings/offline/quote').set(auth(ctx.ops)).send({ vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) }).expect(200);
    expect(quote.body.data.available).toBe(true);
    const res = await api().post('/api/v1/admin/bookings/offline').set(auth(ctx.ops)).send({
      phone: '9822200030', name: 'Walk-in Wasim', vehicleId: String(ctx.car._id), startAt: start, endAt: new Date(start.getTime() + 24 * H),
      pricing: { rentalPaise: 180000, note: 'Corporate rate' }, payment: { status: 'partial', amountPaise: 100000, method: 'cash' },
    }).expect(201);
    expect(res.body.data).toMatchObject({ status: 'confirmed', source: 'offline' });
    expect(res.body.data.pricing.rentalPaise).toBe(180000);
    ctx.offline = res.body.data;
    const user = await User.findOne({ phone: '9822200030' }).lean();
    expect(user.name).toBe('Walk-in Wasim');
    const t = await tokenFor('user', user);
    const mine = await api().get('/api/v1/user/bookings').set(auth(t)).expect(200);
    expect(mine.body.data[0]).toMatchObject({ id: ctx.offline.id, balance: { status: 'due', duePaise: res.body.data.pricing.payablePaise - 100000 } });
    ctx.offlineToken = t;
  });

  it('shares availability with app bookings: no double booking either way', async () => {
    const body = { vehicleId: String(ctx.car._id), startAt: ctx.offStart, endAt: new Date(ctx.offStart.getTime() + 24 * H) };
    const app = await api().post('/api/v1/user/bookings/quote').set(auth(ctx.userToken)).send(body);
    expect(app.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    const office = await api().post('/api/v1/admin/bookings/offline').set(auth(ctx.ops)).send({ ...body, phone: '9822200031', payment: { status: 'unpaid' } });
    expect(office.body.error.code).toBe('VEHICLE_UNAVAILABLE');
  });

  it('the balance can be collected at the office', async () => {
    const res = await api().post(`/api/v1/admin/bookings/${ctx.offline.id}/office-payments`).set(auth(ctx.ops)).send({ purpose: 'balance', method: 'upi', reference: 'UPI998877' }).expect(200);
    expect(res.body.data.balance.status).toBe('paid');
    expect(res.body.data.payment.paidPaise).toBe(res.body.data.pricing.payablePaise);
  });

  it('cancelling refunds office-collected money as a manual refund for finance', async () => {
    await api().post(`/api/v1/admin/bookings/${ctx.offline.id}/cancel`).set(auth(ctx.ops)).send({ reason: 'Customer changed plans' }).expect(200);
    const refunds = await Refund.find({ bookingId: ctx.offline.id }).lean();
    expect(refunds.length).toBeGreaterThan(0);
    expect(refunds.every((r) => r.status === 'manual')).toBe(true);
    await api().post(`/api/v1/admin/bookings/${ctx.offline.id}/refunds/${refunds[0]._id}/manual-processed`).set(auth(ctx.admin)).send({ reference: 'CASH-RET-1' }).expect(200);
    expect((await Refund.findById(refunds[0]._id).lean()).status).toBe('processed');
  });
});

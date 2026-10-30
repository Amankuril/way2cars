import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'node:crypto';

// WhatsApp through Textora (BUZWAP), with a 2-variable template like the client's "service_confirmation".
vi.hoisted(() => {
  Object.assign(process.env, {
    WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'textora', WHATSAPP_BOOKING_TEMPLATE: 'service_confirmation', WHATSAPP_BOOKING_PARAMS: 'name,ref',
    TEXTORA_FROM: 'BUZWAP', TEXTORA_AUTHKEY: 'test-authkey', TEXTORA_BUSINESS_ACCOUNT_ID: '918000000000000',
  });
});

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

const { api, useDb, auth, tokenFor, slot } = await import('./helpers.js');
const { User } = await import('../src/modules/users/user.model.js');
const { Vendor } = await import('../src/modules/vendors/vendor.model.js');
const { AdminUser } = await import('../src/modules/admin/admin.model.js');
const { City, Brand, Category } = await import('../src/modules/catalog/catalog.model.js');
const { Vehicle, VehicleBlock } = await import('../src/modules/vehicles/vehicle.model.js');
const { Booking } = await import('../src/modules/bookings/booking.model.js');
const { Refund } = await import('../src/modules/payments/payment.model.js');
const { LedgerEntry } = await import('../src/modules/wallet/wallet.model.js');
const { Settings } = await import('../src/modules/settings/settings.model.js');
const { invalidateSettings } = await import('../src/modules/settings/settings.service.js');
const { finalizeTrip } = await import('../src/modules/trips/trip.service.js');
const { withTransaction } = await import('../src/core/db.js');
const { parseWhatsappResponse } = await import('../src/integrations/whatsapp.js');

useDb();

const sign = (orderId, paymentId) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
async function pay(token, order) {
  const id = `pay_${crypto.randomBytes(7).toString('hex')}`;
  rzp.payments.set(id, { id, order_id: order.orderId, amount: order.amountPaise, currency: 'INR', status: 'captured', method: 'upi', created_at: Math.floor(Date.now() / 1000) });
  return api().post('/api/v1/user/bookings/payments/verify').set(auth(token)).send({ razorpayOrderId: order.orderId, razorpayPaymentId: id, razorpaySignature: sign(order.orderId, id) }).expect(200);
}

const ctx = {};
const H = 3600_000;
let seq = 100;
const car = (over = {}) => Vehicle.create({
  vendorId: ctx.host._id, cityId: ctx.city._id, brandId: ctx.brand._id, categoryId: ctx.category._id, model: 'Ertiga', year: 2024,
  registrationNumber: `MP09AD${1000 + seq++}`, fuelType: 'petrol', transmission: 'manual', seats: 5,
  location: { address: 'Palasia, Indore', point: { type: 'Point', coordinates: [75.88, 22.72] } },
  pricing: { hourlyPaise: 20000, dailyPaise: 200000, securityDepositPaise: 0, includedKmPerDay: 240, extraKmChargePaise: 1000 },
  instantBooking: true, approval: { status: 'approved' }, status: 'active', isListed: true, ...over,
});
async function renter(name) {
  const phone = `98444${String(seq++).padStart(5, '0')}`;
  const u = await User.create({ phone, name, referralCode: `W2CAD${phone.slice(-5)}`, profileCompleted: true, kyc: { status: 'approved', licenceExpiry: new Date(Date.now() + 1000 * 86400_000) } });
  return { user: u, token: await tokenFor('user', u) };
}
async function book(token, body) {
  const res = await api().post('/api/v1/user/bookings').set(auth(token)).send(body);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  await pay(token, res.body.data.payment);
  return Booking.findById(res.body.data.booking.id);
}

beforeAll(async () => {
  await Settings.create({ _id: 'platform', deposit: { minCashPaise: 0, requireRefundApproval: true } });
  invalidateSettings();
  ctx.city = await City.create({ name: 'Indore', slug: 'indore-ad', gstStateCode: '23', center: { type: 'Point', coordinates: [75.86, 22.72] }, serviceRadiusKm: 30 });
  ctx.brand = await Brand.create({ name: 'Maruti', slug: 'maruti-ad' });
  ctx.category = await Category.create({ name: 'MUV', slug: 'muv-ad', bodyType: 'muv' });
  const admin = await AdminUser.create({ email: 'ad-admin@test.in', name: 'Asha', role: 'super_admin', passwordHash: 'x' });
  ctx.admin = await tokenFor('admin', admin);
  ctx.host = await Vendor.create({ phone: '9844400001', name: 'Host', status: 'approved', kyc: { status: 'approved' } });
});

describe('office booking: cars free for the chosen period', () => {
  it('lists only cars free for the whole window, filtered to 5 or 7 seaters', async () => {
    const five = await car({ seats: 5, model: 'Swift' });
    const seven = await car({ seats: 7, model: 'Ertiga' });
    const busySeven = await car({ seats: 7, model: 'Innova' });
    const blocked = await car({ seats: 5, model: 'Baleno' });
    const start = slot(30 * 60);
    const end = new Date(start.getTime() + 24 * H);
    const { token } = await renter('Busy maker');
    await book(token, { vehicleId: String(busySeven._id), startAt: start, endAt: end });
    await VehicleBlock.create({ vehicleId: blocked._id, vendorId: ctx.host._id, startAt: start, endAt: end });
    const q = `startAt=${start.toISOString()}&endAt=${end.toISOString()}`;
    const all = await api().get(`/api/v1/admin/bookings/offline/available-cars?${q}`).set(auth(ctx.admin)).expect(200);
    const ids = all.body.data.map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining([String(five._id), String(seven._id)]));
    expect(ids).not.toContain(String(busySeven._id));
    expect(ids).not.toContain(String(blocked._id));
    expect(all.body.data[0].estimate.rentalPaise).toBe(200000);
    const sevens = await api().get(`/api/v1/admin/bookings/offline/available-cars?${q}&seats=7`).set(auth(ctx.admin)).expect(200);
    expect(sevens.body.data.map((v) => v.id)).toEqual([String(seven._id)]);
    const fives = await api().get(`/api/v1/admin/bookings/offline/available-cars?${q}&seats=5`).set(auth(ctx.admin)).expect(200);
    expect(fives.body.data.every((v) => v.seats === 5)).toBe(true);
  });
});

describe('payment adjustments', () => {
  it('reduces the balance first, then refunds the rest to the wallet, with a reason and history', async () => {
    const c = await car();
    const { user, token } = await renter('Breakdown');
    const start = slot(72 * 60);
    const b = await book(token, { vehicleId: String(c._id), startAt: start, endAt: new Date(start.getTime() + 24 * H), paymentPlan: 'advance' });
    const due = b.balance.duePaise;
    const paid = b.payment.paidPaise;
    expect(due).toBeGreaterThan(0);
    const noReason = await api().post(`/api/v1/admin/bookings/${b._id}/adjustments`).set(auth(ctx.admin)).send({ amountPaise: 1000, reason: '' });
    expect(noReason.status).toBe(422);
    const tooMuch = await api().post(`/api/v1/admin/bookings/${b._id}/adjustments`).set(auth(ctx.admin)).send({ amountPaise: b.pricing.chargesPaise + 100, reason: 'Way too much' });
    expect(tooMuch.body.error.code).toBe('ADJUSTMENT_TOO_LARGE');
    const amount = due + 5000;
    const res = await api().post(`/api/v1/admin/bookings/${b._id}/adjustments`).set(auth(ctx.admin)).send({ amountPaise: amount, reason: 'AC failed on the highway (company fault)', refundTo: 'wallet' }).expect(200);
    expect(res.body.data.adjustments[0]).toMatchObject({ amountPaise: amount, balancePaise: due, refundPaise: 5000, refundTo: 'wallet', reason: 'AC failed on the highway (company fault)' });
    expect(res.body.data.balance.status).toBe('waived');
    expect(res.body.data.pricing.adjustmentPaise).toBe(amount);
    expect((await User.findById(user._id).lean()).walletBalancePaise).toBe(5000);
    const refund = await Refund.findOne({ bookingId: b._id, reason: 'price_adjustment' }).lean();
    expect(refund).toMatchObject({ destination: 'wallet', status: 'processed', amountPaise: 5000 });
    expect(rzp.refunds.find((r) => r.receipt === String(refund._id))).toBeUndefined(); // nothing sent to the gateway
    const after = await Booking.findById(b._id).lean();
    expect(after.payment.refundedPaise).toBe(5000);
    expect(paid - after.payment.refundedPaise).toBe(paid - 5000);
    const entry = await LedgerEntry.findOne({ 'owner.id': user._id, type: 'booking_refund' }).lean();
    expect(entry).toMatchObject({ amountPaise: 5000, category: 'refund', bookingId: b._id });
    const mine = await api().get(`/api/v1/user/bookings/${b._id}`).set(auth(token)).expect(200);
    expect(mine.body.data.adjustments[0].reason).toBe('AC failed on the highway (company fault)');
    expect(mine.body.data.refunds[0].destination).toBe('wallet');
    const host = await api().get(`/api/v1/vendor/bookings/${b._id}`).set(auth(await tokenFor('vendor', ctx.host))).expect(200);
    expect(host.body.data.adjustments).toEqual([]);
  });

  it('refunds to the original payment and lowers dues after the trip; host earnings stay the same', async () => {
    const c = await car();
    const { token } = await renter('Source refund');
    const start = slot(100 * 60);
    const b = await book(token, { vehicleId: String(c._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    Object.assign(b, { status: 'return_pending', trip: { startOdometerKm: 1000, endOdometerKm: 1500, startFuelEighths: 8, endFuelEighths: 8, returnSubmittedAt: b.endAt } });
    await b.save();
    await withTransaction((session) => finalizeTrip(b._id, { by: { realm: 'system' } }, session));
    const settled = await Booking.findById(b._id).lean();
    expect(settled.settlement.outstandingStatus).toBe('due'); // 260 extra km, no deposit
    const earning = settled.settlement.vendorEarningPaise;
    const outstanding = settled.settlement.outstandingPaise;
    await api().post(`/api/v1/admin/bookings/${b._id}/adjustments`).set(auth(ctx.admin)).send({ amountPaise: outstanding + 10000, reason: 'Car broke down for 3 hours' }).expect(200);
    const after = await Booking.findById(b._id).lean();
    expect(after.settlement).toMatchObject({ outstandingStatus: 'waived', outstandingPaise: 0, vendorEarningPaise: earning });
    const refund = await Refund.findOne({ bookingId: b._id, reason: 'price_adjustment' }).lean();
    expect(refund).toMatchObject({ destination: 'source', amountPaise: 10000 });
    expect(rzp.refunds.find((r) => r.receipt === String(refund._id))).toBeTruthy();
  });
});

describe('refunds to the WAY2CARS wallet', () => {
  it('admin cancellation can refund to the wallet', async () => {
    const c = await car();
    const { user, token } = await renter('Cancel to wallet');
    const start = slot(120 * 60);
    const b = await book(token, { vehicleId: String(c._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    await api().post(`/api/v1/admin/bookings/${b._id}/cancel`).set(auth(ctx.admin)).send({ reason: 'Car under repair', refundTo: 'wallet' }).expect(200);
    const after = await Booking.findById(b._id).lean();
    expect(after.status).toBe('cancelled');
    expect((await User.findById(user._id).lean()).walletBalancePaise).toBe(after.payment.paidPaise);
    expect(await Refund.countDocuments({ bookingId: b._id, destination: 'wallet', status: 'processed' })).toBe(1);
  });

  it('deposit refunds can go to the wallet (now or on the scheduled date)', async () => {
    const c = await car({ pricing: { hourlyPaise: 20000, dailyPaise: 200000, securityDepositPaise: 300000, includedKmPerDay: 240, extraKmChargePaise: 1000 } });
    const { user, token } = await renter('Deposit wallet');
    const start = slot(140 * 60);
    const b = await book(token, { vehicleId: String(c._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
    Object.assign(b, { status: 'return_pending', trip: { startOdometerKm: 1000, endOdometerKm: 1100, startFuelEighths: 8, endFuelEighths: 8, returnSubmittedAt: b.endAt } });
    await b.save();
    await withTransaction((session) => finalizeTrip(b._id, { by: { realm: 'system' } }, session));
    await api().post(`/api/v1/admin/bookings/${b._id}/deposit-review`).set(auth(ctx.admin)).send({ refundTo: 'wallet' }).expect(200);
    expect((await LedgerEntry.findOne({ 'owner.id': user._id, type: 'booking_refund' }).lean()).amountPaise).toBe(300000); // plus loyalty cashback separately
    expect((await Booking.findById(b._id).lean()).settlement).toMatchObject({ depositRefundStatus: 'refunded', depositRefundTo: 'wallet' });
  });

  it('a refund waiting to be returned by hand can be moved to the wallet', async () => {
    const c = await car();
    const off = await api().post('/api/v1/admin/bookings/offline').set(auth(ctx.admin)).send({
      phone: '9844499999', name: 'Walk-in', vehicleId: String(c._id), startAt: slot(160 * 60), endAt: new Date(slot(160 * 60).getTime() + 24 * H),
      payment: { status: 'paid', method: 'cash' },
    }).expect(201);
    await api().post(`/api/v1/admin/bookings/${off.body.data.id}/cancel`).set(auth(ctx.admin)).send({ reason: 'Customer changed plan' }).expect(200);
    const manual = await Refund.findOne({ bookingId: off.body.data.id, status: 'manual' }).lean();
    expect(manual).toBeTruthy();
    await api().post(`/api/v1/admin/bookings/${off.body.data.id}/refunds/${manual._id}/to-wallet`).set(auth(ctx.admin)).expect(200);
    const u = await User.findOne({ phone: '9844499999' }).lean();
    expect(u.walletBalancePaise).toBe(manual.amountPaise);
    const again = await api().post(`/api/v1/admin/bookings/${off.body.data.id}/refunds/${manual._id}/to-wallet`).set(auth(ctx.admin));
    expect(again.body.error.code).toBe('NOT_MOVABLE');
    const hist = await api().get(`/api/v1/admin/users/${u._id}/wallet`).set(auth(ctx.admin)).expect(200);
    expect(hist.body.data[0]).toMatchObject({ type: 'booking_refund', category: 'refund', createdBy: { realm: 'admin', name: 'Asha' } });
  });
});

describe('WhatsApp via Textora (BUZWAP)', () => {
  it('sends the configured template with the provider fields and logs it on the booking', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('textorasms')) {
        calls.push({ url, body: JSON.parse(opts.body) });
        return new Response(JSON.stringify({ status: 'success', message_id: 'wamid.123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(url, opts);
    });
    try {
      const c = await car();
      const { user, token } = await renter('Riya Shah');
      const start = slot(180 * 60);
      const b = await book(token, { vehicleId: String(c._id), startAt: start, endAt: new Date(start.getTime() + 24 * H) });
      await new Promise((r) => setTimeout(r, 400));
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://api.textorasms.com/whatsapp/send');
      expect(calls[0].body).toMatchObject({
        from: 'BUZWAP', authkey: 'test-authkey', bussiness_account_id: '918000000000000', messaging_product: 'whatsapp', to: `91${user.phone}`, type: 'template',
        template: { name: 'service_confirmation', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Riya Shah' }, { type: 'text', text: b.ref }] }] },
      });
      const logged = await Booking.findById(b._id).lean();
      expect(logged.messages.find((m) => m.channel === 'whatsapp')).toMatchObject({ status: 'sent', providerRef: 'wamid.123' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('reads provider failures', () => {
    expect(parseWhatsappResponse(200, { status: 'error', message: 'Invalid authkey' })).toMatchObject({ ok: false, error: 'Invalid authkey' });
    expect(parseWhatsappResponse(401, {})).toMatchObject({ ok: false });
    expect(parseWhatsappResponse(200, { success: true, data: { id: 'x1' } })).toMatchObject({ ok: true, providerRef: 'x1' });
  });
});

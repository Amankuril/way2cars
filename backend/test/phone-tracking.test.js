import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';

vi.hoisted(() => { process.env.TRACKING_PROVIDER = 'phone'; });

const { api, useDb, auth, tokenFor, freshPhone } = await import('./helpers.js');
const { User } = await import('../src/modules/users/user.model.js');
const { AdminUser } = await import('../src/modules/admin/admin.model.js');
const { Booking } = await import('../src/modules/bookings/booking.model.js');
const { VehicleLocation, ingestTracking } = await import('../src/modules/tracking/tracking.js');
const { signTripTrackingToken } = await import('../src/modules/auth/token.service.js');
const { startTrip } = await import('../src/modules/trips/trip.service.js');

useDb();

const POSITIONS = '/api/v1/trip-tracking/positions';
const SESSION = '/api/v1/user/bookings/tracking-session';
const oid = () => new mongoose.Types.ObjectId();

async function renter() {
  const user = await User.create({ phone: freshPhone(), name: 'Renter', referralCode: `W2C${oid().toString().slice(-8)}` });
  return { user, token: await tokenFor('user', user) };
}
/** Only the fields tracking reads; a full booking is covered by booking-flow.test.js. */
async function trip(userId, status = 'ongoing', startedAt = new Date(Date.now() - 3600_000)) {
  const _id = oid();
  await Booking.collection.insertOne({ _id, ref: `T${_id}`, userId, vehicleId: oid(), status, startAt: startedAt, endAt: new Date(Date.now() + 3600_000), trip: { startedAt } });
  return _id;
}
const pos = (over = {}) => ({ lat: 22.71, lng: 75.85, speedKmh: 40, accuracyM: 8, recordedAt: new Date().toISOString(), ...over });
const send = (token, positions) => api().post(POSITIONS).set(auth(token)).send({ positions });

describe('phone tracking', () => {
  it('gives the renter a session only while a trip is in progress', async () => {
    const { user, token } = await renter();
    expect((await api().post(SESSION).set(auth(token)).expect(200)).body.data).toEqual({ active: false });
    const id = await trip(user._id);
    const { data } = (await api().post(SESSION).set(auth(token)).expect(200)).body;
    expect(data).toMatchObject({ active: true, bookingId: String(id), path: POSITIONS, intervalSeconds: 30 });
    expect((await send(data.token, [pos()]).expect(200)).body).toEqual({ accepted: 1 });
    const saved = await VehicleLocation.findOne({ bookingId: id }).lean();
    expect(saved).toMatchObject({ source: 'phone', accuracyM: 8 });
    expect(saved.point.coordinates).toEqual([75.85, 22.71]);
  });

  it('needs a session for the session endpoint and a trip token for positions', async () => {
    await api().post(SESSION).expect(401);
    const { user, token } = await renter();
    await trip(user._id);
    await send('not-a-token', [pos()]).expect(401);
    await send(token, [pos()]).expect(401); // a login token is not a trip token
  });

  it('tells the app to stop once the trip is over', async () => {
    const { user } = await renter();
    const id = await trip(user._id, 'return_pending');
    await send(signTripTrackingToken(id, new Date()), [pos()]).expect(410);
    await send(signTripTrackingToken(id, new Date()), []).expect(410); // the app asks with an empty batch when it has no fix
    expect(await VehicleLocation.countDocuments({ bookingId: id })).toBe(0);
  });

  it('drops positions from before the trip or from the future', async () => {
    const { user } = await renter();
    const id = await trip(user._id);
    const token = signTripTrackingToken(id, new Date());
    const res = await send(token, [pos({ recordedAt: new Date(Date.now() - 86400_000).toISOString() }), pos({ recordedAt: new Date(Date.now() + 3600_000).toISOString() }), pos()]).expect(200);
    expect(res.body.accepted).toBe(1);
    await send(token, [pos({ lat: 500 })]).expect(422);
  });

  it('shows admins the newest position and flags a lost signal', async () => {
    const { user } = await renter();
    const startedAt = new Date(Date.now() - 2 * 3600_000);
    const id = await trip(user._id, 'ongoing', startedAt);
    const admin = await AdminUser.create({ email: `track-${oid()}@test.in`, name: 'Asha', role: 'super_admin', passwordHash: 'x' });
    const adminToken = await tokenFor('admin', admin);
    const token = signTripTrackingToken(id, new Date());

    await send(token, [pos({ lat: 22.1, recordedAt: new Date(Date.now() - 3600_000).toISOString() })]).expect(200);
    let { data } = (await api().get(`/api/v1/admin/tracking/bookings/${id}`).set(auth(adminToken)).expect(200)).body;
    expect(data).toMatchObject({ trackingAvailable: true, source: 'phone', signalLost: true });

    await send(token, [pos({ lat: 22.9 })]).expect(200);
    ({ data } = (await api().get(`/api/v1/admin/tracking/bookings/${id}`).set(auth(adminToken)).expect(200)).body);
    expect(data.signalLost).toBe(false);
    expect(data.latest.lat).toBe(22.9);
  });

  it('refuses to start a trip without location consent', async () => {
    const { user } = await renter();
    const id = await trip(user._id, 'confirmed', new Date());
    await expect(startTrip({ auth: { id: user._id } }, id, {})).rejects.toMatchObject({ code: 'TRACKING_REQUIRED' });
    expect((await Booking.findById(id).lean()).status).toBe('confirmed');
  });

  it('keeps the GPS device webhook closed in phone mode and exposes the setting to apps', async () => {
    expect((await ingestTracking(Buffer.from('{}'), 'sig')).httpStatus).toBe(404);
    expect((await api().get('/api/v1/public/config').expect(200)).body.data.tracking).toEqual({ phone: true });
  });
});

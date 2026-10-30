import crypto from 'node:crypto';
import { withTransaction, isDuplicateKey } from '../../core/db.js';
import { badRequest, conflict, forbidden, notFound, AppError } from '../../core/errors.js';
import { pct } from '../../core/money.js';
import { audit } from '../../core/audit.js';
import { Booking, overlapFilter, BLOCKING_STATUSES } from './booking.model.js';
import { Vehicle, VehiclePriceOverride } from '../vehicles/vehicle.model.js';
import { User } from '../users/user.model.js';
import { getSettings } from '../settings/settings.service.js';
import { computeRental, assembleQuote, deliveryFee, cancellationRefundBps, addUnlimitedKm } from '../pricing/pricing.js';
import { ServiceLocation } from '../catalog/catalog.model.js';
import { Vendor, commissionBpsFor } from '../vendors/vendor.model.js';
import { formatIst } from '../../core/time.js';
import { evaluateCoupon, reserveCoupon } from '../coupons/coupon.service.js';
import { debitUserWallet } from '../wallet/wallet.service.js';
import { drivingRoute, fromGeoPoint, validLatLng } from '../../integrations/maps.js';
import { isVehicleAvailable, validateTripWindow, nextAvailableStarts } from './availability.service.js';
import { transition, cancelBooking, cancellationQuote, runEffects, newEffects, releaseHeldValue } from './booking.lifecycle.js';
import { notify, notifyAdmins } from '../notifications/notification.service.js';
import { openPaymentOrder } from '../payments/payment.service.js';

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRef() {
  const d = new Date(Date.now() + 330 * 60000).toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = crypto.randomBytes(4);
  return `W2C${d}${[...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`;
}

async function loadOverrides(vehicleId, startAt, endAt, session) {
  const from = new Date(startAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const to = new Date(endAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const rows = await VehiclePriceOverride.find({ vehicleId, date: { $gte: from, $lte: to } }).session(session || null).lean();
  return new Map(rows.map((r) => [r.date, r]));
}

/** Eligibility checks for the renter. */
async function assertUserCanBook(user, endAt, settings) {
  if (!user || user.status !== 'active') throw forbidden(user?.status === 'pending_approval' ? 'Your account is awaiting approval.' : 'Your account cannot make bookings.', 'ACCOUNT_NOT_ACTIVE');
  if (!user.profileCompleted) throw forbidden('Complete your profile before booking.', 'PROFILE_INCOMPLETE');
  if (settings.booking.kycRequired) {
    if (user.kyc?.status !== 'approved') throw forbidden('Verify your driving licence and ID before booking.', 'KYC_REQUIRED');
    if (user.kyc.licenceExpiry && user.kyc.licenceExpiry < endAt) throw forbidden('Your driving licence expires before this trip ends. Please re-verify.', 'LICENCE_EXPIRES');
  }
}

/**
 * Computes the full server-side price. Never trusts client totals: callers pass only the
 * vehicle, window, delivery address, coupon code and whether to use wallet credit.
 */
export async function buildQuote({ userId, vehicleId, startAt, endAt, delivery, couponCode, useWallet, paymentPlan = 'full', unlimitedKm = false, depositOption = 'cash', pickupLocationId, dropoffLocationId }, { session, skipAvailability = false, office = null } = {}) {
  const settings = await getSettings();
  // Office (offline) bookings may start right away and may use approved cars that are not listed.
  const window = await validateTripWindow(startAt, endAt, { skipLead: Boolean(office) });
  const vehicleFilter = office ? { _id: vehicleId, 'approval.status': 'approved', adminSuspended: false } : { _id: vehicleId, isListed: true };
  const vehicle = await Vehicle.findOne(vehicleFilter).populate('brandId', 'name').session(session || null).lean();
  if (!vehicle) throw notFound('Car');
  if (!skipAvailability && !(await isVehicleAvailable(vehicle._id, window.startAt, window.endAt, { session }))) {
    const next = (await nextAvailableStarts([vehicle._id], window.startAt, window.endAt - window.startAt)).get(String(vehicle._id));
    throw conflict(`This car is booked for the selected time.${next ? ` It is next available from ${formatIst(next)}.` : ''} Try different times or another car.`, 'VEHICLE_UNAVAILABLE', { nextAvailableAt: next || null });
  }
  const overrides = await loadOverrides(vehicle._id, window.startAt, window.endAt, session);
  let rental = computeRental({ startAt: window.startAt, endAt: window.endAt, pricing: vehicle.pricing, overrides });
  if (office?.rentalPaise !== undefined) {
    rental.rentalPaise = office.rentalPaise;
    rental.lines = [{ kind: 'office', hours: rental.hours, ratePaise: office.rentalPaise, amountPaise: office.rentalPaise, source: 'office' }];
  }
  if (unlimitedKm) {
    if (vehicle.pricing.unlimitedKmDailyPaise == null) throw badRequest('Unlimited km is not offered on this car.', undefined, 'UNLIMITED_KM_UNAVAILABLE');
    rental = addUnlimitedKm(rental, vehicle.pricing.unlimitedKmDailyPaise);
  }
  const hubs = await resolveHubs(vehicle, { pickupLocationId, dropoffLocationId, delivery }, session);
  const deposit = depositFor(vehicle, depositOption, settings, office);

  let deliveryInfo = null;
  if (delivery) {
    if (!vehicle.delivery?.enabled) throw badRequest('This host does not offer doorstep delivery.', undefined, 'DELIVERY_UNAVAILABLE');
    if (!validLatLng(delivery)) throw badRequest('Choose a delivery address from the suggestions.', undefined, 'DELIVERY_ADDRESS_INVALID');
    const route = await drivingRoute(fromGeoPoint(vehicle.location.point), { lat: delivery.lat, lng: delivery.lng });
    if (!route) throw badRequest('We could not find a route to this address.', undefined, 'DELIVERY_UNROUTABLE');
    const maxKm = Math.min(vehicle.delivery.maxKm, settings.fees.deliveryMaxKm);
    const fee = deliveryFee(route.distanceMeters, settings.fees);
    if (fee.km > maxKm) throw badRequest(`Doorstep delivery is available within ${maxKm} km of the car. This address is ${fee.km} km away.`, undefined, 'DELIVERY_TOO_FAR');
    deliveryInfo = { ...fee, address: delivery.address, lat: delivery.lat, lng: delivery.lng };
  }

  let coupon = null;
  let discountPaise = 0;
  if (couponCode) {
    ({ coupon, discountPaise } = await evaluateCoupon(couponCode, { userId, vehicle, rentalPaise: rental.rentalPaise }, session));
  }
  if (office?.discountPaise) discountPaise = Math.min(rental.rentalPaise, discountPaise + office.discountPaise);
  const advance = advanceOption(window, settings, { ownership: vehicle.ownership });
  const wantsAdvance = paymentPlan === 'advance' && advance.available;
  const user = userId ? await User.findById(userId).select('walletBalancePaise').session(session || null).lean() : null;
  const quote = assembleQuote({
    rental,
    deliveryFeePaise: deliveryInfo?.feePaise || 0,
    convenienceFeePaise: office?.waiveConvenienceFee ? 0 : settings.fees.convenienceFeePaise,
    discountPaise,
    gstBps: settings.tax.rentalGstBps,
    depositPaise: deposit.paise,
    walletBalancePaise: user?.walletBalancePaise || 0,
    useWallet: Boolean(useWallet) && !wantsAdvance && !office, // wallet credit can't be split across advance + balance
    maxRedeemBps: settings.wallet.maxRedeemBps,
  });
  if (advance.available) {
    advance.advancePaise = Math.min(quote.payablePaise, pct(quote.chargesPaise, advance.percentBps));
    advance.balancePaise = quote.payablePaise - advance.advancePaise;
  }
  if (wantsAdvance) quote.advancePaise = advance.advancePaise;
  if (unlimitedKm) Object.assign(quote, { unlimitedKm: true, unlimitedKmPaise: rental.unlimitedKmPaise });
  return { vehicle, window, quote, coupon, deliveryInfo, settings, advance, deposit, hubs };
}

/** Money deposit (at least the platform minimum) or a bike / laptop handed over at pickup instead. */
export function depositFor(vehicle, option, settings, office) {
  const d = settings.deposit;
  if (option === 'bike' && !d.allowBike) throw badRequest('A bike is not accepted as a deposit right now.', undefined, 'DEPOSIT_OPTION_UNAVAILABLE');
  if (option === 'laptop' && !d.allowLaptop) throw badRequest('A laptop is not accepted as a deposit right now.', undefined, 'DEPOSIT_OPTION_UNAVAILABLE');
  if (option !== 'cash') return { option, paise: 0 };
  return { option, paise: office?.depositPaise ?? Math.max(vehicle.pricing.securityDepositPaise, d.minCashPaise) };
}

/** Checks the bike / laptop a renter offers as the deposit against the platform rules. */
export function validateCollateral(option, c, settings) {
  if (option === 'cash') return undefined;
  const d = settings.deposit;
  if (!c?.make || !c?.model || !c?.year) throw badRequest(`Enter the ${option}'s make, model and year.`, undefined, 'COLLATERAL_REQUIRED');
  if (option === 'bike') {
    if (c.year < d.bikeMinYear) throw badRequest(`The bike must be a ${d.bikeMinYear} or newer model.`, undefined, 'COLLATERAL_TOO_OLD');
    if (!c.registrationNumber) throw badRequest("Enter the bike's registration number.", undefined, 'COLLATERAL_REQUIRED');
  } else {
    if (c.year < d.laptopMinYear) throw badRequest(`The laptop must be a ${d.laptopMinYear} or newer model.`, undefined, 'COLLATERAL_TOO_OLD');
    if (!c.serialNumber) throw badRequest("Enter the laptop's serial number.", undefined, 'COLLATERAL_REQUIRED');
  }
  return { make: c.make, model: c.model, year: c.year, registrationNumber: c.registrationNumber?.toUpperCase().replace(/[\s-]/g, ''), serialNumber: c.serialNumber, description: c.description };
}

/** Way2Cars pickup / drop-off points chosen for a fleet car (null = the car's own location). */
async function resolveHubs(vehicle, { pickupLocationId, dropoffLocationId, delivery }, session) {
  if (!pickupLocationId && !dropoffLocationId) return { pickup: null, dropoff: null };
  if (vehicle.ownership !== 'company') throw badRequest('Pickup points are only available on WAY2CARS fleet cars.', undefined, 'HUB_UNAVAILABLE');
  if (pickupLocationId && delivery) throw badRequest('Choose doorstep delivery or a pickup point, not both.', undefined, 'HUB_UNAVAILABLE');
  const load = async (id, kind) => {
    if (!id) return null;
    const loc = await ServiceLocation.findOne({ _id: id, cityId: vehicle.cityId, isActive: true, kinds: kind }).session(session || null).lean();
    if (!loc) throw badRequest(`Choose a ${kind === 'pickup' ? 'pickup' : 'drop-off'} point in the car's city.`, undefined, 'HUB_INVALID');
    return loc;
  };
  return { pickup: await load(pickupLocationId, 'pickup'), dropoff: await load(dropoffLocationId, 'dropoff') };
}

const hubPlace = (loc) => ({ type: 'hub', locationId: loc._id, name: loc.name, address: loc.address, point: loc.point });

/** Pricing snapshot, deposit, places and ownership shared by app and office bookings. */
export function bookingSnapshot({ vehicle, owner, quote, settings, coupon, deposit, collateral, hubs, deliveryInfo }) {
  const company = Boolean(owner?.isCompany);
  const carPlace = { type: 'host_location', address: vehicle.location.address, point: vehicle.location.point };
  const pickup = deliveryInfo
    ? { type: 'doorstep', address: deliveryInfo.address, point: { type: 'Point', coordinates: [deliveryInfo.lng, deliveryInfo.lat] }, distanceKm: deliveryInfo.km }
    : hubs?.pickup ? hubPlace(hubs.pickup) : carPlace;
  return {
    ownership: company ? 'company' : 'host',
    pickup,
    dropoff: hubs?.dropoff ? hubPlace(hubs.dropoff) : pickup,
    deposit: { type: deposit.option, collateral, status: deposit.option === 'cash' ? 'none' : 'awaiting' },
    pricing: {
      ...quote,
      extraKmChargePaise: vehicle.pricing.extraKmChargePaise,
      hourlyPaise: vehicle.pricing.hourlyPaise,
      dailyPaise: vehicle.pricing.dailyPaise,
      commissionBps: commissionBpsFor(owner, settings, vehicle),
      ...(company && vehicle.investor?.investorId ? { investorId: vehicle.investor.investorId, investorShareBps: vehicle.investor.shareBps } : {}),
      couponCode: coupon?.code,
      settingsVersion: settings.version,
    },
  };
}

/** Whether "pay an advance now, rest later" is offered for this trip window, and when the rest is due. */
export function advanceOption(window, settings, { ownership = 'host', now = new Date() } = {}) {
  const a = settings.advance;
  const percentBps = ownership === 'company' ? (a.companyPercentBps ?? a.percentBps) : a.percentBps;
  const dueAt = new Date(window.startAt.getTime() - a.balanceDueHoursBeforeStart * 3600_000);
  // The renter needs at least an hour between booking and the balance deadline.
  const available = Boolean(a.enabled) && dueAt.getTime() > now.getTime() + 3600_000;
  return { available, percentBps, balanceDueAt: available ? dueAt : null };
}

export function serializeQuote({ quote, coupon, deliveryInfo, window, vehicle, advance, deposit, hubs, settings }) {
  return {
    vehicleId: vehicle._id,
    startAt: window.startAt,
    endAt: window.endAt,
    ...quote,
    extraKmChargePaise: vehicle.pricing.extraKmChargePaise,
    coupon: coupon ? { code: coupon.code, title: coupon.title } : null,
    delivery: deliveryInfo ? { km: deliveryInfo.km, feePaise: deliveryInfo.feePaise, address: deliveryInfo.address } : null,
    instantBooking: vehicle.instantBooking,
    advance: advance ? { available: advance.available, percentBps: advance.percentBps, advancePaise: advance.advancePaise ?? null, balancePaise: advance.balancePaise ?? null, balanceDueAt: advance.balanceDueAt } : null,
    unlimitedKmOption: vehicle.pricing.unlimitedKmDailyPaise != null ? { dailyPaise: vehicle.pricing.unlimitedKmDailyPaise, selected: Boolean(quote.unlimitedKm), amountPaise: quote.unlimitedKmPaise ?? Math.round((vehicle.pricing.unlimitedKmDailyPaise * quote.hours) / 24) } : null,
    depositOptions: settings ? {
      selected: deposit?.option || 'cash',
      cashPaise: Math.max(vehicle.pricing.securityDepositPaise, settings.deposit.minCashPaise),
      bike: settings.deposit.allowBike ? { minYear: settings.deposit.bikeMinYear } : null,
      laptop: settings.deposit.allowLaptop ? { minYear: settings.deposit.laptopMinYear } : null,
    } : null,
    pickupLocation: hubs?.pickup ? { id: hubs.pickup._id, name: hubs.pickup.name, address: hubs.pickup.address } : null,
    dropoffLocation: hubs?.dropoff ? { id: hubs.dropoff._id, name: hubs.dropoff.name, address: hubs.dropoff.address } : null,
    ownership: vehicle.ownership || 'host',
  };
}

/** Inserts a booking (inside the caller's transaction) with a fresh unique ref. `extra` overrides defaults. */
export async function createBookingDoc({ userId, vehicle, window, quote, session, pickup, extra = {} }) {
  const now = new Date();
  const doc = {
    userId,
    vendorId: vehicle.vendorId,
    vehicleId: vehicle._id,
    cityId: vehicle.cityId,
    vehicleSnapshot: {
      title: [vehicle.brandId?.name, vehicle.model, vehicle.variant].filter(Boolean).join(' '),
      registrationNumber: vehicle.registrationNumber,
      photoUrl: vehicle.photos?.[0]?.url,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      seats: vehicle.seats,
    },
    startAt: window.startAt,
    endAt: window.endAt,
    originalEndAt: window.endAt,
    blockEndAt: window.endAt,
    status: 'pending_payment',
    statusHistory: [{ status: 'pending_payment', at: now, by: { realm: 'user', id: userId } }],
    instantBooking: vehicle.instantBooking,
    pickup,
    dropoff: pickup,
    pricing: quote,
    ...extra,
  };
  for (let i = 0; i < 4; i++) {
    try {
      const [created] = await Booking.create([{ ...doc, ref: newRef() }], { session });
      return created;
    } catch (err) {
      if (!isDuplicateKey(err) || !/ref/.test(err.message)) throw err;
    }
  }
  throw new Error('Could not allocate a booking reference');
}

/**
 * Creates a booking in `pending_payment` with a short hold. Race-safe: the vehicle document is
 * write-locked inside the transaction, so two renters cannot both pass the availability check.
 */
export async function createBooking(req, input) {
  const userId = req.auth.id;
  const idempotencyKey = req.get('idempotency-key')?.slice(0, 80);
  if (idempotencyKey) {
    const existing = await Booking.findOne({ userId, idempotencyKey }).lean();
    if (existing) return { booking: existing, reused: true };
  }
  const settings = await getSettings();
  const user = await User.findById(userId).lean();
  const window0 = await validateTripWindow(input.startAt, input.endAt);
  await assertUserCanBook(user, window0.endAt, settings);

  const booking = await withTransaction(async (session) => {
    const locked = await Vehicle.findOneAndUpdate({ _id: input.vehicleId, isListed: true }, { $inc: { lockVersion: 1 } }, { session, new: true });
    if (!locked) throw notFound('Car');

    // A renter can't hold two overlapping trips.
    const { vehicleId: _ignored, ...overlap } = overlapFilter(locked._id, window0.startAt, window0.endAt, 0);
    const mine = await Booking.exists({ ...overlap, userId }).session(session);
    if (mine) throw conflict('You already have a trip during these times.', 'USER_OVERLAP');

    const { vehicle, window, quote, coupon, deliveryInfo, advance, deposit, hubs } = await buildQuote({ ...input, userId }, { session });
    if (input.paymentPlan === 'advance' && !quote.advancePaise) throw conflict('Paying an advance is not available for this trip. Pay the full amount instead.', 'ADVANCE_UNAVAILABLE');
    const collateral = validateCollateral(deposit.option, input.collateral, settings);
    const owner = await Vendor.findById(vehicle.vendorId).select('isCompany commissionBps').session(session).lean();
    const snap = bookingSnapshot({ vehicle, owner, quote, settings, coupon, deposit, collateral, hubs, deliveryInfo });
    const now = new Date();
    const created = await createBookingDoc({
      userId, vehicle, window, quote, session, pickup: snap.pickup,
      extra: {
        ...snap,
        holdExpiresAt: new Date(now.getTime() + settings.booking.holdMinutes * 60_000),
        createdBy: { realm: 'user', id: userId },
        ...(quote.advancePaise ? { balance: { duePaise: quote.payablePaise - quote.advancePaise, dueAt: advance.balanceDueAt, status: 'due', autoCancel: settings.advance.autoCancelUnpaid } } : {}),
        couponId: coupon?._id,
        idempotencyKey,
      },
    });
    if (coupon) await reserveCoupon(coupon, { userId, bookingId: created._id, discountPaise: quote.discountPaise }, session);
    if (quote.walletAppliedPaise > 0) await debitUserWallet(userId, quote.walletAppliedPaise, 'wallet_redeemed', { bookingId: created._id, key: `wallet-redeem:${created._id}`, note: `Booking ${created.ref}` }, session);
    await audit(req, 'booking.created', { type: 'booking', id: created._id }, { changes: { totalPaise: quote.totalPaise, payablePaise: quote.payablePaise }, session });
    return created;
  });
  return { booking: booking.toObject(), reused: false };
}

/** Opens (or reuses) the Razorpay order for the booking's payable amount. */
export async function bookingPaymentOrder(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw notFound('Booking');
  if (booking.status !== 'pending_payment') throw conflict('This booking does not need payment.', 'PAYMENT_NOT_REQUIRED');
  if (booking.holdExpiresAt < new Date()) throw new AppError(410, 'HOLD_EXPIRED', 'Your 15-minute hold has expired. Please book again.');
  return openPaymentOrder({ booking, purpose: 'booking', amountPaise: booking.pricing.advancePaise || booking.pricing.payablePaise });
}

/** Order for the rest of an advance / offline booking. */
export async function balancePaymentOrder(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw notFound('Booking');
  if (booking.balance?.status !== 'due' || !['pending_vendor_approval', 'confirmed'].includes(booking.status)) throw conflict('Nothing is due on this booking.', 'NOTHING_DUE');
  return openPaymentOrder({ booking, purpose: 'balance', amountPaise: booking.balance.duePaise });
}

export async function cancelByUser(req, bookingId, reason) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, userId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (!['pending_payment', 'pending_vendor_approval', 'confirmed'].includes(b.status)) throw conflict('This booking can no longer be cancelled.', 'NOT_CANCELLABLE');
    if (b.status === 'confirmed' && b.startAt <= new Date()) throw conflict('The trip has already started. Contact support for help.', 'NOT_CANCELLABLE');
    const effects = await cancelBooking(b, { by: { realm: 'user', id: req.auth.id }, reason: reason || 'Cancelled by renter' }, session);
    await audit(req, 'booking.cancelled', { type: 'booking', id: b._id }, { reason, session });
    return effects;
  });
  await runEffects(fx);
}

/** Preview of what a cancellation would refund right now (shown before the user confirms). */
export async function cancellationPreview(userId, bookingId) {
  const b = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!b) throw notFound('Booking');
  const q = cancellationQuote(b, await getSettings());
  return {
    refundBps: q.refundBps,
    cancellationFeePaise: q.feePaise,
    refundToSourcePaise: q.gatewayRefund,
    refundToWalletPaise: q.walletRefund,
    hoursBeforeStart: Math.max(0, Math.round(q.hoursBeforeStart * 10) / 10),
    balanceWaivedPaise: b.balance?.status === 'due' ? b.balance.duePaise : 0,
  };
}

/** Accept or decline a booking awaiting the host. Hosts decide their own; operations can decide any. */
export async function decideBooking(req, bookingId, { decision, reason }) {
  const asHost = req.auth.realm === 'vendor';
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne(asHost ? { _id: bookingId, vendorId: req.auth.id } : { _id: bookingId }).session(session);
    if (!b) throw notFound('Booking');
    if (b.status !== 'pending_vendor_approval') throw conflict('This request has already been handled.', 'NOT_PENDING');
    const by = { realm: req.auth.realm, id: req.auth.id };
    let effects;
    if (decision === 'accept') {
      transition(b, 'confirmed', by);
      b.vendorDecisionDueAt = undefined;
      await b.save({ session });
      if (asHost) await Vendor.updateOne({ _id: req.auth.id }, { $inc: { 'responseStats.accepted': 1 } }, { session });
      effects = newEffects();
      effects.notifications.push(['booking.confirmed', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, start: formatIst(b.startAt), end: formatIst(b.endAt) }]);
      if (!asHost) effects.notifications.push(['vendor.booking_confirmed', { realm: 'vendor', id: b.vendorId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, start: formatIst(b.startAt), end: formatIst(b.endAt) }]);
    } else {
      if (!reason) throw badRequest('Tell the renter why (e.g. car unavailable).', undefined, 'REASON_REQUIRED');
      effects = await cancelBooking(b, { by, reason, full: true, toStatus: 'rejected', refundReason: 'vendor_rejection' }, session);
      if (asHost) await Vendor.updateOne({ _id: req.auth.id }, { $inc: { 'responseStats.rejected': 1 } }, { session });
    }
    await audit(req, `booking.${asHost ? 'vendor' : 'admin'}_${decision}ed`, { type: 'booking', id: b._id }, { reason, session });
    return effects;
  });
  await runEffects(fx);
}
export const vendorDecision = decideBooking;

/** Admin cancellation: always a full refund unless an explicit refund amount is given. */
export async function cancelByAdmin(req, bookingId, { reason, refundTo = 'source' }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findById(bookingId).session(session);
    if (!b) throw notFound('Booking');
    if (!['pending_payment', 'pending_vendor_approval', 'confirmed'].includes(b.status)) throw conflict('Only bookings that have not started can be cancelled.', 'NOT_CANCELLABLE');
    const effects = await cancelBooking(b, { by: { realm: 'admin', id: req.auth.id }, reason, full: true, refundReason: 'admin_cancellation', refundTo }, session);
    await audit(req, 'booking.admin_cancelled', { type: 'booking', id: b._id }, { reason, changes: { refundTo }, session });
    return effects;
  });
  await runEffects(fx);
}

/** Starts a paid extension request (renter pays the difference before it takes effect). */
export async function requestExtension(req, bookingId, newEndAt) {
  const settings = await getSettings();
  const result = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, userId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (!['confirmed', 'ongoing'].includes(b.status)) throw conflict('Only upcoming or active trips can be extended.', 'NOT_EXTENDABLE');
    const cutoff = new Date(b.endAt.getTime() - settings.extension.minHoursBeforeEnd * 3600_000);
    if (new Date() > cutoff) {
      throw conflict(`Extensions must be requested at least ${settings.extension.minHoursBeforeEnd} hours before your return time. Please call support — late returns are charged by the hour.`, 'EXTENSION_TOO_LATE', { cutoffAt: cutoff });
    }
    const end = new Date(newEndAt);
    if (Number.isNaN(end.getTime()) || end.getTime() % (30 * 60_000)) throw badRequest('Choose a return time on the hour or half hour.', undefined, 'INVALID_DATES');
    if (end <= b.endAt) throw badRequest('The new return time must be after the current one.', undefined, 'INVALID_DATES');
    if (end.getTime() - b.startAt.getTime() > settings.booking.maxDurationDays * 86400_000) throw badRequest(`Trips can last at most ${settings.booking.maxDurationDays} days.`, undefined, 'TRIP_TOO_LONG');
    if (b.extensions.some((e) => e.status === 'pending_approval' || (e.status === 'pending_payment' && e.holdExpiresAt > new Date()))) throw conflict('You already have an extension request in progress.', 'EXTENSION_PENDING');
    if (b.extensions.some((e) => e.status === 'approved' && e.chargeStatus === 'due')) throw conflict('Pay for your approved extension first.', 'EXTENSION_UNPAID');

    await Vehicle.updateOne({ _id: b.vehicleId }, { $inc: { lockVersion: 1 } }, { session });
    if (!(await isVehicleAvailable(b.vehicleId, b.endAt, end, { session, excludeBookingId: b._id }))) {
      throw conflict('The car is booked after your trip, so it cannot be extended to that time.', 'VEHICLE_UNAVAILABLE');
    }
    const vehicle = await Vehicle.findById(b.vehicleId).select('pricing').session(session).lean();
    const overrides = await loadOverrides(b.vehicleId, b.endAt, end, session);
    let rental = computeRental({ startAt: b.endAt, endAt: end, pricing: vehicle.pricing, overrides });
    if (b.pricing.unlimitedKm) rental = addUnlimitedKm(rental, vehicle.pricing.unlimitedKmDailyPaise ?? 0);
    const gst = pct(rental.rentalPaise, b.pricing.gstBps);
    const needsApproval = settings.extension.requireApproval;
    const ext = {
      previousEndAt: b.endAt,
      requestedEndAt: end,
      status: needsApproval ? 'pending_approval' : 'pending_payment',
      pricing: { hours: rental.hours, rentalPaise: rental.rentalPaise, gstPaise: gst, totalPaise: rental.rentalPaise + gst, includedKm: rental.includedKm, lines: rental.lines },
      // Awaiting approval, the extra time stays reserved until operations decide (or the trip's return time passes).
      holdExpiresAt: needsApproval ? undefined : new Date(Date.now() + settings.booking.holdMinutes * 60_000),
      requestedBy: { realm: 'user', id: req.auth.id },
    };
    b.extensions.push(ext);
    b.blockEndAt = end;
    await b.save({ session });
    await audit(req, 'booking.extension_requested', { type: 'booking', id: b._id }, { changes: { requestedEndAt: end, needsApproval }, session });
    return { booking: b, extension: b.extensions.at(-1) };
  });
  if (result.extension.status === 'pending_approval') {
    await notifyAdmins('admin.alert', { title: 'Extension request', body: `Booking ${result.booking.ref} asks to extend to ${formatIst(result.extension.requestedEndAt)}.`, link: `/bookings/${result.booking._id}` }, 'bookings.manage');
    return { extension: result.extension, payment: null };
  }
  const order = await openPaymentOrder({ booking: result.booking, purpose: 'extension', amountPaise: result.extension.pricing.totalPaise, extensionId: result.extension._id });
  return { extension: result.extension, payment: order };
}

/** Re-opens the payment order for an extension still inside its hold window. */
export async function extensionPaymentOrder(userId, bookingId, extensionId) {
  const b = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!b) throw notFound('Booking');
  const ext = b.extensions.find((e) => String(e._id) === String(extensionId));
  if (ext?.status === 'approved' && ext.chargeStatus === 'due') return openPaymentOrder({ booking: b, purpose: 'extension', amountPaise: ext.pricing.totalPaise, extensionId: ext._id });
  if (!ext || ext.status !== 'pending_payment') throw conflict('This extension does not need payment.', 'PAYMENT_NOT_REQUIRED');
  if (ext.holdExpiresAt < new Date()) throw new AppError(410, 'HOLD_EXPIRED', 'This extension hold has expired. Please request it again.');
  return openPaymentOrder({ booking: b, purpose: 'extension', amountPaise: ext.pricing.totalPaise, extensionId: ext._id });
}

// ------------------------------------------------------------------ jobs
/** Marks lapsed unpaid holds as expired and returns their wallet credit / coupon. */
export async function expireHolds() {
  const lapsed = await Booking.find({ status: 'pending_payment', holdExpiresAt: { $lt: new Date(Date.now() - 60_000) } }).select('_id').limit(200).lean();
  for (const { _id } of lapsed) {
    const fx = await withTransaction(async (session) => {
      const b = await Booking.findOne({ _id, status: 'pending_payment' }).session(session);
      if (!b) return null;
      transition(b, 'expired', { realm: 'system' }, 'Payment not completed in time');
      await b.save({ session });
      const effects = newEffects();
      await releaseHeldValue(b, session, effects);
      effects.notifications.push(['booking.expired', { realm: 'user', id: b.userId }, { bookingId: b._id, vehicle: b.vehicleSnapshot.title }]);
      return effects;
    });
    await runEffects(fx);
  }
  // Extension holds that lapsed release the extra calendar time.
  const exts = await Booking.find({ extensions: { $elemMatch: { status: 'pending_payment', holdExpiresAt: { $lt: new Date(Date.now() - 60_000) } } } }).limit(200);
  for (const b of exts) {
    for (const e of b.extensions) if (e.status === 'pending_payment' && e.holdExpiresAt < new Date(Date.now() - 60_000)) e.status = 'expired';
    b.blockEndAt = b.endAt;
    await b.save();
  }
  // Requests nobody reviewed before the trip's return time lapse (the renter is told).
  const unreviewed = await Booking.find({ extensions: { $elemMatch: { status: 'pending_approval', previousEndAt: { $lt: new Date() } } } }).limit(200);
  for (const b of unreviewed) {
    for (const e of b.extensions) {
      if (e.status === 'pending_approval' && e.previousEndAt < new Date()) Object.assign(e, { status: 'rejected', decidedBy: { realm: 'system' }, decidedAt: new Date(), reason: 'Not reviewed before the return time' });
    }
    b.blockEndAt = b.endAt;
    await b.save();
    await notify('booking.extension_rejected', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, reason: 'It could not be reviewed before your return time.' });
  }
  return lapsed.length;
}

/** Job: remind renters of a balance coming due; cancel (per policy) bookings still unpaid at pickup. */
export async function processBalances() {
  const now = new Date();
  const remind = await Booking.find({ status: { $in: ['pending_vendor_approval', 'confirmed'] }, 'balance.status': 'due', 'balance.reminderSent': { $ne: true }, 'balance.dueAt': { $lt: new Date(now.getTime() + 6 * 3600_000) } }).limit(200).lean();
  for (const b of remind) {
    await Booking.updateOne({ _id: b._id }, { $set: { 'balance.reminderSent': true } });
    await notify('booking.balance_due', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, duePaise: b.balance.duePaise, dueBy: formatIst(b.balance.dueAt) }, { dedupeKey: `balance-due:${b._id}` });
  }
  const unpaid = await Booking.find({ status: { $in: ['pending_vendor_approval', 'confirmed'] }, 'balance.status': 'due', 'balance.autoCancel': true, startAt: { $lte: now } }).select('_id').limit(100).lean();
  for (const { _id } of unpaid) {
    const fx = await withTransaction(async (session) => {
      const b = await Booking.findOne({ _id, 'balance.status': 'due', status: { $in: ['pending_vendor_approval', 'confirmed'] } }).session(session);
      if (!b) return null;
      const effects = await cancelBooking(b, { by: { realm: 'system' }, reason: 'Balance not paid before pickup' }, session);
      await audit(null, 'booking.cancelled_unpaid_balance', { type: 'booking', id: b._id }, { actor: { realm: 'system' }, session });
      return effects;
    }).catch(() => null);
    await runEffects(fx);
  }
  return remind.length + unpaid.length;
}

/** Host didn't respond within the SLA: reject with a full refund. */
export async function timeoutVendorApprovals() {
  const due = await Booking.find({ status: 'pending_vendor_approval', vendorDecisionDueAt: { $lt: new Date() } }).select('_id').limit(100).lean();
  for (const { _id } of due) {
    const fx = await withTransaction(async (session) => {
      const b = await Booking.findOne({ _id, status: 'pending_vendor_approval' }).session(session);
      if (!b) return null;
      return cancelBooking(b, { by: { realm: 'system' }, reason: 'Host did not respond in time', full: true, toStatus: 'rejected', refundReason: 'approval_timeout' }, session);
    });
    await runEffects(fx);
  }
  return due.length;
}

export { BLOCKING_STATUSES };

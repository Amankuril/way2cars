import { z } from 'zod';
import { withTransaction } from '../../core/db.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { sha256 } from '../../core/crypto.js';
import { pct } from '../../core/money.js';
import { audit } from '../../core/audit.js';
import { Booking } from '../bookings/booking.model.js';
import { Vehicle } from '../vehicles/vehicle.model.js';
import { User } from '../users/user.model.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { getSettings } from '../settings/settings.service.js';
import { getPublishedPage } from '../cms/cms.routes.js';
import { claimFiles, attachFiles, registerFileAccessRule } from '../files/files.service.js';
import { computeSettlement } from '../pricing/pricing.js';
import { recordBookingRefund } from '../payments/refund.service.js';
import { creditVendorEarning, creditUserWallet, rewardReferralIfQualified } from '../wallet/wallet.service.js';
import { transition, newEffects, runEffects } from '../bookings/booking.lifecycle.js';
import { openPaymentOrder } from '../payments/payment.service.js';
import { TripInspection, RentalAgreement, DamageClaim, PHOTO_ANGLES, CHECKLIST_ITEMS } from './trip.model.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const photos = z.array(z.object({ fileId: objectId, angle: z.enum(PHOTO_ANGLES) }).strict()).min(1).max(16);
const checklist = z.array(z.object({ item: z.enum(CHECKLIST_ITEMS), ok: z.boolean(), note: z.string().trim().max(200).optional() }).strict()).max(CHECKLIST_ITEMS.length);
const reading = {
  odometerKm: z.number().int().min(0).max(2_000_000),
  fuelEighths: z.number().int().min(0).max(8).optional(),
  batteryPercent: z.number().int().min(0).max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
};

export const pickupSchema = z.object({
  photos,
  ...reading,
  checklist,
  notes: z.string().trim().max(1000).optional(),
  agreement: z.object({ accept: z.literal(true), fullName: z.string().trim().min(2).max(100), contentHash: z.string().length(64) }).strict(),
}).strict();

export const returnSchema = z.object({
  photos,
  ...reading,
  checklist,
  notes: z.string().trim().max(1000).optional(),
  damages: z.array(z.object({ area: z.string().trim().min(2).max(60), description: z.string().trim().min(3).max(300), severity: z.enum(['minor', 'major']), photoFileIds: z.array(objectId).max(6).default([]) }).strict()).max(10).default([]),
}).strict();

const point = (b) => (b.lat !== undefined && b.lng !== undefined ? { type: 'Point', coordinates: [b.lng, b.lat] } : undefined);

function requireReading(vehicle, body) {
  if (vehicle.fuelType === 'electric' && body.batteryPercent === undefined) throw badRequest('Enter the battery level.', undefined, 'READING_REQUIRED');
  if (vehicle.fuelType !== 'electric' && body.fuelEighths === undefined) throw badRequest('Enter the fuel level.', undefined, 'READING_REQUIRED');
}

/** The rental agreement text the renter must accept, personalised for the booking. */
export async function agreementFor(userId, bookingId) {
  const b = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!b) throw notFound('Booking');
  const page = await getPublishedPage('rental-agreement');
  if (!page) throw conflict('The rental agreement is not available yet. Please contact support.', 'AGREEMENT_NOT_CONFIGURED');
  const existing = await RentalAgreement.findOne({ bookingId: b._id }).lean();
  return {
    title: page.title,
    version: page.version,
    blocks: page.blocks,
    contentHash: sha256(JSON.stringify(page.blocks)),
    accepted: existing ? { name: existing.acceptedName, at: existing.acceptedAt } : null,
    summary: { vehicle: b.vehicleSnapshot.title, registrationNumber: b.vehicleSnapshot.registrationNumber, startAt: b.startAt, endAt: b.endAt, depositPaise: b.pricing.depositPaise, includedKm: b.pricing.includedKm, extraKmChargePaise: b.pricing.extraKmChargePaise },
  };
}

/** Renter's pickup inspection + agreement acceptance → trip starts. */
export async function startTrip(req, bookingId, body) {
  const settings = await getSettings();
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, userId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (b.status !== 'confirmed') throw conflict('This trip is not ready to start.', 'NOT_STARTABLE');
    const now = new Date();
    const opensAt = new Date(b.startAt.getTime() - settings.booking.pickupWindowMinutesBefore * 60_000);
    if (now < opensAt) throw conflict(`Pickup opens ${settings.booking.pickupWindowMinutesBefore} minutes before your start time.`, 'PICKUP_NOT_OPEN');
    if (now > b.endAt) throw conflict('This booking window has ended.', 'PICKUP_CLOSED');
    if (body.photos.length < settings.trip.minPickupPhotos) throw badRequest(`Take at least ${settings.trip.minPickupPhotos} photos of the car.`, undefined, 'PHOTOS_REQUIRED');

    const vehicle = await Vehicle.findById(b.vehicleId).select('fuelType lastOdometerKm').session(session).lean();
    requireReading(vehicle, body);
    if (vehicle.lastOdometerKm && body.odometerKm < vehicle.lastOdometerKm) throw badRequest(`Odometer reading looks wrong — the last recorded reading was ${vehicle.lastOdometerKm} km.`, undefined, 'ODOMETER_INVALID');

    const page = await getPublishedPage('rental-agreement');
    if (!page) throw conflict('The rental agreement is not available yet. Please contact support.', 'AGREEMENT_NOT_CONFIGURED');
    const hash = sha256(JSON.stringify(page.blocks));
    if (hash !== body.agreement.contentHash) throw conflict('The rental agreement was updated. Please review it again.', 'AGREEMENT_CHANGED');

    const fileIds = body.photos.map((p) => p.fileId);
    await claimFiles(req.auth, fileIds, ['inspection_photo'], { session });
    const [insp] = await TripInspection.create([{ bookingId: b._id, kind: 'pickup', submittedBy: { realm: 'user', id: req.auth.id }, photos: body.photos, odometerKm: body.odometerKm, fuelEighths: body.fuelEighths, batteryPercent: body.batteryPercent, checklist: body.checklist, notes: body.notes, location: point(body) }], { session });
    await attachFiles(fileIds, { type: 'booking', id: b._id }, session);

    const [user, kyc] = await Promise.all([
      User.findById(b.userId).select('name phone kyc').session(session).lean(),
      KycSubmission.findOne({ subjectType: 'user', subjectId: b.userId, status: 'approved' }).sort({ createdAt: -1 }).session(session).lean(),
    ]);
    const [agr] = await RentalAgreement.create([{
      bookingId: b._id, userId: b.userId, documentVersion: page.version, contentHash: hash, title: page.title,
      acceptedName: body.agreement.fullName, acceptedAt: now, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300),
      snapshot: { renter: user.name, phone: user.phone, licenceMasked: kyc?.licence?.numberMasked, vehicle: b.vehicleSnapshot.title, registrationNumber: b.vehicleSnapshot.registrationNumber, startAt: b.startAt, endAt: b.endAt, depositPaise: b.pricing.depositPaise },
    }], { session });

    transition(b, 'ongoing', { realm: 'user', id: req.auth.id }, 'Pickup inspection completed');
    b.trip.pickupInspectionId = insp._id;
    b.trip.agreementId = agr._id;
    b.trip.startedAt = now;
    b.trip.startOdometerKm = body.odometerKm;
    b.trip.startFuelEighths = vehicle.fuelType === 'electric' ? Math.round((body.batteryPercent / 100) * 8) : body.fuelEighths;
    await b.save({ session });
    await audit(req, 'trip.started', { type: 'booking', id: b._id }, { session });
    const effects = newEffects();
    effects.notifications.push(['trip.started', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref }]);
    effects.notifications.push(['vendor.trip_started', { realm: 'vendor', id: b.vendorId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title }]);
    return effects;
  });
  await runEffects(fx);
}

/** Renter's return inspection → host review window. */
export async function submitReturn(req, bookingId, body) {
  const settings = await getSettings();
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, userId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (b.status !== 'ongoing') throw conflict('This trip is not in progress.', 'NOT_RETURNABLE');
    if (body.photos.length < settings.trip.minPickupPhotos) throw badRequest(`Take at least ${settings.trip.minPickupPhotos} photos of the car.`, undefined, 'PHOTOS_REQUIRED');
    const vehicle = await Vehicle.findById(b.vehicleId).select('fuelType').session(session).lean();
    requireReading(vehicle, body);
    if (body.odometerKm < b.trip.startOdometerKm) throw badRequest(`The return reading can't be lower than at pickup (${b.trip.startOdometerKm} km).`, undefined, 'ODOMETER_INVALID');

    const damagePhotoIds = body.damages.flatMap((d) => d.photoFileIds);
    await claimFiles(req.auth, body.photos.map((p) => p.fileId), ['inspection_photo'], { session });
    await claimFiles(req.auth, damagePhotoIds, ['damage_photo', 'inspection_photo'], { session });
    const [insp] = await TripInspection.create([{ bookingId: b._id, kind: 'return', submittedBy: { realm: 'user', id: req.auth.id }, photos: body.photos, odometerKm: body.odometerKm, fuelEighths: body.fuelEighths, batteryPercent: body.batteryPercent, checklist: body.checklist, damages: body.damages, notes: body.notes, location: point(body) }], { session });
    await attachFiles([...body.photos.map((p) => p.fileId), ...damagePhotoIds], { type: 'booking', id: b._id }, session);

    const now = new Date();
    transition(b, 'return_pending', { realm: 'user', id: req.auth.id }, 'Return inspection submitted');
    b.trip.returnInspectionId = insp._id;
    b.trip.returnSubmittedAt = now;
    b.trip.returnReviewDueAt = new Date(now.getTime() + settings.trip.returnReviewHours * 3600_000);
    b.trip.endOdometerKm = body.odometerKm;
    b.trip.endFuelEighths = vehicle.fuelType === 'electric' ? Math.round((body.batteryPercent / 100) * 8) : body.fuelEighths;
    await b.save({ session });
    await audit(req, 'trip.return_submitted', { type: 'booking', id: b._id }, { session });
    const effects = newEffects();
    effects.notifications.push(['vendor.return_submitted', { realm: 'vendor', id: b.vendorId }, { bookingId: b._id, ref: b.ref, vehicle: b.vehicleSnapshot.title, hours: settings.trip.returnReviewHours }]);
    return effects;
  });
  await runEffects(fx);
}

/** Provisional settlement shown to renter/host before finalisation. */
export async function previewSettlement(b, damagePaise = 0) {
  const settings = await getSettings();
  const vehicle = await Vehicle.findById(b.vehicleId).select('fuelType').lean();
  return computeSettlement({
    startOdometer: b.trip.startOdometerKm,
    endOdometer: b.trip.endOdometerKm,
    includedKm: b.pricing.includedKm,
    extraKmChargePaise: b.pricing.extraKmChargePaise,
    startFuelEighths: b.trip.startFuelEighths,
    endFuelEighths: b.trip.endFuelEighths,
    fuelChargePerEighthPaise: settings.trip.fuelChargePerEighthPaise,
    scheduledEndAt: b.endAt,
    actualEndAt: b.trip.returnSubmittedAt,
    lateGraceMinutes: settings.trip.lateGraceMinutes,
    hourlyPaise: b.pricing.hourlyPaise,
    lateFeeMultiplierBps: settings.trip.lateFeeMultiplierBps,
    damagePaise,
    depositPaise: b.pricing.depositPaise,
    isElectric: vehicle?.fuelType === 'electric',
  });
}

/**
 * Completes the trip: deductions from the deposit, deposit refund, outstanding dues,
 * host earnings, loyalty points, referral rewards and stats — all in one transaction.
 */
export async function finalizeTrip(bookingId, { damagePaise = 0, damageNote, by }, session) {
  const b = await Booking.findById(bookingId).session(session);
  if (!b || b.status !== 'return_pending') throw conflict('This trip is not awaiting completion.', 'NOT_RETURN_PENDING');
  const settings = await getSettings();
  const s = await previewSettlement(b, damagePaise);
  const fx = newEffects();

  const extensionRental = b.extensions.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.pricing.rentalPaise, 0);
  const usageCharges = b.pricing.rentalPaise + extensionRental + s.extraKmPaise + s.fuelPaise + s.lateFeePaise;
  const commissionPaise = pct(usageCharges, b.pricing.commissionBps);
  const vendorEarningPaise = usageCharges - commissionPaise + s.damagePaise;

  transition(b, 'completed', by, 'Trip settled');
  b.trip.endedAt = new Date();
  b.settlement = { ...s, damageNote, outstandingStatus: s.outstandingPaise > 0 ? 'due' : 'none', commissionPaise, vendorEarningPaise, settledAt: new Date(), settledBy: by };
  await b.save({ session });

  if (s.depositRefundPaise > 0) {
    fx.refunds.push(...(await recordBookingRefund(b, s.depositRefundPaise, 'deposit_settlement', { key: `deposit:${b._id}`, by }, session)));
  }
  await creditVendorEarning(b.vendorId, vendorEarningPaise, { bookingId: b._id, key: `earning:${b._id}` }, session);

  if (settings.loyalty.enabled) {
    const points = pct(b.pricing.rentalPaise + extensionRental - b.pricing.discountPaise, settings.loyalty.earnBps);
    if (points > 0) await creditUserWallet(b.userId, points, 'loyalty_reward', { bookingId: b._id, key: `loyalty:${b._id}`, note: `Trip ${b.ref}` }, session);
  }
  const referral = await rewardReferralIfQualified(b.userId, b._id, session);
  if (referral) {
    fx.notifications.push(['referral.rewarded', { realm: 'user', id: referral.referrerId }, { amountPaise: referral.referrerRewardPaise }]);
    fx.notifications.push(['referral.rewarded', { realm: 'user', id: referral.refereeId }, { amountPaise: referral.refereeRewardPaise }]);
  }
  await Vehicle.updateOne({ _id: b.vehicleId }, { $inc: { 'stats.trips': 1, 'stats.earningsPaise': vendorEarningPaise }, $max: { lastOdometerKm: b.trip.endOdometerKm } }, { session });
  await User.updateOne({ _id: b.userId }, { $inc: { 'stats.tripsCompleted': 1, 'stats.totalSpentPaise': b.pricing.chargesPaise + s.totalDeductionsPaise } }, { session });
  fx.notifications.push(['trip.completed', { realm: 'user', id: b.userId }, { bookingId: b._id, ref: b.ref, depositRefundPaise: s.depositRefundPaise }]);
  return fx;
}

/** Host reviews a returned car: accept as-is, or file a damage claim for admin approval. */
export async function vendorReturnReview(req, bookingId, { decision, damagePaise, description, photoFileIds }) {
  const fx = await withTransaction(async (session) => {
    const b = await Booking.findOne({ _id: bookingId, vendorId: req.auth.id }).session(session);
    if (!b) throw notFound('Booking');
    if (b.status !== 'return_pending') throw conflict('This return has already been reviewed.', 'NOT_RETURN_PENDING');
    if (await DamageClaim.exists({ bookingId: b._id }).session(session)) throw conflict('A damage claim is already under review.', 'CLAIM_EXISTS');
    const by = { realm: 'vendor', id: req.auth.id };
    if (decision === 'accept') {
      const effects = await finalizeTrip(b._id, { by }, session);
      await audit(req, 'trip.return_accepted', { type: 'booking', id: b._id }, { session });
      return effects;
    }
    await claimFiles(req.auth, photoFileIds, ['damage_photo'], { session });
    await DamageClaim.create([{ bookingId: b._id, vendorId: req.auth.id, amountPaise: damagePaise, description, photoFileIds }], { session });
    await attachFiles(photoFileIds, { type: 'booking', id: b._id }, session);
    // Pause the auto-complete timer; admins resolve claims.
    await Booking.updateOne({ _id: b._id }, { $unset: { 'trip.returnReviewDueAt': 1 } }, { session });
    await audit(req, 'trip.damage_claimed', { type: 'booking', id: b._id }, { changes: { damagePaise }, session });
    return newEffects();
  });
  await runEffects(fx);
}

/** Admin decision on a host's damage claim, then completion. */
export async function resolveDamageClaim(req, bookingId, { decision, approvedPaise, note }) {
  const fx = await withTransaction(async (session) => {
    const claim = await DamageClaim.findOne({ bookingId, status: 'pending' }).session(session);
    if (!claim) throw notFound('Pending damage claim');
    if (decision === 'approve' && (!approvedPaise || approvedPaise > claim.amountPaise)) throw badRequest('Approved amount must be between ₹1 and the claimed amount.', undefined, 'AMOUNT_INVALID');
    claim.status = decision === 'approve' ? 'approved' : 'rejected';
    claim.approvedPaise = decision === 'approve' ? approvedPaise : 0;
    claim.review = { by: req.auth.id, at: new Date(), note };
    await claim.save({ session });
    const effects = await finalizeTrip(bookingId, { damagePaise: claim.approvedPaise, damageNote: note || claim.description, by: { realm: 'admin', id: req.auth.id } }, session);
    await audit(req, `trip.damage_claim_${claim.status}`, { type: 'booking', id: bookingId }, { changes: { claimed: claim.amountPaise, approved: claim.approvedPaise }, reason: note, session });
    return effects;
  });
  await runEffects(fx);
}

/** Renter pays settlement dues beyond the deposit. */
export async function settlementPaymentOrder(userId, bookingId) {
  const b = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!b) throw notFound('Booking');
  if (b.settlement?.outstandingStatus !== 'due' || !b.settlement.outstandingPaise) throw conflict('Nothing is due on this trip.', 'NOTHING_DUE');
  return openPaymentOrder({ booking: b, purpose: 'settlement', amountPaise: b.settlement.outstandingPaise });
}

/** Job: complete returns the host did not review within the window. */
export async function autoCompleteReturns() {
  const due = await Booking.find({ status: 'return_pending', 'trip.returnReviewDueAt': { $lt: new Date() } }).select('_id').limit(100).lean();
  for (const { _id } of due) {
    const fx = await withTransaction(async (session) => {
      if (await DamageClaim.exists({ bookingId: _id }).session(session)) return null;
      return finalizeTrip(_id, { by: { realm: 'system' } }, session);
    }).catch(() => null);
    await runEffects(fx);
  }
  return due.length;
}

export async function inspectionsFor(bookingId) {
  const [list, claim, agreement] = await Promise.all([
    TripInspection.find({ bookingId }).lean(),
    DamageClaim.findOne({ bookingId }).lean(),
    RentalAgreement.findOne({ bookingId }).select('acceptedName acceptedAt documentVersion title').lean(),
  ]);
  const ser = (i) => i && { id: i._id, kind: i.kind, photos: i.photos.map((p) => ({ fileId: p.fileId, angle: p.angle, url: `/api/v1/files/${p.fileId}` })), odometerKm: i.odometerKm, fuelEighths: i.fuelEighths, batteryPercent: i.batteryPercent, checklist: i.checklist, damages: i.damages, notes: i.notes, createdAt: i.createdAt };
  return {
    pickup: ser(list.find((i) => i.kind === 'pickup')),
    return: ser(list.find((i) => i.kind === 'return')),
    damageClaim: claim && { amountPaise: claim.amountPaise, description: claim.description, photoFileIds: claim.photoFileIds, status: claim.status, approvedPaise: claim.approvedPaise, reviewNote: claim.review?.note },
    agreement: agreement && { name: agreement.acceptedName, at: agreement.acceptedAt, version: agreement.documentVersion, title: agreement.title },
  };
}

// Inspection and damage photos are evidence: visible to the renter and host of that booking.
async function bookingParticipant(auth, file) {
  if (file.linkedTo?.type !== 'booking') return false;
  const b = await Booking.findById(file.linkedTo.id).select('userId vendorId').lean();
  if (!b) return false;
  return (auth.realm === 'user' && String(b.userId) === String(auth.id)) || (auth.realm === 'vendor' && String(b.vendorId) === String(auth.id));
}
registerFileAccessRule('inspection_photo', bookingParticipant);
registerFileAccessRule('damage_photo', bookingParticipant);


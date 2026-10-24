import { fromGeoPoint } from '../../integrations/maps.js';

import { pct } from '../../core/money.js';

const ALL_VISIBLE = { renterName: true, renterPhone: true, renterKycStatus: true, bookingAmounts: true, paymentStatus: true };
// Used for host views when the caller did not resolve the host's settings: reveal nothing optional.
const MINIMAL = { renterName: false, renterPhone: false, renterKycStatus: false, bookingAmounts: false, paymentStatus: false };

/**
 * Money split for admins: Way2Cars' share vs the car owner's. Before the trip settles the shares are
 * expected values from the booking snapshot; settled trips use the recorded earning; cancelled ones
 * use `ownerEarnedPaise` (credited on late cancellations) when the caller knows it.
 */
export function bookingSplit(b, { ownerEarnedPaise } = {}) {
  const p = b.pricing || {};
  const applied = (b.extensions || []).filter((e) => ['paid', 'approved'].includes(e.status) && e.chargeStatus !== 'waived');
  const extRental = applied.reduce((s, e) => s + e.pricing.rentalPaise, 0);
  const extTotal = applied.reduce((s, e) => s + e.pricing.totalPaise, 0);
  const settled = Boolean(b.settlement?.settledAt);
  const closed = ['cancelled', 'rejected', 'expired'].includes(b.status);
  const company = b.ownership === 'company';
  const collectedPaise = Math.max(0, (b.payment?.paidPaise || 0) - (b.payment?.refundedPaise || 0));
  const fullGst = (p.gstPaise || 0) + applied.reduce((s, e) => s + (e.pricing.gstPaise || 0), 0);
  const charges = (p.chargesPaise || 0) + extTotal;

  let ownerPaise;
  let gstPaise = fullGst;
  let depositHeldPaise = 0;
  let platformPaise;
  if (settled) {
    ownerPaise = b.settlement.vendorEarningPaise || 0;
    platformPaise = collectedPaise - ownerPaise - gstPaise;
  } else if (closed) {
    ownerPaise = company ? 0 : ownerEarnedPaise || 0;
    // Only the share of charges actually kept carries GST.
    gstPaise = charges ? Math.round(fullGst * Math.min(1, collectedPaise / charges)) : 0;
    platformPaise = collectedPaise - ownerPaise - gstPaise;
  } else {
    const base = (p.rentalPaise || 0) + extRental;
    ownerPaise = company ? 0 : base - pct(base, p.commissionBps || 0);
    depositHeldPaise = Math.max(0, Math.min(p.depositPaise || 0, collectedPaise + (p.walletAppliedPaise || 0) - charges));
    platformPaise = charges - fullGst - ownerPaise; // expected once everything is collected
  }
  return {
    ownership: b.ownership || 'host',
    commissionBps: p.commissionBps,
    collectedPaise,
    ownerPaise,
    platformPaise,
    gstPaise,
    depositHeldPaise,
    status: settled ? 'settled' : closed ? 'closed' : 'pending_trip',
  };
}

/**
 * Booking views per audience. Renters see host contact + exact pickup only once confirmed;
 * hosts never see renter identity documents, and see renter details and money only as far as
 * admins allow (`visibility`, from hostVisibilityFor).
 */
export function serializeBooking(b, { audience = 'user', user, vendor, vehicle, visibility } = {}) {
  if (!b) return null;
  const show = audience === 'vendor' ? (visibility || MINIMAL) : ALL_VISIBLE;
  const revealLocation = ['confirmed', 'ongoing', 'return_pending', 'completed'].includes(b.status);
  const base = {
    id: b._id,
    ref: b.ref,
    status: b.status,
    vehicleId: b.vehicleId,
    vehicle: b.vehicleSnapshot,
    startAt: b.startAt,
    endAt: b.endAt,
    originalEndAt: b.originalEndAt,
    instantBooking: b.instantBooking,
    holdExpiresAt: b.status === 'pending_payment' ? b.holdExpiresAt : null,
    vendorDecisionDueAt: b.status === 'pending_vendor_approval' ? b.vendorDecisionDueAt : null,
    pickup: b.pickup ? {
      type: b.pickup.type,
      address: audience !== 'user' || revealLocation || b.pickup.type === 'doorstep' ? b.pickup.address : null,
      point: audience !== 'user' || revealLocation ? fromGeoPoint(b.pickup.point) : null,
      distanceKm: b.pickup.distanceKm,
    } : null,
    pricing: audience === 'vendor'
      ? (show.bookingAmounts
        ? { hours: b.pricing.hours, rentalPaise: b.pricing.rentalPaise, depositPaise: b.pricing.depositPaise, includedKm: b.pricing.includedKm, extraKmChargePaise: b.pricing.extraKmChargePaise, commissionBps: b.pricing.commissionBps, deliveryFeePaise: b.pricing.deliveryFeePaise }
        : { hours: b.pricing.hours, includedKm: b.pricing.includedKm, extraKmChargePaise: b.pricing.extraKmChargePaise })
      : b.pricing,
    payment: audience === 'vendor' ? (show.paymentStatus ? { status: b.payment.status } : null) : b.payment,
    balance: audience === 'vendor' || !b.balance?.status ? null : { duePaise: b.balance.duePaise, dueAt: b.balance.dueAt, status: b.balance.status, paidAt: b.balance.paidAt },
    source: b.source || 'app',
    cancellation: b.cancellation?.at ? (audience === 'vendor' && !show.bookingAmounts ? { by: b.cancellation.by, reason: b.cancellation.reason, at: b.cancellation.at } : b.cancellation) : null,
    extensions: (b.extensions || []).filter((e) => audience !== 'vendor' || ['paid', 'approved'].includes(e.status)).map((e) => ({
      id: e._id, previousEndAt: e.previousEndAt, requestedEndAt: e.requestedEndAt, status: e.status,
      pricing: audience === 'vendor' ? (show.bookingAmounts ? { hours: e.pricing.hours, rentalPaise: e.pricing.rentalPaise } : { hours: e.pricing.hours }) : e.pricing,
      holdExpiresAt: e.holdExpiresAt,
      ...(audience === 'vendor' ? {} : { chargeStatus: e.chargeStatus || (e.status === 'paid' ? 'paid' : null), reason: e.reason, decidedAt: e.decidedAt, requestedAt: e.createdAt }),
    })),
    trip: b.trip,
    settlement: b.settlement?.settledAt
      ? (audience === 'vendor'
        ? (show.bookingAmounts
          ? { ...b.settlement, depositRefundPaise: undefined }
          : { kmDriven: b.settlement.kmDriven, extraKm: b.settlement.extraKm, fuelShortEighths: b.settlement.fuelShortEighths, lateHours: b.settlement.lateHours, damageNote: b.settlement.damageNote, vendorEarningPaise: b.settlement.vendorEarningPaise, settledAt: b.settlement.settledAt })
        : { ...b.settlement, commissionPaise: undefined, vendorEarningPaise: undefined })
      : null,
    reviewed: b.reviewed,
    createdAt: b.createdAt,
  };
  if (audience === 'user' && vendor && revealLocation) base.host = { name: vendor.businessName || vendor.name, phone: vendor.phone };
  if (audience === 'vendor' && user) {
    base.renter = {
      name: show.renterName ? user.name : 'Renter',
      phone: show.renterPhone && ['confirmed', 'ongoing', 'return_pending'].includes(b.status) ? user.phone : undefined,
      kycStatus: show.renterKycStatus ? user.kyc?.status : undefined,
      tripsCompleted: user.stats?.tripsCompleted || 0,
    };
    base.visibility = show;
  }
  if (audience === 'vendor') {
    // The host always sees their own split (expected until the trip settles), even when booking amounts are hidden.
    const split = bookingSplit(b);
    base.ownerShare = { commissionBps: b.pricing.commissionBps, earningPaise: split.ownerPaise, final: split.status !== 'pending_trip' };
  }
  if (audience === 'admin') {
    base.ownership = b.ownership || 'host';
    base.createdBy = b.createdBy;
    base.officeNote = b.officeNote;
    base.split = bookingSplit(b);
    base.userId = b.userId;
    base.vendorId = b.vendorId;
    base.statusHistory = b.statusHistory;
    if (user) base.renter = { id: user._id, name: user.name, phone: user.phone, kycStatus: user.kyc?.status };
    if (vendor) base.host = { id: vendor._id, name: vendor.businessName || vendor.name, phone: vendor.phone };
  }
  if (vehicle) base.vehicleDetails = vehicle;
  return base;
}

import { fromGeoPoint } from '../../integrations/maps.js';

/**
 * Booking views per audience. Renters see host contact + exact pickup only once confirmed;
 * hosts never see renter identity documents.
 */
export function serializeBooking(b, { audience = 'user', user, vendor, vehicle } = {}) {
  if (!b) return null;
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
      ? { hours: b.pricing.hours, rentalPaise: b.pricing.rentalPaise, depositPaise: b.pricing.depositPaise, includedKm: b.pricing.includedKm, extraKmChargePaise: b.pricing.extraKmChargePaise, commissionBps: b.pricing.commissionBps, deliveryFeePaise: b.pricing.deliveryFeePaise }
      : b.pricing,
    payment: audience === 'vendor' ? { status: b.payment.status } : b.payment,
    cancellation: b.cancellation?.at ? b.cancellation : null,
    extensions: (b.extensions || []).map((e) => ({ id: e._id, previousEndAt: e.previousEndAt, requestedEndAt: e.requestedEndAt, status: e.status, pricing: audience === 'vendor' ? { hours: e.pricing.hours, rentalPaise: e.pricing.rentalPaise } : e.pricing, holdExpiresAt: e.holdExpiresAt })),
    trip: b.trip,
    settlement: b.settlement?.settledAt
      ? (audience === 'vendor' ? { ...b.settlement, depositRefundPaise: undefined } : { ...b.settlement, commissionPaise: undefined, vendorEarningPaise: undefined })
      : null,
    reviewed: b.reviewed,
    createdAt: b.createdAt,
  };
  if (audience === 'user' && vendor && revealLocation) base.host = { name: vendor.businessName || vendor.name, phone: vendor.phone };
  if (audience === 'vendor' && user) base.renter = { name: user.name, phone: ['confirmed', 'ongoing', 'return_pending'].includes(b.status) ? user.phone : undefined, kycStatus: user.kyc?.status, tripsCompleted: user.stats?.tripsCompleted || 0 };
  if (audience === 'admin') {
    base.userId = b.userId;
    base.vendorId = b.vendorId;
    base.statusHistory = b.statusHistory;
    if (user) base.renter = { id: user._id, name: user.name, phone: user.phone, kycStatus: user.kyc?.status };
    if (vendor) base.host = { id: vendor._id, name: vendor.businessName || vendor.name, phone: vendor.phone };
  }
  if (vehicle) base.vehicleDetails = vehicle;
  return base;
}

import { DAY_MS, HOUR_MS, istDate, isWeekendIst } from '../../core/time.js';
import { pct } from '../../core/money.js';

/**
 * Pure pricing functions — no I/O, fully unit-tested. All amounts are integer paise.
 *
 * Rental: the trip is split into consecutive 24-hour blocks from the pickup time. Each full block
 * is charged that day's rate (IST calendar date of the block start): a date override from the
 * host's pricing calendar, else the weekend rate on Sat/Sun, else the regular daily rate.
 * A trailing partial block is charged hourly (rounded up to whole hours), capped at that day's rate.
 */

function ratesFor(date, pricing, overrides) {
  const ov = overrides?.get(date);
  const ratio = (daily) => daily / pricing.dailyPaise;
  if (ov) return { dailyPaise: ov.dailyPaise, hourlyPaise: ov.hourlyPaise ?? Math.round(pricing.hourlyPaise * ratio(ov.dailyPaise)), source: 'calendar' };
  return null;
}

export function dayRates(atDate, pricing, overrides) {
  const date = istDate(atDate);
  const ov = ratesFor(date, pricing, overrides);
  if (ov) return { date, ...ov };
  if (pricing.weekendDailyPaise && isWeekendIst(atDate)) {
    return { date, dailyPaise: pricing.weekendDailyPaise, hourlyPaise: Math.round((pricing.hourlyPaise * pricing.weekendDailyPaise) / pricing.dailyPaise), source: 'weekend' };
  }
  return { date, dailyPaise: pricing.dailyPaise, hourlyPaise: pricing.hourlyPaise, source: 'standard' };
}

export function billableHours(startAt, endAt) {
  const ms = new Date(endAt) - new Date(startAt);
  if (!(ms > 0)) throw new Error('endAt must be after startAt');
  return Math.ceil(ms / HOUR_MS);
}

export function computeRental({ startAt, endAt, pricing, overrides }) {
  const start = new Date(startAt).getTime();
  const hours = billableHours(startAt, endAt);
  const fullDays = Math.floor(hours / 24);
  const remHours = hours % 24;
  const lines = [];
  for (let i = 0; i < fullDays; i++) {
    const r = dayRates(start + i * DAY_MS, pricing, overrides);
    lines.push({ kind: 'day', date: r.date, hours: 24, ratePaise: r.dailyPaise, amountPaise: r.dailyPaise, source: r.source });
  }
  if (remHours > 0) {
    const r = dayRates(start + fullDays * DAY_MS, pricing, overrides);
    const amount = Math.min(remHours * r.hourlyPaise, r.dailyPaise);
    lines.push({ kind: 'hours', date: r.date, hours: remHours, ratePaise: r.hourlyPaise, amountPaise: amount, source: r.source, capped: amount === r.dailyPaise });
  }
  const rentalPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
  const includedKm = Math.round((pricing.includedKmPerDay * hours) / 24);
  return { hours, lines, rentalPaise, includedKm };
}

/** Delivery fee = base + per-km × road distance (km rounded up). */
export function deliveryFee(distanceMeters, fees) {
  const km = Math.ceil(distanceMeters / 1000);
  return { km, feePaise: fees.deliveryBaseFeePaise + km * fees.deliveryPerKmPaise };
}

/** Coupon discount on the rental amount. */
export function couponDiscount(coupon, rentalPaise) {
  if (!coupon) return 0;
  let d = coupon.type === 'percent' ? pct(rentalPaise, coupon.valueBps) : coupon.valuePaise;
  if (coupon.maxDiscountPaise) d = Math.min(d, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(d, rentalPaise));
}

/**
 * Assembles the full price. GST applies to rental (after discount) + delivery + convenience fee.
 * The refundable security deposit is not taxed. Wallet credit reduces the amount charged to the
 * gateway, capped at maxRedeemBps of the rental.
 */
export function assembleQuote({ rental, deliveryFeePaise = 0, convenienceFeePaise = 0, discountPaise = 0, gstBps, depositPaise, walletBalancePaise = 0, useWallet = false, maxRedeemBps = 0 }) {
  const rentalAfterDiscount = rental.rentalPaise - discountPaise;
  const taxablePaise = rentalAfterDiscount + deliveryFeePaise + convenienceFeePaise;
  const gstPaise = pct(taxablePaise, gstBps);
  const chargesPaise = taxablePaise + gstPaise; // non-refundable portion before policy
  const totalPaise = chargesPaise + depositPaise;
  const walletCap = pct(rental.rentalPaise, maxRedeemBps);
  const walletAppliedPaise = useWallet ? Math.max(0, Math.min(walletBalancePaise, walletCap, chargesPaise)) : 0;
  return {
    hours: rental.hours,
    lines: rental.lines,
    rentalPaise: rental.rentalPaise,
    discountPaise,
    deliveryFeePaise,
    convenienceFeePaise,
    taxablePaise,
    gstBps,
    gstPaise,
    chargesPaise,
    depositPaise,
    totalPaise,
    walletAppliedPaise,
    payablePaise: totalPaise - walletAppliedPaise,
    includedKm: rental.includedKm,
  };
}

/** Refund share for a cancellation `hoursBeforeStart` hours ahead, using the policy tiers. */
export function cancellationRefundBps(tiers, hoursBeforeStart) {
  const sorted = [...tiers].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);
  for (const t of sorted) if (hoursBeforeStart >= t.minHoursBeforeStart) return t.refundBps;
  return 0;
}

/**
 * Trip settlement on return. Deductions come out of the deposit; anything beyond it is
 * outstanding and must be paid by the renter.
 */
export function computeSettlement({ startOdometer, endOdometer, includedKm, extraKmChargePaise, startFuelEighths, endFuelEighths, fuelChargePerEighthPaise, scheduledEndAt, actualEndAt, lateGraceMinutes, hourlyPaise, lateFeeMultiplierBps, damagePaise = 0, depositPaise, isElectric = false }) {
  const kmDriven = Math.max(0, endOdometer - startOdometer);
  const extraKm = Math.max(0, kmDriven - includedKm);
  const extraKmPaise = extraKm * extraKmChargePaise;
  const fuelShortEighths = isElectric ? 0 : Math.max(0, startFuelEighths - endFuelEighths);
  const fuelPaise = fuelShortEighths * fuelChargePerEighthPaise;
  const lateMinutes = Math.max(0, (new Date(actualEndAt) - new Date(scheduledEndAt)) / 60_000 - lateGraceMinutes);
  const lateHours = lateMinutes > 0 ? Math.ceil(lateMinutes / 60) : 0;
  const lateFeePaise = lateHours * pct(hourlyPaise, lateFeeMultiplierBps);
  const totalDeductionsPaise = extraKmPaise + fuelPaise + lateFeePaise + damagePaise;
  const depositRefundPaise = Math.max(0, depositPaise - totalDeductionsPaise);
  const outstandingPaise = Math.max(0, totalDeductionsPaise - depositPaise);
  return { kmDriven, extraKm, extraKmPaise, fuelShortEighths, fuelPaise, lateHours, lateFeePaise, damagePaise, totalDeductionsPaise, depositRefundPaise, outstandingPaise };
}

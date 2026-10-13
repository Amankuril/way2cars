import { describe, it, expect } from 'vitest';
import { computeRental, assembleQuote, couponDiscount, cancellationRefundBps, computeSettlement, deliveryFee } from '../src/modules/pricing/pricing.js';
import { istDate, isWeekendIst } from '../src/core/time.js';

const pricing = { hourlyPaise: 20000, dailyPaise: 240000, weekendDailyPaise: 300000, includedKmPerDay: 300 };
// 2026-10-14 is a Wednesday. 10:00 IST = 04:30Z.
const wed10 = new Date('2026-10-14T04:30:00Z');
const h = (n) => new Date(wed10.getTime() + n * 3600_000);

describe('IST calendar helpers', () => {
  it('computes IST dates across the UTC midnight boundary', () => {
    expect(istDate(new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15'); // 00:30 IST next day
    expect(isWeekendIst(new Date('2026-10-17T04:30:00Z'))).toBe(true); // Saturday
    expect(isWeekendIst(wed10)).toBe(false);
  });
});

describe('computeRental', () => {
  it('charges hourly for short trips', () => {
    const r = computeRental({ startAt: wed10, endAt: h(5), pricing });
    expect(r.rentalPaise).toBe(5 * 20000);
    expect(r.hours).toBe(5);
    expect(r.includedKm).toBe(63); // 300 * 5/24 rounded
  });
  it('caps a partial day at the daily rate', () => {
    const r = computeRental({ startAt: wed10, endAt: h(20), pricing });
    expect(r.rentalPaise).toBe(240000);
    expect(r.lines[0].capped).toBe(true);
  });
  it('rounds partial hours up', () => {
    const r = computeRental({ startAt: wed10, endAt: new Date(wed10.getTime() + 90 * 60000), pricing });
    expect(r.hours).toBe(2);
  });
  it('uses weekend rate for blocks starting on Sat/Sun and standard otherwise', () => {
    // Wed 10:00 → Mon 10:00 = 5 days: Wed, Thu, Fri, Sat(weekend), Sun(weekend)
    const r = computeRental({ startAt: wed10, endAt: h(24 * 5), pricing });
    expect(r.lines.map((l) => l.source)).toEqual(['standard', 'standard', 'standard', 'weekend', 'weekend']);
    expect(r.rentalPaise).toBe(3 * 240000 + 2 * 300000);
    expect(r.includedKm).toBe(1500);
  });
  it('pricing calendar overrides beat weekend rates and scale hourly when not given', () => {
    const overrides = new Map([['2026-10-15', { dailyPaise: 360000 }]]);
    const r = computeRental({ startAt: wed10, endAt: h(24 + 3), pricing, overrides });
    expect(r.lines[0].amountPaise).toBe(240000);
    expect(r.lines[1]).toMatchObject({ kind: 'hours', hours: 3, source: 'calendar', ratePaise: 30000, amountPaise: 90000 });
  });
  it('rejects inverted ranges', () => {
    expect(() => computeRental({ startAt: h(2), endAt: wed10, pricing })).toThrow();
  });
});

describe('assembleQuote', () => {
  it('taxes rental-after-discount + fees, never the deposit; caps wallet', () => {
    const rental = computeRental({ startAt: wed10, endAt: h(24), pricing });
    const q = assembleQuote({ rental, deliveryFeePaise: 50000, convenienceFeePaise: 9900, discountPaise: 40000, gstBps: 1800, depositPaise: 500000, walletBalancePaise: 100000, useWallet: true, maxRedeemBps: 2000 });
    expect(q.taxablePaise).toBe(240000 - 40000 + 50000 + 9900);
    expect(q.gstPaise).toBe(Math.round(259900 * 0.18));
    expect(q.totalPaise).toBe(q.taxablePaise + q.gstPaise + 500000);
    expect(q.walletAppliedPaise).toBe(48000); // 20% of rental, below balance
    expect(q.payablePaise).toBe(q.totalPaise - 48000);
  });
});

describe('coupons, cancellation, delivery', () => {
  it('percent coupons respect the cap; flat coupons never exceed rental', () => {
    expect(couponDiscount({ type: 'percent', valueBps: 2000, maxDiscountPaise: 30000 }, 240000)).toBe(30000);
    expect(couponDiscount({ type: 'flat', valuePaise: 500000 }, 240000)).toBe(240000);
  });
  it('picks the right cancellation tier', () => {
    const tiers = [{ minHoursBeforeStart: 24, refundBps: 10000 }, { minHoursBeforeStart: 6, refundBps: 5000 }, { minHoursBeforeStart: 0, refundBps: 0 }];
    expect(cancellationRefundBps(tiers, 48)).toBe(10000);
    expect(cancellationRefundBps(tiers, 10)).toBe(5000);
    expect(cancellationRefundBps(tiers, 1)).toBe(0);
  });
  it('delivery fee rounds km up', () => {
    expect(deliveryFee(4100, { deliveryBaseFeePaise: 29900, deliveryPerKmPaise: 1500 })).toEqual({ km: 5, feePaise: 29900 + 7500 });
  });
});

describe('computeSettlement', () => {
  const base = { startOdometer: 10000, includedKm: 300, extraKmChargePaise: 1200, startFuelEighths: 8, fuelChargePerEighthPaise: 40000, scheduledEndAt: h(24), lateGraceMinutes: 30, hourlyPaise: 20000, lateFeeMultiplierBps: 15000, depositPaise: 500000 };
  it('refunds the full deposit for a clean, on-time return', () => {
    const s = computeSettlement({ ...base, endOdometer: 10250, endFuelEighths: 8, actualEndAt: h(24) });
    expect(s).toMatchObject({ extraKm: 0, totalDeductionsPaise: 0, depositRefundPaise: 500000, outstandingPaise: 0 });
  });
  it('deducts extra km, fuel and late fees; grace applies', () => {
    const s = computeSettlement({ ...base, endOdometer: 10400, endFuelEighths: 6, actualEndAt: new Date(h(24).getTime() + 95 * 60000) });
    expect(s.extraKmPaise).toBe(100 * 1200);
    expect(s.fuelPaise).toBe(2 * 40000);
    expect(s.lateHours).toBe(2); // 95 - 30 grace = 65 min → 2h
    expect(s.lateFeePaise).toBe(2 * 30000);
    expect(s.depositRefundPaise).toBe(500000 - 120000 - 80000 - 60000);
  });
  it('reports outstanding amounts beyond the deposit and ignores fuel for EVs', () => {
    const s = computeSettlement({ ...base, endOdometer: 11000, endFuelEighths: 0, actualEndAt: h(24), damagePaise: 300000, isElectric: true });
    expect(s.fuelPaise).toBe(0);
    expect(s.outstandingPaise).toBe(700 * 1200 + 300000 - 500000);
    expect(s.depositRefundPaise).toBe(0);
  });
});

import { money, dateLong, percent } from '@shared/lib/format';

/** "20% OFF" / "₹500 OFF" — straight from the coupon's own value. */
export const offerValue = (o) => (o.type === 'percent' ? `${percent(o.valueBps)} OFF` : `${money(o.valuePaise)} OFF`);

/** Terms line built only from the coupon's real limits. */
export const offerTerms = (o) => [
  o.type === 'percent' && o.maxDiscountPaise ? `Up to ${money(o.maxDiscountPaise)}` : null,
  o.minRentalPaise ? `On trips above ${money(o.minRentalPaise)}` : null,
  o.firstBookingOnly ? 'First booking only' : null,
  o.endsAt ? `Valid till ${dateLong(o.endsAt)}` : null,
].filter(Boolean).join(' · ');

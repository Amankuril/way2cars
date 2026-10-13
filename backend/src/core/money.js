/** All money is integer paise. Never use floats for stored amounts. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paise) => paise / 100;
/** Percentage of an amount using basis points (1% = 100 bps), rounded half-up to the paisa. */
export const pct = (paise, bps) => Math.round((paise * bps) / 10000);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export function assertPaise(v, name = 'amount') {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer (paise)`);
  return v;
}

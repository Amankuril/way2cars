/** Re-exports of shared helpers used across the host app. */
export * from '@shared/lib/format';
export const pct = (paise, bps) => Math.round((paise * (bps || 0)) / 10000);

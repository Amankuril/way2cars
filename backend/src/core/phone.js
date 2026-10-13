import { badRequest } from './errors.js';

/**
 * Normalises an Indian mobile number to its 10-digit national form.
 * Accepts "+91 98765-43210", "09876543210", "919876543210", "9876543210".
 */
export function normalizeIndianMobile(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let d = String(input).replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function requireMobile(input) {
  const n = normalizeIndianMobile(input);
  if (!n) throw badRequest('Enter a valid 10-digit Indian mobile number.', undefined, 'INVALID_PHONE');
  return n;
}

export const maskPhone = (p) => (p ? `${p.slice(0, 2)}******${p.slice(-2)}` : p);
export const e164 = (p) => `+91${p}`;

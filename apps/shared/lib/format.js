/** Formatting helpers. All money is integer paise; all times are shown in IST. */
const IST = 'Asia/Kolkata';

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹2,400 (whole rupees) or ₹2,400.50 when paise are present / exact=true. */
export function money(paise, { exact = false, sign = false } = {}) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  const neg = paise < 0;
  const abs = Math.abs(paise) / 100;
  const body = exact || abs % 1 ? inr2.format(abs) : inr0.format(abs);
  return `${neg ? '−' : sign ? '+' : ''}₹${body}`;
}

const parts = (d, opts) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...opts }).format(new Date(d));

/** "Sat, 14 Oct" */
export const dayLabel = (d) => parts(d, { weekday: 'short', day: 'numeric', month: 'short' });
/** "9:30 AM" */
export const timeLabel = (d) => parts(d, { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
/** "14 Oct, 9:30 AM" */
export const dateTime = (d) => `${parts(d, { day: 'numeric', month: 'short' })}, ${timeLabel(d)}`;
/** "14 Oct 2026" */
export const dateLong = (d) => parts(d, { day: 'numeric', month: 'short', year: 'numeric' });

/** "1 day 4 hrs" */
export function duration(startAt, endAt) {
  const hours = Math.ceil((new Date(endAt) - new Date(startAt)) / 3600000);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return [d ? `${d} day${d > 1 ? 's' : ''}` : '', h ? `${h} hr${h > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || '0 hrs';
}

export const km = (m) => (m === undefined || m === null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
export const percent = (bps) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
export const maskPhone = (p) => (p ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : '');
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'W';

/** Relative time for inbox/tickets: "just now", "5 min ago", "Yesterday", "12 Oct". */
export function ago(d) {
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 172800) return 'Yesterday';
  return parts(d, { day: 'numeric', month: 'short' });
}

/** Rounds a Date up to the next half hour (booking times are on 30-min steps). */
export function nextHalfHour(from = new Date(), minutesAhead = 0) {
  const step = 30 * 60000;
  return new Date(Math.ceil((from.getTime() + minutesAhead * 60000) / step) * step);
}

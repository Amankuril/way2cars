/** Small, dependency-free helpers used across the admin app. */

export const cn = (...parts) => parts.flat().filter(Boolean).join(' ');

// ---------------------------------------------------------------- money & percentages
/** "2,499.50" (rupees, as typed) → 249950 paise. Returns null for blank / invalid input. */
export function toPaise(rupees) {
  if (rupees === '' || rupees === null || rupees === undefined) return null;
  const n = Number(String(rupees).replace(/[,\s₹]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
/** 249950 → "2499.5" — for prefilling rupee inputs. */
export const toRupeesInput = (paise) => (paise === null || paise === undefined ? '' : String(paise / 100));
/** 1800 bps → "18" */
export const bpsToPctInput = (bps) => (bps === null || bps === undefined ? '' : String(bps / 100));
/** "18.5" → 1850 bps */
export function pctToBps(pct) {
  if (pct === '' || pct === null || pct === undefined) return null;
  const n = Number(pct);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export const fmtNumber = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN').format(n));

// ---------------------------------------------------------------- IST date inputs
const IST_OFFSET_MIN = 330;
const shiftIst = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MIN * 60000);

/** Date → "YYYY-MM-DD" as the IST calendar day (for <input type="date">). */
export const istDateInput = (d) => (d ? shiftIst(d).toISOString().slice(0, 10) : '');
/** Date → "YYYY-MM-DDTHH:mm" in IST (for <input type="datetime-local">). */
export const istDateTimeInput = (d) => (d ? shiftIst(d).toISOString().slice(0, 16) : '');
/** "YYYY-MM-DDTHH:mm" typed in IST → ISO string. */
export const fromIstDateTime = (v) => (v ? new Date(`${v}:00+05:30`).toISOString() : null);
/** "YYYY-MM-DD" → ISO of 00:00 IST that day. */
export const istDayStart = (v) => (v ? new Date(`${v}T00:00:00+05:30`).toISOString() : undefined);
/** "YYYY-MM-DD" → ISO of 00:00 IST the next day (exclusive upper bound). */
export const istDayEndExclusive = (v) => (v ? new Date(new Date(`${v}T00:00:00+05:30`).getTime() + 86400000).toISOString() : undefined);
/** Today's IST calendar date shifted by `days`. */
export const istToday = (days = 0) => istDateInput(new Date(Date.now() + days * 86400000));

export function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// ---------------------------------------------------------------- text
export const humanize = (s) => (s ? String(s).replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
export const titleCase = (s) => humanize(s).replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------- errors
/** Readable message for any thrown error, including `details.missing` lists from the API. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  let msg = err.message || fallback;
  const missing = err.details?.missing;
  if (Array.isArray(missing) && missing.length) msg += ` Missing: ${missing.map(humanize).join(', ')}.`;
  if (err.code === 'VALIDATION_FAILED' && Array.isArray(err.details) && err.details.length) {
    msg = err.details.map((d) => (d.field ? `${humanize(d.field.split('.').pop())}: ${d.message}` : d.message)).join(' · ');
  }
  return msg;
}

/**
 * Maps a 422's `details: [{ field, message }]` onto react-hook-form fields.
 * `map` renames server fields to form fields (e.g. { valuePaise: 'value' }).
 * Returns true when at least one field error was applied.
 */
export function applyFieldErrors(err, setError, map = {}) {
  if (err?.status !== 422 || !Array.isArray(err.details)) return false;
  let applied = false;
  for (const d of err.details) {
    if (!d.field) continue;
    const key = map[d.field] ?? map[d.field.split('.')[0]] ?? d.field;
    if (key === false) continue;
    setError(key, { type: 'server', message: d.message });
    applied = true;
  }
  return applied;
}

/** Removes keys whose value is '', null or undefined (for PATCH bodies and queries). */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

export const shortId = (id) => (id ? String(id).slice(-6).toUpperCase() : '');

/** 422 details → { field: message } for simple controlled forms (first segment of the path). */
export function fieldErrorMap(err, map = {}) {
  if (err?.status !== 422 || !Array.isArray(err.details)) return {};
  const out = {};
  for (const d of err.details) {
    if (!d.field) continue;
    const key = map[d.field] ?? map[d.field.split('.')[0]] ?? d.field.split('.')[0];
    if (!out[key]) out[key] = d.message;
  }
  return out;
}

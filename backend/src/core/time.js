/** India runs on a fixed UTC+05:30 offset (no DST), so IST calendar maths is exact. */
export const IST_OFFSET_MS = 330 * 60_000;
export const HOUR_MS = 3600_000;
export const DAY_MS = 24 * HOUR_MS;

const ist = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MS);

/** 'YYYY-MM-DD' of the IST calendar day containing d. */
export const istDate = (d) => ist(d).toISOString().slice(0, 10);
/** 0 = Sunday … 6 = Saturday, in IST. */
export const istWeekday = (d) => ist(d).getUTCDay();
export const isWeekendIst = (d) => [0, 6].includes(istWeekday(d));
/** Start of the IST day as a UTC Date. */
export const istDayStart = (yyyyMmDd) => new Date(new Date(`${yyyyMmDd}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);

export function formatIst(d, { withTime = true } = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : { year: 'numeric' }),
  }).format(new Date(d));
}

export const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60_000;

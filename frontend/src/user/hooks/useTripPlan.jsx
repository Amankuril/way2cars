import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@/mobile/app/storage';
import { nextHalfHour } from '@shared/lib/format';

/**
 * The renter's current search: city + pickup/return times. Persisted (non-sensitive) so the app
 * reopens where they left off; stale times are rolled forward.
 */
const Ctx = createContext(null);
export const useTripPlan = () => useContext(Ctx);
const KEY = 'w2c.tripPlan.v1';

function defaults() {
  const start = nextHalfHour(new Date(), 24 * 60);
  start.setHours(Math.max(start.getHours(), 9));
  return { city: null, startAt: start, endAt: new Date(start.getTime() + 24 * 3600_000) };
}

/** Restores the saved plan (stale times rolled forward). Web: read synchronously so cold URLs never flash defaults. */
function restore(raw) {
  try {
    const p = JSON.parse(raw);
    const start = new Date(p.startAt);
    const minStart = nextHalfHour(new Date(), 90);
    const fresh = start > minStart;
    return { city: p.city || null, ...(fresh ? { startAt: start, endAt: new Date(p.endAt) } : { startAt: defaults().startAt, endAt: defaults().endAt }) };
  } catch {
    return null; // ignore corrupt cache
  }
}
function readSync() {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function TripPlanProvider({ children }) {
  const [plan, setPlan] = useState(() => {
    const raw = readSync();
    return (raw && restore(raw)) || defaults();
  });
  const ready = true;

  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(plan)).catch(() => {});
  }, [plan]);

  const value = useMemo(() => ({
    ...plan,
    ready,
    setCity: (city) => setPlan((p) => ({ ...p, city })),
    setTimes: (startAt, endAt) => setPlan((p) => ({ ...p, startAt, endAt })),
  }), [plan]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

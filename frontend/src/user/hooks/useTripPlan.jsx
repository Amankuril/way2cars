import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@/mobile/app/storage';

/**
 * The renter's current search: city + pickup/return times. Only the city is persisted; trip times
 * start empty on every launch so the renter always picks them before seeing cars (`hasTimes`).
 * Once chosen they stay for the session until changed.
 */
const Ctx = createContext(null);
export const useTripPlan = () => useContext(Ctx);
const KEY = 'w2c.tripPlan.v1';

const EMPTY = { city: null, startAt: null, endAt: null };

/** Web: restore the saved city synchronously so cold URLs never flash "no city". */
function restore(raw) {
  try {
    return JSON.parse(raw).city || null;
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
    return { ...EMPTY, city: (raw && restore(raw)) || null };
  });
  const ready = true;

  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify({ city: plan.city })).catch(() => {});
  }, [plan.city]);

  const value = useMemo(() => ({
    ...plan,
    ready,
    hasTimes: !!(plan.startAt && plan.endAt),
    setCity: (city) => setPlan((p) => ({ ...p, city })),
    setTimes: (startAt, endAt) => setPlan((p) => ({ ...p, startAt, endAt })),
  }), [plan]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

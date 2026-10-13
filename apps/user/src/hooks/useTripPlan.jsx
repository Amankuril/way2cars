import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export function TripPlanProvider({ children }) {
  const [plan, setPlan] = useState(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try {
          const p = JSON.parse(raw);
          const start = new Date(p.startAt);
          const minStart = nextHalfHour(new Date(), 90);
          const fresh = start > minStart;
          setPlan({ city: p.city || null, ...(fresh ? { startAt: start, endAt: new Date(p.endAt) } : { startAt: defaults().startAt, endAt: defaults().endAt }) });
        } catch {
          // ignore corrupt cache
        }
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(plan)).catch(() => {});
  }, [plan, ready]);

  const value = useMemo(() => ({
    ...plan,
    ready,
    setCity: (city) => setPlan((p) => ({ ...p, city })),
    setTimes: (startAt, endAt) => setPlan((p) => ({ ...p, startAt, endAt })),
  }), [plan, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

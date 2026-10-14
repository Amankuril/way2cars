import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The renter's current search: city + pickup/return times. Only the city is persisted; trip times
 * start empty on every launch so the renter always picks them before seeing cars (`hasTimes`).
 * Once chosen they stay for the session until changed.
 */
const Ctx = createContext(null);
export const useTripPlan = () => useContext(Ctx);
const KEY = 'w2c.tripPlan.v1';

const EMPTY = { city: null, startAt: null, endAt: null };

export function TripPlanProvider({ children }) {
  const [plan, setPlan] = useState(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (p.city) setPlan((cur) => ({ ...cur, city: cur.city || p.city }));
        } catch {
          // ignore corrupt cache
        }
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify({ city: plan.city })).catch(() => {});
  }, [plan.city, ready]);

  const value = useMemo(() => ({
    ...plan,
    ready,
    hasTimes: !!(plan.startAt && plan.endAt),
    setCity: (city) => setPlan((p) => ({ ...p, city })),
    setTimes: (startAt, endAt) => setPlan((p) => ({ ...p, startAt, endAt })),
  }), [plan, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { useEffect, useState } from 'react';

/** Seconds remaining until `to` (updates every second, stops at 0). */
export function useCountdown(to) {
  const calc = () => (to ? Math.max(0, Math.floor((new Date(to) - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!to) return undefined;
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}
export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

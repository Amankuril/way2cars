import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePublicConfig } from '../hooks/queries';
import { syncTripTracking } from '../services/tripTracking';

/** Resumes location sharing whenever the app comes to the screen, e.g. after the phone restarted mid-trip. */
export function TripTrackingKeeper() {
  const { status } = useAuth();
  const config = usePublicConfig();
  const enabled = status === 'signedIn' && Boolean(config.data?.tracking?.phone);
  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => syncTripTracking().catch(() => null);
    sync();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
    return () => sub.remove();
  }, [enabled]);
  return null;
}

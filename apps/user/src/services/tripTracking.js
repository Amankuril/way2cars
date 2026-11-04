import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { api } from '../api';
import { ENV } from '../env';

/** Location sharing during a trip: see TripTrackingService.kt (Android) and modules/tracking on the server. */
const native = Platform.OS === 'android' ? NativeModules.TripTracking : null;
const FINE = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

const ask = (title, message, confirm) => new Promise((resolve) => {
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
    { text: confirm, onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

/**
 * Explains location sharing, then asks for the permission. Returns { ok, message }.
 * The explanation must come before Android's own permission prompt.
 */
export async function requestTrackingConsent() {
  if (!native) return { ok: false, message: 'Please start this trip from the latest WAY2CARS Android app.' };
  const accepted = await ask(
    'Share your location during this trip',
    'WAY2CARS collects this phone’s location from pickup until you return the car, even when the app is closed or the screen is off. Our team uses it for vehicle safety, recovery and roadside help. Hosts cannot see it. A notification stays on while it is shared, and it stops when you return the car.',
    'Agree & continue',
  );
  if (!accepted) return { ok: false, message: 'Location sharing is required to start the trip.' };

  const result = await PermissionsAndroid.request(FINE);
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    if (await ask('Allow location', 'Location is blocked for WAY2CARS. Open settings and allow it, then try again.', 'Open settings')) Linking.openSettings();
    return { ok: false, message: 'Allow location for WAY2CARS to start the trip.' };
  }
  if (result !== PermissionsAndroid.RESULTS.GRANTED) return { ok: false, message: 'Allow location for WAY2CARS to start the trip.' };
  if (!(await native.isLocationEnabled())) return { ok: false, message: 'Turn on your phone’s location to start the trip.' };
  if (Platform.Version >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => null);
  return { ok: true };
}

/** Starts or stops the service to match the server. Safe to call repeatedly, while the app is on screen. */
export async function syncTripTracking() {
  if (!native) return;
  const session = await api.post('/api/v1/user/bookings/tracking-session', {});
  if (!session.active) return;
  if (!(await PermissionsAndroid.check(FINE))) return;
  await native.start({ url: `${ENV.apiBaseUrl}${session.path}`, token: session.token, bookingId: session.bookingId, intervalSeconds: session.intervalSeconds });
}

export const stopTripTracking = () => native?.stop();

/** False when a trip in progress cannot report: permission removed or the phone's location is off. */
export function useTripLocationOk(active) {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (!active || !native) return undefined;
    const check = async () => setOk((await PermissionsAndroid.check(FINE)) && (await native.isLocationEnabled()));
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [active]);
  return !active || ok;
}

import { PermissionsAndroid, Platform } from 'react-native';
import { api } from '../api';

/**
 * Firebase Cloud Messaging. Push is optional: if the APK was built without google-services.json,
 * Firebase isn't initialised and every call here is a no-op.
 */
let messagingMod = null;
function messaging() {
  if (messagingMod === false) return null;
  try {
    const { getApp } = require('@react-native-firebase/app');
    getApp(); // throws when Firebase is not configured
    messagingMod = require('@react-native-firebase/messaging').default;
    return messagingMod();
  } catch {
    messagingMod = false;
    return null;
  }
}

let currentToken = null;

export async function registerForPush() {
  const m = messaging();
  if (!m) return;
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (r !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    currentToken = await m.getToken();
    await api.post('/api/v1/user/notifications/devices', { token: currentToken, platform: 'android' });
    m.onTokenRefresh(async (t) => {
      currentToken = t;
      await api.post('/api/v1/user/notifications/devices', { token: t, platform: 'android' }).catch(() => {});
    });
  } catch {
    // push is best-effort
  }
}

export async function unregisterPush() {
  if (!currentToken) return;
  await api.del('/api/v1/user/notifications/devices', { token: currentToken }).catch(() => {});
  currentToken = null;
}

/** Foreground messages → callback (used to refresh queries / show a toast). */
export function onForegroundMessage(cb) {
  const m = messaging();
  return m ? m.onMessage(cb) : () => {};
}

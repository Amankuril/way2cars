import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Firebase Cloud Messaging. Optional: without google-services.json at build time Firebase is not
 * initialised and every function is a no-op.
 */
let mod = null;
function messaging() {
  if (mod === false) return null;
  try {
    const { getApp } = require('@react-native-firebase/app');
    getApp();
    mod = require('@react-native-firebase/messaging').default;
    return mod();
  } catch {
    mod = false;
    return null;
  }
}

let currentToken = null;

export async function registerForPush(api, realm) {
  const m = messaging();
  if (!m) return;
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (r !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    currentToken = await m.getToken();
    await api.post(`/api/v1/${realm}/notifications/devices`, { token: currentToken, platform: 'android' });
    m.onTokenRefresh(async (t) => {
      currentToken = t;
      await api.post(`/api/v1/${realm}/notifications/devices`, { token: t, platform: 'android' }).catch(() => {});
    });
  } catch {
    // best effort
  }
}

export async function unregisterPush(api, realm) {
  if (!currentToken) return;
  await api.del(`/api/v1/${realm}/notifications/devices`, { token: currentToken }).catch(() => {});
  currentToken = null;
}

export function onForegroundMessage(cb) {
  const m = messaging();
  return m ? m.onMessage(cb) : () => {};
}

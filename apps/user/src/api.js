import * as Keychain from 'react-native-keychain';
import { createApiClient } from '@shared/lib/api-client';
import { ENV } from './env';

const SERVICE = 'in.way2cars.user.session';

/** Refresh token lives in the Android Keystore-backed keychain, never in AsyncStorage. */
const tokenStore = {
  async getRefresh() {
    const c = await Keychain.getGenericPassword({ service: SERVICE });
    return c ? c.password : null;
  },
  setRefresh: (t) => Keychain.setGenericPassword('refresh', t, { service: SERVICE, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  clear: () => Keychain.resetGenericPassword({ service: SERVICE }),
};

let onExpired = () => {};
export const setSessionExpiredHandler = (fn) => (onExpired = fn);

export const api = createApiClient({
  baseUrl: ENV.apiBaseUrl,
  realm: 'user',
  clientType: 'native',
  tokenStore,
  onSessionExpired: () => onExpired(),
});

/** Image source for private files (KYC, inspection photos) — sent with the access token. */
export const privateSource = (url) => (url ? { uri: `${ENV.apiBaseUrl}${url}`, headers: { Authorization: `Bearer ${api.getAccessToken()}` } } : undefined);
export const fileUrl = (id) => `/api/v1/files/${id}`;

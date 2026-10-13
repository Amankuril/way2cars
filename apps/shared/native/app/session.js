import * as Keychain from 'react-native-keychain';
import { createApiClient } from '../../lib/api-client';

/**
 * Builds the API client for a native app. The refresh token lives in the Android
 * Keystore-backed keychain (never AsyncStorage).
 */
export function createNativeApi({ baseUrl, realm, service }) {
  let onExpired = () => {};
  const tokenStore = {
    async getRefresh() {
      const c = await Keychain.getGenericPassword({ service });
      return c ? c.password : null;
    },
    setRefresh: (t) => Keychain.setGenericPassword('refresh', t, { service, accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
    clear: () => Keychain.resetGenericPassword({ service }),
  };
  const api = createApiClient({ baseUrl, realm, clientType: 'native', tokenStore, onSessionExpired: () => onExpired() });
  return {
    api,
    setSessionExpiredHandler: (fn) => { onExpired = fn; },
    /** Image source for private files, sent with the current access token. */
    privateSource: (url) => (url ? { uri: `${baseUrl}${url}`, headers: { Authorization: `Bearer ${api.getAccessToken()}` } } : undefined),
  };
}

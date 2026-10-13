import { createApiClient } from '@shared/lib/api-client';

/**
 * Web equivalent of createNativeApi (apps/shared/native/app/session.js).
 *
 * clientType 'web': requests carry `X-W2C-Client: web` and credentials, so the backend keeps the
 * refresh token in an httpOnly cookie scoped to /api/v1/auth/<realm>; the access token stays in
 * memory. `api.restore()` (called by AuthContext on load) turns the cookie back into a session.
 *
 * A non-sensitive localStorage hint ("this browser signed in to <realm>") lets a first-time visitor
 * skip the refresh call entirely (no pointless 401 in the console).
 */
export function createWebApi({ realm, baseUrl = '' }) {
  let onExpired = () => {};
  const hintKey = `w2c.session.${realm}`;
  const hint = {
    get: () => { try { return localStorage.getItem(hintKey) === '1'; } catch { return true; } },
    set: (on) => { try { if (on) localStorage.setItem(hintKey, '1'); else localStorage.removeItem(hintKey); } catch { /* ignore */ } },
  };
  const api = createApiClient({
    baseUrl,
    realm,
    clientType: 'web',
    onSessionExpired: () => { hint.set(false); onExpired(); },
  });

  const restore = api.restore;
  const acceptLogin = api.acceptLogin;
  api.restore = async () => {
    if (!hint.get()) return null;
    const r = await restore();
    if (!r) hint.set(false);
    return r;
  };
  api.acceptLogin = async (data) => { await acceptLogin(data); hint.set(true); };
  // Same as the shared logout, but reads the (empty) response so the browser doesn't flag it as aborted.
  api.logout = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/${realm}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-W2C-Client': 'web' },
        body: '{}',
      });
      await res.text();
    } catch {
      // offline logout still clears local state
    }
    api.setAccessToken(null);
    hint.set(false);
  };

  return {
    api,
    setSessionExpiredHandler: (fn) => { onExpired = fn; },
    /** Image source for private files: <Image> fetches it with the bearer token and shows a blob URL. */
    privateSource: (url) => (url ? { uri: `${baseUrl}${url}`, headers: { Authorization: `Bearer ${api.getAccessToken()}` } } : undefined),
  };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setSessionExpiredHandler } from '../api';
import { registerForPush, unregisterPush } from '@/mobile/app/push';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

/**
 * Port of apps/user/src/auth/AuthContext.jsx. status: 'restoring' | 'signedOut' | 'signedIn'.
 * The session is restored from the httpOnly refresh cookie (api.restore()) on page load.
 */
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('restoring');
  const [account, setAccount] = useState(null);

  const signOutLocal = useCallback(() => {
    setAccount(null);
    setStatus('signedOut');
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setSessionExpiredHandler(signOutLocal);
    api.restore()
      .then((r) => {
        if (r?.account) {
          setAccount(r.account);
          setStatus('signedIn');
          registerForPush(api, 'user');
        } else setStatus('signedOut');
      })
      .catch(() => setStatus('signedOut'));
  }, [signOutLocal]);

  const value = useMemo(() => ({
    status,
    account,
    setAccount,
    async completeLogin(data) {
      await api.acceptLogin(data);
      setAccount(data.account);
      setStatus('signedIn');
      registerForPush(api, 'user');
    },
    async refreshAccount() {
      const me = await api.get('/api/v1/user/me');
      setAccount(me);
      return me;
    },
    async signOut() {
      await unregisterPush(api, 'user');
      await api.logout();
      signOutLocal();
    },
  }), [status, account, signOutLocal]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

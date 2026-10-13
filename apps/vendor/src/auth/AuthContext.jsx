import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { registerForPush, unregisterPush } from '@shared/native/app/push';
import { api, setSessionExpiredHandler } from '../api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

/** Host session. status: 'restoring' | 'signedOut' | 'signedIn'. account = vendor profile (with nextStep). */
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('restoring');
  const [account, setAccount] = useState(null);

  const signOutLocal = useCallback(() => { setAccount(null); setStatus('signedOut'); qc.clear(); }, [qc]);

  useEffect(() => {
    setSessionExpiredHandler(signOutLocal);
    api.restore()
      .then((r) => {
        if (r?.account) { setAccount(r.account); setStatus('signedIn'); registerForPush(api, 'vendor'); } else setStatus('signedOut');
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
      registerForPush(api, 'vendor');
    },
    async refreshAccount() {
      const me = await api.get('/api/v1/vendor/me');
      setAccount(me);
      return me;
    },
    async signOut() {
      await unregisterPush(api, 'vendor');
      await api.logout();
      signOutLocal();
    },
  }), [status, account, signOutLocal]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

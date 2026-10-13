import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ADMIN, onSessionExpired } from '@/lib/api.js';

const AuthContext = createContext(null);
const SETUP_KEY = 'w2c.admin.mfaSetupRequired';

const readSetupFlag = () => {
  try {
    return sessionStorage.getItem(SETUP_KEY) === '1';
  } catch {
    return false;
  }
};
const writeSetupFlag = (on) => {
  try {
    if (on) sessionStorage.setItem(SETUP_KEY, '1');
    else sessionStorage.removeItem(SETUP_KEY);
  } catch {
    // storage unavailable — the flag simply won't survive a reload
  }
};

let restoring = null; // shared across StrictMode double-mounts

/**
 * Session state for the admin app. The access token lives in memory inside the API client; the
 * refresh token is an httpOnly cookie, so a page reload restores the session with api.restore().
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState({ status: 'loading', admin: null, expired: false });
  const [mfaSetupRequired, setMfaSetupRequired] = useState(readSetupFlag);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    restoring ||= api.restore().catch(() => null);
    restoring.then((r) => {
      if (!mounted.current) return;
      setState(r?.account ? { status: 'authenticated', admin: r.account, expired: false } : { status: 'anonymous', admin: null, expired: false });
    });
    const off = onSessionExpired(() => {
      queryClient.clear();
      setState((s) => (s.status === 'authenticated' ? { status: 'anonymous', admin: null, expired: true } : s));
    });
    return () => {
      mounted.current = false;
      off();
    };
  }, [queryClient]);

  const finishLogin = useCallback(async (data) => {
    await api.acceptLogin(data);
    restoring = Promise.resolve({ account: data.admin });
    const setup = Boolean(data.mfaSetupRequired);
    writeSetupFlag(setup);
    setMfaSetupRequired(setup);
    setState({ status: 'authenticated', admin: data.admin, expired: false });
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await api.post('/api/v1/auth/admin/login', { email, password }, { skipAuthRetry: true });
    if (data?.mfaRequired) return { mfaRequired: true, mfaToken: data.mfaToken };
    await finishLogin(data);
    return { mfaRequired: false, mfaSetupRequired: Boolean(data.mfaSetupRequired) };
  }, [finishLogin]);

  const verifyMfa = useCallback(async ({ mfaToken, code }) => {
    const data = await api.post('/api/v1/auth/admin/mfa', { mfaToken, code }, { skipAuthRetry: true });
    await finishLogin(data);
  }, [finishLogin]);

  const logout = useCallback(async () => {
    await api.logout();
    restoring = Promise.resolve(null);
    writeSetupFlag(false);
    setMfaSetupRequired(false);
    queryClient.clear();
    setState({ status: 'anonymous', admin: null, expired: false });
  }, [queryClient]);

  /** Re-reads /admin/me (after MFA or profile changes). */
  const refreshMe = useCallback(async () => {
    const me = await api.get(`${ADMIN}/me`);
    setState((s) => ({ ...s, admin: me }));
    if (me?.mfaEnabled) {
      writeSetupFlag(false);
      setMfaSetupRequired(false);
    }
    return me;
  }, []);

  const value = useMemo(() => {
    const perms = state.admin?.permissions || [];
    const can = (perm) => !perm || perms.includes('*') || perms.includes(perm);
    return { ...state, mfaSetupRequired, can, login, verifyMfa, logout, refreshMe };
  }, [state, mfaSetupRequired, login, verifyMfa, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Convenience: `const can = useCan(); can('users.manage')`. */
export const useCan = () => useAuth().can;

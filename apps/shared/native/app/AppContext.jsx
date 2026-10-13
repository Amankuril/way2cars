import { createContext, useContext } from 'react';

/**
 * Per-app wiring for shared screens/services: { api, realm, auth, apiBaseUrl, brand }.
 *  - realm: 'user' | 'vendor' → API path segment
 *  - auth: { account, setAccount, completeLogin, signOut }
 */
const AppCtx = createContext(null);
export const AppProvider = ({ value, children }) => <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
export function useApp() {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

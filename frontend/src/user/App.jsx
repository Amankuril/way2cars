import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, AppProvider } from '@/mobile/ui';
import { MobileFrame } from '@/mobile/frame';
import { OfflineBanner } from '@/mobile/OfflineBanner';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { api } from './api';
import { openLink } from './navigation/links';
import { RootNavigator } from './navigation/RootNavigator';

/** Renter web app (/user/*): web replica of apps/user. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => count < 2 && (!err?.status || err.status >= 500) && err?.code !== 'ABORTED',
    },
    mutations: { retry: false },
  },
});

const BRAND = {
  headline: 'Self-drive cars,\nready when you are.',
  tagline: 'Sign in with your mobile number. We’ll send a one-time code.',
};

/** Exposes this app's API client, realm and auth to shared screens. */
function AppBridge({ children }) {
  const auth = useAuth();
  return <AppProvider value={{ api, realm: 'user', auth, openLink, brand: BRAND }}>{children}</AppProvider>;
}

export default function UserApp() {
  return (
    <MobileFrame title="WAY2CARS — Self-drive cars">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <AppBridge>
              <RootNavigator />
              <OfflineBanner />
            </AppBridge>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MobileFrame>
  );
}

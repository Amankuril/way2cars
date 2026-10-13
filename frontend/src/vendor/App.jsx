import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, AppProvider } from '@/mobile/ui';
import { MobileFrame } from '@/mobile/frame';
import { OfflineBanner } from '@/mobile/OfflineBanner';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { openLink } from './navigation/links';
import { api } from './api';

/** Host web app (/vendor/*): web replica of apps/vendor. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, err) => count < 2 && (!err?.status || err.status >= 500) && err?.code !== 'ABORTED' },
    mutations: { retry: false },
  },
});

const BRAND = {
  subtitle: 'Host',
  headline: 'Earn from your car,\non your schedule.',
  tagline: 'Sign in or join as a WAY2CARS host with your mobile number.',
  termsSlug: 'host-terms',
};

function AppBridge({ children }) {
  const auth = useAuth();
  return <AppProvider value={{ api, realm: 'vendor', auth, openLink, brand: BRAND }}>{children}</AppProvider>;
}

export default function VendorApp() {
  return (
    <MobileFrame title="WAY2CARS Host">
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

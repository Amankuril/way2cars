import { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { ToastProvider, T, AppProvider } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { openLink } from './navigation/links';
import { api } from './api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, err) => count < 2 && (!err?.status || err.status >= 500) },
    mutations: { retry: false },
  },
});
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas, card: colors.surface, primary: colors.brand[500], text: colors.ink[900], border: colors.line } };
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

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return <View className="absolute left-0 right-0 top-0 bg-ink-900 px-4 pb-2 pt-10"><T variant="caption" tone="inverse">You’re offline. Showing saved information.</T></View>;
}

export function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <AppBridge>
              <NavigationContainer theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
              <OfflineBanner />
            </AppBridge>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

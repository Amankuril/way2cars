import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { ToastProvider, T, AppProvider } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { api } from './api';
import { openLink } from './navigation/links';
import { TripPlanProvider } from './hooks/useTripPlan';
import { RootNavigator } from './navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => count < 2 && (!err?.status || err.status >= 500),
    },
    mutations: { retry: false },
  },
});

// Refetch on app foreground and pause queries while offline.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas, card: colors.surface, primary: colors.brand[500], text: colors.ink[900], border: colors.line } };

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View className="absolute left-0 right-0 top-0 bg-ink-900 px-4 pb-2 pt-10">
      <T variant="caption" tone="inverse">You’re offline. Showing saved information.</T>
    </View>
  );
}

const BRAND = {
  headline: 'Self-drive cars,\nready when you are.',
  tagline: 'Sign in with your mobile number. We’ll send a one-time code.',
};

/** Exposes this app's API client, realm and auth to shared screens. */
function AppBridge({ children }) {
  const auth = useAuth();
  return <AppProvider value={{ api, realm: 'user', auth, openLink, brand: BRAND }}>{children}</AppProvider>;
}

export function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <AppBridge>
              <TripPlanProvider>
                <NavigationContainer theme={navTheme}>
                  <RootNavigator />
                </NavigationContainer>
                <OfflineBanner />
              </TripPlanProvider>
            </AppBridge>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

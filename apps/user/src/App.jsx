import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { ToastProvider, T } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { AuthProvider } from './auth/AuthContext';
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

export function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <TripPlanProvider>
              <NavigationContainer theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
              <OfflineBanner />
            </TripPlanProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

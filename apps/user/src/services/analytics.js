import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAnalytics } from '@shared/lib/analytics';
import { api } from '../api';
import { ENV } from '../env';

export const APP_VERSION = '1.2.2';

const analytics = createAnalytics({
  baseUrl: ENV.apiBaseUrl,
  platform: 'android',
  appVersion: APP_VERSION,
  getAccessToken: () => api.getAccessToken(),
  storage: { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) },
});
AppState.addEventListener('change', (s) => s !== 'active' && analytics.flush());

/** Funnel event for Admin → App analytics (best-effort, never throws). */
export const track = (event, props) => analytics.track(event, props);

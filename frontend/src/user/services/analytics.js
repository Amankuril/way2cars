import { createAnalytics } from '@shared/lib/analytics';
import { AsyncStorage } from '@/mobile/app/storage';
import { api } from '../api';
import { ENV } from '../env';

export const APP_VERSION = '1.2.0';

const analytics = createAnalytics({
  baseUrl: ENV.apiBaseUrl,
  platform: 'web',
  appVersion: APP_VERSION,
  getAccessToken: () => api.getAccessToken(),
  storage: { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) },
});
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && analytics.flush());

/** Funnel event for Admin → App analytics (best-effort, never throws). Same API as apps/user/src/services/analytics.js. */
export const track = (event, props) => analytics.track(event, props);

/**
 * Web counterpart of apps/<app>/src/env.js. The API is same-origin (Vite proxy in dev, Nginx in
 * production), so apiBaseUrl is ''. Maps render as a Google Maps embed (see ./maps.jsx).
 */
export const ENV = {
  apiBaseUrl: '',
  env: import.meta.env.PROD ? 'production' : 'development',
  mapsEnabled: true,
  platform: 'web',
  builtAt: import.meta.env.VITE_BUILT_AT || null,
};

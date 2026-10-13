import { createWebApi } from '@/mobile/app/session';

/** Host API client (realm 'vendor'). Same exports as apps/vendor/src/api.js. */
export const { api, setSessionExpiredHandler, privateSource } = createWebApi({ realm: 'vendor' });

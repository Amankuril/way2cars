import { createWebApi } from '@/mobile/app/session';

/** Renter API client (realm 'user'). Same exports as apps/user/src/api.js. */
export const { api, setSessionExpiredHandler, privateSource } = createWebApi({ realm: 'user' });
export const fileUrl = (id) => `/api/v1/files/${id}`;

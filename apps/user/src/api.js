import { createNativeApi } from '@shared/native/app/session';
import { ENV } from './env';

export const { api, setSessionExpiredHandler, privateSource } = createNativeApi({ baseUrl: ENV.apiBaseUrl, realm: 'user', service: 'in.way2cars.user.session' });
export const fileUrl = (id) => `/api/v1/files/${id}`;

import { createNativeApi } from '@shared/native/app/session';
import { ENV } from './env';

export const { api, setSessionExpiredHandler, privateSource } = createNativeApi({ baseUrl: ENV.apiBaseUrl, realm: 'vendor', service: 'in.way2cars.host.session' });

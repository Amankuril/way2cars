import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

/** Shared query hooks (one cache key per resource). */
export const usePublicConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api.get('/api/v1/public/config'), staleTime: 10 * 60_000 });
export const useCities = () => useQuery({ queryKey: ['cities'], queryFn: () => api.get('/api/v1/public/cities'), staleTime: 60 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api.get('/api/v1/public/categories'), staleTime: 60 * 60_000 });
export const useBrands = () => useQuery({ queryKey: ['brands'], queryFn: () => api.get('/api/v1/public/brands'), staleTime: 60 * 60_000 });
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api.get('/api/v1/user/me') });
export const useUnreadCount = () => useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.list('/api/v1/user/notifications', { limit: 1 }).then((r) => r.meta?.unreadCount || 0), refetchInterval: 60_000 });

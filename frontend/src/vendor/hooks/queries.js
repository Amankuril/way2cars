import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export const useCities = () => useQuery({ queryKey: ['cities'], queryFn: () => api.get('/api/v1/public/cities'), staleTime: 60 * 60_000 });
export const useBrands = () => useQuery({ queryKey: ['brands'], queryFn: () => api.get('/api/v1/public/brands'), staleTime: 60 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api.get('/api/v1/public/categories'), staleTime: 60 * 60_000 });
export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api.get('/api/v1/public/config'), staleTime: 10 * 60_000 });
export const useEarnings = () => useQuery({ queryKey: ['earnings'], queryFn: () => api.get('/api/v1/vendor/earnings/summary') });
export const useUnread = () => useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.list('/api/v1/vendor/notifications', { limit: 1 }).then((r) => r.meta?.unreadCount || 0), refetchInterval: 60_000 });

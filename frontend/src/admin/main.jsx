import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AuthProvider } from '@/admin/auth/AuthContext.jsx';
import { ToastProvider } from '@/admin/components/Toast.jsx';

/** Admin panel root (mounted by src/main.jsx for /admin/*). Router basename is /admin (see App.jsx). */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      // Retry transient failures only — never 4xx (permission, validation, not found).
      retry: (count, err) => count < 2 && (!err?.status || err.status >= 500) && err?.code !== 'ABORTED',
    },
    mutations: { retry: false },
  },
});

export default function AdminRoot() {
  useEffect(() => {
    document.title = 'WAY2CARS Admin';
    document.querySelector('meta[name=robots]')?.setAttribute('content', 'noindex, nofollow');
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

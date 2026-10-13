import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/manrope';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from '@/auth/AuthContext.jsx';
import { ToastProvider } from '@/components/Toast.jsx';

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

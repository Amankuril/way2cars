import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev/preview only: the browser talks to Vite, which proxies the API so cookies stay same-origin.
  const backend = env.VITE_BACKEND_URL || 'http://localhost:4000';
  const proxy = {
    '/api': { target: backend, changeOrigin: false },
    '/uploads': { target: backend, changeOrigin: false },
  };

  return {
    base: '/admin/',
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: { port: 5173, strictPort: true, proxy },
    // Same port as dev: the backend CORS/CSRF allow-list (CORS_ORIGINS) includes :5173 for local work.
    preview: { port: 5173, strictPort: true, proxy },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            query: ['@tanstack/react-query'],
            charts: ['recharts'],
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
  };
});

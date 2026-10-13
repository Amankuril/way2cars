import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * apps/shared/theme/*.js are CommonJS (Tailwind + Metro require them). Re-export them as ESM so
 * screens can `import { colors } from '@shared/theme/tokens'` exactly like the native apps.
 */
function sharedThemeAsEsm() {
  return {
    name: 'w2c-shared-theme-esm',
    enforce: 'pre',
    transform(code, id) {
      if (!/apps[\\/]shared[\\/]theme[\\/]tokens\.js$/.test(id)) return null;
      const m = code.match(/module\.exports\s*=\s*\{([^}]*)\};?/);
      if (!m) return null;
      return { code: code.replace(m[0], `export { ${m[1]} };\nexport default { ${m[1]} };`), map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev/preview only: the browser talks to Vite, which proxies the API so cookies stay same-origin.
  const backend = process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://localhost:5000';
  const proxy = {
    '/api': { target: backend, changeOrigin: false },
    '/uploads': { target: backend, changeOrigin: false },
  };

  return {
    base: '/',
    plugins: [sharedThemeAsEsm(), react()],
    resolve: {
      alias: {
        '@shared': fileURLToPath(new URL('../apps/shared', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Same port everywhere: the backend CORS/CSRF allow-list (CORS_ORIGINS) includes :5173 for local work.
    server: { port: 5173, strictPort: true, proxy, fs: { allow: ['..'] } },
    preview: { port: 5173, strictPort: true, proxy },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Vendor libraries in long-lived chunks; each sub-app (/admin, /user, /vendor, landing)
          // is a separate dynamic import from src/main.jsx, so Rollup splits them automatically.
          manualChunks(id) {
            if (/[\\/]src[\\/]mobile[\\/]/.test(id)) return 'mobile';
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
            if (id.includes('@tanstack')) return 'query';
            if (/recharts|d3-|victory-vendor/.test(id)) return 'charts';
            if (/react-hook-form|[\\/]zod[\\/]|@hookform/.test(id)) return 'forms';
            if (id.includes('tailwind-merge')) return 'twmerge';
            return undefined;
          },
        },
      },
    },
  };
});

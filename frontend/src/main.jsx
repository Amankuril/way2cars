import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import './index.css';

/**
 * One build, four apps. The first path segment picks the sub-app, which is lazy-loaded as its own
 * chunk and owns its own router (basename /admin, /user, /vendor). Moving between sub-apps is a
 * full page load (plain <a href>), so each keeps an independent session and query cache.
 */
const seg = (p) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`);
const SubApp = lazy(() => {
  if (seg('/admin')) return import('./admin/main.jsx');
  if (seg('/user')) return import('./user/App.jsx');
  if (seg('/vendor')) return import('./vendor/App.jsx');
  return import('./landing/Landing.jsx');
});

function Splash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas" role="progressbar" aria-label="Loading">
      <img src="/mark.png" alt="" className="h-10 w-auto animate-pulse opacity-80" />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<Splash />}>
      <SubApp />
    </Suspense>
  </StrictMode>,
);

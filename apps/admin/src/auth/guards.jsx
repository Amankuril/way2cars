import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';
import { Spinner } from '@/components/Button.jsx';

export function FullPageLoader({ label = 'Loading WAY2CARS Admin…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <img src={`${import.meta.env.BASE_URL}mark.png`} alt="" className="h-10 w-auto opacity-90" />
        <div className="flex items-center gap-2 text-label text-ink-500">
          <Spinner className="h-4 w-4" /> {label}
        </div>
      </div>
    </div>
  );
}

/** Requires a signed-in admin; forces MFA enrolment when the backend demands it. */
export function RequireAuth({ children }) {
  const { status, mfaSetupRequired, expired } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status !== 'authenticated') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace state={{ expired }} />;
  }
  if (mfaSetupRequired && location.pathname !== '/mfa-setup') return <Navigate to="/mfa-setup" replace />;
  return children;
}

/** Hides a page the admin lacks permission for (the API would refuse it anyway). */
export function RequirePermission({ perm, children }) {
  const { can } = useAuth();
  if (perm && !can(perm)) {
    return (
      <div className="panel mt-6">
        <EmptyState
          icon={ShieldAlert}
          title="You don’t have access to this page"
          description="Your admin role does not include this area. Ask a super admin if you need access."
        />
      </div>
    );
  }
  return children;
}

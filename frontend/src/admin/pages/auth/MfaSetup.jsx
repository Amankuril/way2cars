import { useNavigate } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { MfaEnrol } from '@/components/MfaEnrol.jsx';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useDocumentTitle } from '@/lib/hooks.js';

/** Forced enrolment when the backend requires MFA for every admin (ADMIN_REQUIRE_MFA). */
export default function MfaSetup() {
  useDocumentTitle('Set up two-factor sign-in');
  const navigate = useNavigate();
  const { admin, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}mark.png`} alt="" className="h-8 w-auto" />
          <span className="text-[18px] font-extrabold tracking-[0.02em] text-ink-900">WAY2CARS</span>
        </div>
        <div className="panel p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-headline text-ink-900">Set up two-factor sign-in</h1>
              <p className="mt-1 text-bodySm text-ink-500">
                Two-factor authentication is required for admin accounts. Link an authenticator app to <span className="font-semibold text-ink-800">{admin?.email}</span> to continue.
              </p>
            </div>
          </div>
          <MfaEnrol onDone={() => navigate('/', { replace: true })} />
        </div>
        <div className="mt-4 text-center">
          <button type="button" onClick={logout} className="text-caption font-semibold text-ink-500 hover:text-ink-800">
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}

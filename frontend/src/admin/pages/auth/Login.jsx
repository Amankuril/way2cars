import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck, TriangleAlert, Info } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { FullPageLoader } from '@/auth/guards.jsx';
import { Button } from '@/components/Button.jsx';
import { Field, Input } from '@/components/Form.jsx';
import { useDocumentTitle } from '@/lib/hooks.js';
import { applyFieldErrors, errorMessage } from '@/lib/utils.js';

const credsSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/');

function Alert({ tone = 'danger', children }) {
  const styles = tone === 'danger' ? 'border-danger-100 bg-danger-50 text-danger-700' : 'border-brand-100 bg-brand-50 text-brand-800';
  const Icon = tone === 'danger' ? TriangleAlert : Info;
  return (
    <div className={`flex items-start gap-2 rounded-md border p-3 text-caption font-semibold ${styles}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function errorText(err) {
  if (!err) return null;
  if (err.code === 'ACCOUNT_LOCKED') return 'Too many failed attempts. This account is locked for a few minutes — try again later or ask a super admin.';
  if (err.code === 'ACCOUNT_DISABLED') return 'This admin account is disabled. Contact a super admin.';
  if (err.code === 'RATE_LIMITED') return 'Too many sign-in attempts from this network. Wait a few minutes and try again.';
  if (err.code === 'MFA_INVALID') return 'That code is not correct. Check the time on your phone and enter the current code.';
  if (err.code === 'UNAUTHENTICATED' || err.code === 'TOKEN_EXPIRED') return 'Your sign-in step expired. Start again.';
  return errorMessage(err);
}

export default function Login() {
  useDocumentTitle('Sign in');
  const { status, login, verifyMfa, mfaSetupRequired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState({ name: 'credentials' });
  const [error, setError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const form = useForm({ resolver: zodResolver(credsSchema), defaultValues: { email: '', password: '' } });

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated' && !busy) return <Navigate to={mfaSetupRequired ? '/mfa-setup' : next} replace />;

  const onCredentials = form.handleSubmit(async (values) => {
    setError(null);
    setBusy(true);
    try {
      const r = await login(values);
      if (r.mfaRequired) {
        setStep({ name: 'mfa', mfaToken: r.mfaToken, email: values.email });
        setCode('');
      } else navigate(r.mfaSetupRequired ? '/mfa-setup' : next, { replace: true });
    } catch (err) {
      if (!applyFieldErrors(err, form.setError)) setError(err);
      form.setValue('password', '');
    } finally {
      setBusy(false);
    }
  });

  const onMfa = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError({ message: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await verifyMfa({ mfaToken: step.mfaToken, code });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
      setCode('');
      if (err.code === 'UNAUTHENTICATED' || err.code === 'TOKEN_EXPIRED') setStep({ name: 'credentials' });
    } finally {
      setBusy(false);
    }
  };

  const { errors } = form.formState;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}mark.png`} alt="" className="h-12 w-auto" />
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-extrabold tracking-[0.02em] text-ink-900">WAY2CARS</span>
              <span className="rounded-sm bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Admin</span>
            </div>
          </div>

          <div className="panel p-6 sm:p-7">
            {step.name === 'credentials' ? (
              <form onSubmit={onCredentials} noValidate className="space-y-4">
                <div>
                  <h1 className="text-headline text-ink-900">Sign in</h1>
                  <p className="mt-1 text-bodySm text-ink-500">Use your WAY2CARS admin account.</p>
                </div>
                {location.state?.expired && !error ? <Alert tone="info">Your session expired. Sign in again to continue.</Alert> : null}
                {error ? <Alert>{errorText(error)}</Alert> : null}
                <Field label="Work email" htmlFor="email" error={errors.email?.message}>
                  <Input id="email" type="email" autoComplete="username" autoFocus invalid={!!errors.email} {...form.register('email')} />
                </Field>
                <Field label="Password" htmlFor="password" error={errors.password?.message}>
                  <div className="relative">
                    <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" className="pr-10" invalid={!!errors.password} {...form.register('password')} />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-400 hover:text-ink-700"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </Field>
                <Button type="submit" variant="primary" size="lg" block loading={busy} icon={Lock}>
                  Sign in
                </Button>
              </form>
            ) : (
              <form onSubmit={onMfa} noValidate className="space-y-4">
                <div>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h1 className="text-headline text-ink-900">Two-factor verification</h1>
                  <p className="mt-1 text-bodySm text-ink-500">
                    Enter the 6-digit code from the authenticator app linked to <span className="font-semibold text-ink-800">{step.email}</span>.
                  </p>
                </div>
                {error ? <Alert>{errorText(error)}</Alert> : null}
                <Field label="Authentication code" htmlFor="code">
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="000000"
                    className="num h-11 text-center text-headline tracking-[0.5em]"
                  />
                </Field>
                <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={code.length !== 6}>
                  Verify and sign in
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStep({ name: 'credentials' });
                    setError(null);
                  }}
                  className="mx-auto flex items-center gap-1 text-caption font-semibold text-ink-500 hover:text-ink-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Use a different account
                </button>
              </form>
            )}
          </div>
          <p className="mt-6 text-center text-caption text-ink-400">Access is restricted to authorised WAY2CARS staff. All actions are audited.</p>
        </div>
      </div>
    </div>
  );
}

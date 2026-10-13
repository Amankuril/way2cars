import { useState } from 'react';
import { Copy, QrCode } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { errorMessage } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { Button } from './Button.jsx';
import { Field, Input } from './Form.jsx';
import { useToast } from './Toast.jsx';

/** TOTP enrolment: request a secret (QR), confirm with a code, then refresh the profile. */
export function MfaEnrol({ onDone }) {
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api.post(`${ADMIN}/me/mfa/setup`));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`${ADMIN}/me/mfa/enable`, { code });
      await refreshMe();
      toast.success('Two-factor sign-in is on', 'You will need a code from your authenticator app at every sign-in.');
      onDone?.();
    } catch (err) {
      setError(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-bodySm text-ink-600">Use Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app.</p>
        {error ? <p className="text-caption font-semibold text-danger-600" role="alert">{errorMessage(error)}</p> : null}
        <Button variant="primary" icon={QrCode} onClick={start} loading={busy}>
          Set up authenticator app
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={enable} className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div className="rounded-md border border-line bg-white p-2">
        <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width="220" height="220" className="h-auto w-full" />
      </div>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-4 text-bodySm text-ink-700">
          <li>Scan the QR code with your authenticator app.</li>
          <li>Can’t scan? Enter this key manually:</li>
        </ol>
        <div className="flex items-center gap-2">
          <code className="num break-all rounded-md bg-ink-50 px-2.5 py-1.5 font-mono text-caption text-ink-800">{setup.secret}</code>
          <Button
            size="sm"
            variant="ghost"
            icon={Copy}
            onClick={() => navigator.clipboard?.writeText(setup.secret).then(() => toast.info('Key copied'))}
            aria-label="Copy setup key"
          />
        </div>
        <Field label="6-digit code from the app" htmlFor="mfa-code" error={error ? errorMessage(error) : null}>
          <Input
            id="mfa-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="num max-w-[180px] text-center tracking-[0.4em]"
            autoFocus
          />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>
          Verify and turn on
        </Button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { ROLE_LABEL } from '@/admin/lib/nav.js';
import { errorMessage } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { Field, Input } from '@/admin/components/Form.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';
import { MfaEnrol } from '@/admin/components/MfaEnrol.jsx';
import { useToast } from '@/admin/components/Toast.jsx';
import { passwordProblem } from './Admins.jsx';

function ChangePassword() {
  const { logout } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!f.current) next.current = 'Enter your current password.';
    const p = passwordProblem(f.next);
    if (p) next.next = p;
    else if (f.next === f.current) next.next = 'Choose a different password.';
    if (f.confirm !== f.next) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.post(`${ADMIN}/me/password`, { currentPassword: f.current, newPassword: f.next });
      toast.success('Password changed', 'All sessions were signed out. Sign in again with your new password.');
      await logout().catch(() => {});
    } catch (err) {
      if (err.code === 'INVALID_CREDENTIALS') setErrors({ current: err.message });
      else if (err.status === 422) setErrors({ next: errorMessage(err) });
      else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Password" description="Changing it signs you out everywhere, including this browser.">
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        <Field label="Current password" htmlFor="pw-cur" error={errors.current}><Input id="pw-cur" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} invalid={Boolean(errors.current)} /></Field>
        <Field label="New password" htmlFor="pw-new" error={errors.next} hint="12+ characters with upper- and lowercase letters and a digit."><Input id="pw-new" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} invalid={Boolean(errors.next)} /></Field>
        <Field label="Confirm new password" htmlFor="pw-conf" error={errors.confirm}><Input id="pw-conf" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} invalid={Boolean(errors.confirm)} /></Field>
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
        <Button type="submit" variant="primary" loading={busy}>Change password</Button>
      </form>
    </Panel>
  );
}

function DisableMfa() {
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  return (
    <>
      <Button variant="danger-outline" icon={ShieldOff} onClick={() => { setPassword(''); setCode(''); setOpen(true); }}>Turn off two-factor…</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Turn off two-factor sign-in?"
        description="Your account will be protected by the password alone. Admin accounts are expected to use two-factor sign-in."
        confirmLabel="Turn off"
        tone="danger"
        onConfirm={async () => {
          if (!password || !/^\d{6}$/.test(code)) throw new Error('Enter your password and the 6-digit code from your app.');
          await api.post(`${ADMIN}/me/mfa/disable`, { password, code });
          await refreshMe();
          toast.success('Two-factor sign-in turned off');
        }}
      >
        <Field label="Password" htmlFor="dm-pw"><Input id="dm-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus /></Field>
        <Field label="Code from your authenticator" htmlFor="dm-code">
          <Input id="dm-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="num max-w-[160px] tracking-[0.3em]" placeholder="000000" />
        </Field>
      </ConfirmDialog>
    </>
  );
}

export default function Security() {
  const { admin } = useAuth();
  return (
    <>
      <PageHeader title="My security" description="Your admin profile, password and two-factor sign-in." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Two-factor sign-in" actions={admin?.mfaEnabled ? <StatusPill tone="success">On</StatusPill> : <StatusPill tone="warning">Off</StatusPill>}>
            {admin?.mfaEnabled ? (
              <div className="space-y-4">
                <p className="flex items-start gap-2 text-bodySm text-ink-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" /> A code from your authenticator app is required at every sign-in.</p>
                <DisableMfa />
              </div>
            ) : (
              <MfaEnrol />
            )}
          </Panel>
          <ChangePassword />
        </div>
        <Panel title="Profile" className="lg:self-start">
          <KeyValue
            columns={1}
            items={[
              ['Name', admin?.name],
              ['Email', admin?.email],
              ['Role', ROLE_LABEL[admin?.role] || admin?.role],
              ['Permissions', admin?.permissions?.includes('*') ? 'All permissions' : <span className="text-caption">{admin?.permissions?.join(', ')}</span>],
              ['Last sign-in', admin?.lastLoginAt ? dateTime(admin.lastLoginAt) : null],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

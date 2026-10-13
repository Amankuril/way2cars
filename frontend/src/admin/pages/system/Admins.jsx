import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldOff, UserCog } from 'lucide-react';
import { api, ADMIN } from '@/lib/api.js';
import { dateTime, dateLong } from '@shared/lib/format.js';
import { ADMIN_STATUS } from '@/lib/labels.js';
import { ROLE_LABEL } from '@/lib/nav.js';
import { useAction } from '@/lib/hooks.js';
import { errorMessage, fieldErrorMap } from '@/lib/utils.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { PageHeader } from '@/components/PageHeader.jsx';
import { DataTable } from '@/components/DataTable.jsx';
import { Button } from '@/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/components/Modal.jsx';
import { Field, Input, Select } from '@/components/Form.jsx';
import { StatusPill, Tag } from '@/components/StatusPill.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';

const ROLE_HINT = {
  super_admin: 'Everything, including settings and admin accounts.',
  operations: 'Bookings, trips, users, hosts, cars, KYC, catalog, support, reviews.',
  kyc_reviewer: 'KYC queue and car listing reviews.',
  finance: 'Payouts, refunds, wallet credits, bank verification, reports.',
  support: 'Support tickets, review moderation; read-only users, hosts and bookings.',
  content: 'CMS pages, FAQs, banners, coupons, broadcasts and catalog.',
};

export function passwordProblem(p) {
  if (p.length < 12) return 'At least 12 characters.';
  if (!/[A-Z]/.test(p)) return 'Add an uppercase letter.';
  if (!/[a-z]/.test(p)) return 'Add a lowercase letter.';
  if (!/\d/.test(p)) return 'Add a digit.';
  return null;
}

function RoleSelect({ id, value, onChange }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </Select>
  );
}

function CreateAdmin({ onClose }) {
  const [f, setF] = useState({ name: '', email: '', role: 'operations', password: '' });
  const [errors, setErrors] = useState({});
  const create = useAction((body) => api.post(`${ADMIN}/admins`, body), { success: (a) => `Admin account created for ${a.email}`, invalidate: [['admins']], toastError: false, onSuccess: onClose });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e) => {
    e?.preventDefault();
    const next = {};
    if (f.name.trim().length < 2) next.name = 'Enter the full name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) next.email = 'Enter a valid email.';
    const pw = passwordProblem(f.password);
    if (pw) next.password = pw;
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({ name: f.name.trim(), email: f.email.trim().toLowerCase(), role: f.role, password: f.password }, {
      onError: (err) => setErrors({ ...fieldErrorMap(err), ...(err.code === 'ADMIN_EXISTS' ? { email: err.message } : {}), form: err.status === 422 || err.code === 'ADMIN_EXISTS' ? null : errorMessage(err) }),
    });
  };
  return (
    <Modal
      open
      onClose={() => !create.isPending && onClose()}
      title="New admin account"
      description="Share the temporary password securely. The admin must set up two-factor sign-in on first login."
      footer={<><Button onClick={onClose} disabled={create.isPending}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create account</Button></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="ad-name" required error={errors.name}><Input id="ad-name" value={f.name} onChange={set('name')} maxLength={100} invalid={Boolean(errors.name)} data-autofocus /></Field>
        <Field label="Work email" htmlFor="ad-email" required error={errors.email}><Input id="ad-email" type="email" value={f.email} onChange={set('email')} autoComplete="off" invalid={Boolean(errors.email)} /></Field>
        <Field label="Role" htmlFor="ad-role" hint={ROLE_HINT[f.role]}><RoleSelect id="ad-role" value={f.role} onChange={(v) => setF((x) => ({ ...x, role: v }))} /></Field>
        <Field label="Temporary password" htmlFor="ad-pw" required error={errors.password} hint="12+ characters with upper- and lowercase letters and a digit.">
          <Input id="ad-pw" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" invalid={Boolean(errors.password)} />
        </Field>
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

function ManageAdmin({ admin, onClose }) {
  const [role, setRole] = useState(admin.role);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const update = useAction((body) => api.patch(`${ADMIN}/admins/${admin.id}`, body), {
    success: (_d, b) => (b.role ? 'Role changed — their sessions were signed out' : b.status === 'disabled' ? 'Account disabled' : b.status === 'active' ? 'Account re-enabled' : b.resetPassword ? 'Password reset — their sessions were signed out' : 'Two-factor sign-in reset'),
    invalidate: [['admins']],
    toastError: false,
  });
  const CONFIRMS = {
    role: { title: `Change role to ${ROLE_LABEL[role]}?`, description: 'Their permissions change immediately and they must sign in again.', label: 'Change role', body: { role } },
    disable: { title: `Disable ${admin.name}?`, description: 'They are signed out and can no longer sign in.', label: 'Disable account', tone: 'danger', body: { status: 'disabled' } },
    enable: { title: `Re-enable ${admin.name}?`, description: 'They can sign in again.', label: 'Enable account', body: { status: 'active' } },
    password: { title: 'Reset password?', description: 'Their sessions are signed out. Share the new password securely.', label: 'Reset password', tone: 'danger', body: { resetPassword: pw } },
    mfa: { title: 'Reset two-factor sign-in?', description: 'Use this when they lose their authenticator. They must enrol again at next sign-in.', label: 'Reset MFA', tone: 'danger', body: { resetMfa: true } },
  };
  const c = confirm ? CONFIRMS[confirm] : null;
  return (
    <Modal open onClose={onClose} title={admin.name} description={`${admin.email} · ${ROLE_LABEL[admin.role]}`} size="md" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-5">
        <section className="space-y-2">
          <Field label="Role" htmlFor="m-role" hint={ROLE_HINT[role]}><RoleSelect id="m-role" value={role} onChange={setRole} /></Field>
          <Button size="sm" disabled={role === admin.role} onClick={() => setConfirm('role')}>Change role</Button>
        </section>
        <section className="space-y-2 border-t border-line pt-4">
          <Field label="New password" htmlFor="m-pw" error={pwErr} hint="12+ characters with upper- and lowercase letters and a digit.">
            <Input id="m-pw" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(null); }} autoComplete="new-password" invalid={Boolean(pwErr)} />
          </Field>
          <Button size="sm" icon={KeyRound} onClick={() => { const p = passwordProblem(pw); if (p) setPwErr(p); else setConfirm('password'); }}>Reset password</Button>
        </section>
        <section className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button size="sm" icon={ShieldOff} disabled={!admin.mfaEnabled} onClick={() => setConfirm('mfa')}>Reset two-factor</Button>
          {admin.status === 'active' ? <Button size="sm" variant="danger-outline" onClick={() => setConfirm('disable')}>Disable account</Button> : <Button size="sm" onClick={() => setConfirm('enable')}>Enable account</Button>}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(c)}
        onClose={() => setConfirm(null)}
        title={c?.title}
        description={c?.description}
        confirmLabel={c?.label}
        tone={c?.tone}
        onConfirm={async () => {
          await update.mutateAsync(c.body);
          if (confirm === 'password') setPw('');
          if (confirm !== 'role' && confirm !== 'password') onClose();
        }}
      />
    </Modal>
  );
}

export default function Admins() {
  const { admin: me } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admins'], queryFn: () => api.get(`${ADMIN}/admins`) });
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(null);
  const current = managing && data?.find((a) => a.id === managing);

  const columns = [
    {
      key: 'name',
      header: 'Admin',
      cell: (a) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-ink-900">{a.name}{a.id === me?.id ? <Tag tone="info">You</Tag> : null}</div>
          <div className="truncate text-caption text-ink-500">{a.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', cell: (a) => ROLE_LABEL[a.role] || a.role },
    { key: 'status', header: 'Status', cell: (a) => <StatusPill map={ADMIN_STATUS} value={a.status} /> },
    { key: 'mfa', header: 'Two-factor', cell: (a) => (a.mfaEnabled ? <StatusPill tone="success" dot={false}>On</StatusPill> : <StatusPill tone="warning" dot={false}>Not set up</StatusPill>) },
    { key: 'last', header: 'Last sign-in', cell: (a) => <span className="whitespace-nowrap text-ink-600">{a.lastLoginAt ? dateTime(a.lastLoginAt) : 'Never'}</span> },
    { key: 'created', header: 'Created', cell: (a) => <span className="whitespace-nowrap text-ink-600">{a.createdAt ? dateLong(a.createdAt) : '—'}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (a) => (a.id === me?.id ? <span className="text-caption text-ink-400">Use My security</span> : <Button size="xs" icon={UserCog} onClick={() => setManaging(a.id)}>Manage</Button>),
    },
  ];

  return (
    <>
      <PageHeader title="Admin accounts" description="Who can access this panel and what they can do. Every change signs the affected admin out." actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New admin</Button>} />
      <DataTable columns={columns} rows={data} loading={isLoading} error={error} onRetry={refetch} empty={<EmptyState title="No admins" />} />
      {creating ? <CreateAdmin onClose={() => setCreating(false)} /> : null}
      {current ? <ManageAdmin key={current.id} admin={current} onClose={() => setManaging(null)} /> : null}
    </>
  );
}

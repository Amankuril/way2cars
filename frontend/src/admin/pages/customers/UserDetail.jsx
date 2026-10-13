import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Ban, CircleCheck, RotateCcw, WalletCards } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong, maskPhone } from '@shared/lib/format.js';
import { USER_STATUS, KYC_STATUS, KYC_SUBMISSION_STATUS, BOOKING_STATUS, LEDGER_TYPE, ID_PROOF } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { ageFrom, errorMessage, fmtNumber, humanize, toPaise } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { Button, ButtonLink } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, MoneyInput, Textarea } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';
import { HistoryList } from '@/admin/components/HistoryList.jsx';

const ACTIONS = {
  approve: { title: 'Approve this account?', description: 'The renter can start booking cars.', label: 'Approve account', tone: 'success' },
  suspend: { title: 'Suspend this renter?', description: 'They are signed out everywhere and cannot book. Accounts with a trip in progress cannot be suspended.', label: 'Suspend account', tone: 'danger' },
  reactivate: { title: 'Reactivate this renter?', description: 'They can sign in and book again.', label: 'Reactivate', tone: 'primary' },
};

function WalletCredit({ userId, open, onClose }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState({});
  const credit = useAction((body) => api.post(`${ADMIN}/users/${userId}/wallet-adjustment`, body), {
    success: (_d, b) => `${money(b.amountPaise)} credited to the wallet`,
    invalidate: [['user', userId], ['users']],
    toastError: false,
    onSuccess: () => {
      setAmount('');
      setReason('');
      onClose();
    },
  });
  const submit = (e) => {
    e?.preventDefault();
    const p = toPaise(amount);
    const next = {};
    if (!p || p < 100 || p > 10_000_000) next.amount = 'Enter an amount between ₹1 and ₹1,00,000.';
    if (reason.trim().length < 5) next.reason = 'Explain the credit in at least 5 characters.';
    setErr(next);
    if (Object.keys(next).length) return;
    credit.mutate({ amountPaise: p, reason: reason.trim() }, { onError: (e2) => setErr({ form: errorMessage(e2) }) });
  };
  return (
    <Modal
      open={open}
      onClose={() => !credit.isPending && onClose()}
      title="Credit the wallet"
      description="Goodwill or correction credit. It is added to the renter’s wallet balance immediately and recorded in the audit log."
      footer={
        <>
          <Button onClick={onClose} disabled={credit.isPending}>Cancel</Button>
          <Button variant="primary" loading={credit.isPending} onClick={submit}>Credit wallet</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount" htmlFor="wc-amount" required error={err.amount} hint="In rupees.">
          <MoneyInput id="wc-amount" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(err.amount)} data-autofocus />
        </Field>
        <Field label="Reason" htmlFor="wc-reason" required error={err.reason}>
          <Textarea id="wc-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} invalid={Boolean(err.reason)} placeholder="e.g. Compensation for delayed car handover on W2C…" />
        </Field>
        {err.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{err.form}</p> : null}
      </form>
    </Modal>
  );
}

export default function UserDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [action, setAction] = useState(null);
  const [crediting, setCrediting] = useState(false);
  const { data: u, isLoading, error, refetch } = useQuery({ queryKey: ['user', id], queryFn: () => api.get(`${ADMIN}/users/${id}`) });
  const status = useAction((body) => api.post(`${ADMIN}/users/${id}/status`, body), {
    success: (_d, b) => ({ approve: 'Account approved', suspend: 'Account suspended', reactivate: 'Account reactivated' }[b.action]),
    invalidate: [['user', id], ['users']],
    toastError: false,
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this user" /></div>;

  const manage = can('users.manage');
  const k = u.kycSubmission;
  const age = ageFrom(u.dateOfBirth);
  const a = action ? ACTIONS[action] : null;

  return (
    <>
      <PageHeader
        back={{ to: '/users', label: 'Users' }}
        title={u.name || 'Name not set'}
        meta={
          <>
            <StatusPill map={USER_STATUS} value={u.status} />
            <StatusPill map={KYC_STATUS} value={u.kyc?.status} dot={false} />
          </>
        }
        description={`Joined ${dateLong(u.createdAt)}${u.lastLoginAt ? ` · last signed in ${dateTime(u.lastLoginAt)}` : ''}`}
        actions={
          <>
            {can('refunds.manage') && u.status !== 'deleted' ? <Button icon={WalletCards} onClick={() => setCrediting(true)}>Credit wallet…</Button> : null}
            {manage && u.status === 'pending_approval' ? <Button variant="success" icon={CircleCheck} onClick={() => setAction('approve')}>Approve</Button> : null}
            {manage && u.status === 'suspended' ? <Button icon={RotateCcw} onClick={() => setAction('reactivate')}>Reactivate…</Button> : null}
            {manage && ['active', 'pending_approval'].includes(u.status) ? <Button variant="danger-outline" icon={Ban} onClick={() => setAction('suspend')}>Suspend…</Button> : null}
          </>
        }
      />

      {u.statusReason && u.status === 'suspended' ? (
        <div className="mb-5 rounded-lg border border-danger-100 bg-danger-50 p-4 text-bodySm text-danger-700">
          <span className="font-bold">Suspension reason:</span> {u.statusReason}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Profile">
            <KeyValue
              columns={3}
              items={[
                ['Phone', <span className="num">{maskPhone(u.phone)}</span>],
                ['Email', u.email],
                ['Date of birth', u.dateOfBirth ? `${dateLong(u.dateOfBirth)}${age !== null ? ` · ${age} yrs` : ''}` : null],
                ['Referral code', u.referralCode ? <span className="num font-mono">{u.referralCode}</span> : null],
                ['Completed trips', fmtNumber(u.stats?.tripsCompleted || 0)],
                ['Profile complete', u.profileCompleted ? 'Yes' : 'No'],
                { label: 'Saved addresses', value: u.addresses?.length ? u.addresses.map((ad) => `${ad.label ? `${ad.label}: ` : ''}${[ad.line1, ad.city, ad.pincode].filter(Boolean).join(', ')}`).join(' · ') : null, wide: true },
              ]}
            />
          </Panel>

          <Panel title="Bookings" description="Latest 20" flush actions={u.bookings?.length && can('bookings.read') ? <ButtonLink size="sm" to={`/bookings?userId=${u.id}`}>All bookings</ButtonLink> : null}>
            <MiniTable
              columns={[
                { key: 'ref', header: 'Booking', cell: (b) => (can('bookings.read') ? <Link to={`/bookings/${b.id}`} className="num link">{b.ref}</Link> : <span className="num">{b.ref}</span>) },
                { key: 'car', header: 'Car', cell: (b) => b.vehicle || '—' },
                { key: 'when', header: 'Trip (IST)', cell: (b) => <span className="whitespace-nowrap">{dateTime(b.startAt)} → {dateTime(b.endAt)}</span> },
                { key: 'status', header: 'Status', cell: (b) => <StatusPill map={BOOKING_STATUS} value={b.status} /> },
                { key: 'total', header: 'Total', align: 'right', cell: (b) => money(b.totalPaise) },
              ]}
              rows={u.bookings}
              empty="No bookings yet."
            />
          </Panel>

          <Panel title="Wallet ledger" description={`Balance ${money(u.walletBalancePaise || 0)} · latest 20 entries`} flush>
            <MiniTable
              columns={[
                { key: 'at', header: 'Date', cell: (e) => <span className="whitespace-nowrap">{dateTime(e.createdAt)}</span> },
                { key: 'type', header: 'Entry', cell: (e) => <div><div className="font-semibold text-ink-900">{LEDGER_TYPE[e.type] || humanize(e.type)}</div>{e.note ? <div className="text-caption text-ink-500">{e.note}</div> : null}</div> },
                { key: 'amt', header: 'Amount', align: 'right', cell: (e) => <span className={e.direction === 'credit' ? 'font-semibold text-success-700' : 'font-semibold text-ink-900'}>{money(e.direction === 'credit' ? e.amountPaise : -e.amountPaise, { sign: true })}</span> },
                { key: 'bal', header: 'Balance', align: 'right', cell: (e) => (e.balanceAfterPaise !== undefined ? money(e.balanceAfterPaise) : '—') },
              ]}
              rows={u.ledger}
              empty="No wallet activity yet."
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="KYC" actions={k && can('kyc.review') ? <Link to={`/kyc/${k.id}`} className="link text-label">{k.status === 'pending' ? 'Review now' : 'Open review'}</Link> : null}>
            {k ? (
              <KeyValue
                columns={1}
                items={[
                  ['Latest submission', <StatusPill map={KYC_SUBMISSION_STATUS} value={k.status} />],
                  ['Submitted', dateTime(k.createdAt)],
                  ['Driving licence', k.licence ? `${k.licence.numberMasked}${k.licence.expiry ? ` · valid until ${dateLong(k.licence.expiry)}` : ''}` : null],
                  ['Identity proof', k.idProof ? `${ID_PROOF[k.idProof.type] || k.idProof.type} · ${k.idProof.numberMasked}` : null],
                  u.kyc?.rejectionReason ? ['Rejection reason', u.kyc.rejectionReason] : null,
                ]}
              />
            ) : (
              <p className="text-bodySm text-ink-500">This renter has not submitted KYC documents.</p>
            )}
          </Panel>

          <Panel title="Notifications">
            <KeyValue
              columns={1}
              items={Object.entries(u.notificationPrefs || {}).map(([key, on]) => [humanize(key), on ? 'On' : 'Off'])}
            />
            {!Object.keys(u.notificationPrefs || {}).length ? <p className="text-bodySm text-ink-500">Defaults.</p> : null}
          </Panel>

          <Panel title="Activity history">
            <HistoryList items={u.history} />
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(a)}
        onClose={() => setAction(null)}
        title={a?.title}
        description={a?.description}
        confirmLabel={a?.label}
        tone={a?.tone}
        reason={{ label: 'Reason (recorded in the audit log)', minLength: 3 }}
        onConfirm={(reason) => status.mutateAsync({ action, reason })}
      />
      <WalletCredit userId={u.id} open={crediting} onClose={() => setCrediting(false)} />
    </>
  );
}

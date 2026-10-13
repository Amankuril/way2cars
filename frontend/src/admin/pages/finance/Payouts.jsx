import { useState } from 'react';
import { Link } from 'react-router';
import { Wallet, Eye, Copy, CircleCheck, Banknote, CircleX } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, maskPhone } from '@shared/lib/format.js';
import { PAYOUT_STATUS } from '@/admin/lib/labels.js';
import { useAction, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, errorMessage, shortId } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterChip } from '@/admin/components/Filters.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';
import { Button, IconButton } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Textarea } from '@/admin/components/Form.jsx';
import { KeyValue } from '@/admin/components/Panel.jsx';
import { useToast } from '@/admin/components/Toast.jsx';

const hostName = (v) => v?.businessName || v?.name || 'Unnamed host';

function BankDetails({ payout, open, onClose }) {
  const toast = useToast();
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const reveal = async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      setState({ status: 'ready', data: await api.get(`${ADMIN}/payouts/${payout.id}/bank-details`), error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  };
  const close = () => {
    setState({ status: 'idle', data: null, error: null });
    onClose();
  };
  const copy = (v) => navigator.clipboard?.writeText(v).then(() => toast.info('Copied to clipboard'));
  const d = state.data;
  return (
    <Modal open={open} onClose={close} title="Bank details for transfer" description={`${hostName(payout?.vendor)} · ${money(payout?.amountPaise)}`} footer={<Button onClick={close}>Done</Button>}>
      {state.status === 'ready' ? (
        <KeyValue
          columns={1}
          items={[
            ['Account holder', d.accountHolderName],
            ['Account number', <span className="inline-flex items-center gap-2"><span className="num font-mono text-bodySm font-bold tracking-wide">{d.accountNumber}</span><IconButton size="sm" icon={Copy} label="Copy account number" onClick={() => copy(d.accountNumber)} /></span>],
            ['IFSC', <span className="inline-flex items-center gap-2"><span className="num font-mono">{d.ifsc}</span><IconButton size="sm" icon={Copy} label="Copy IFSC" onClick={() => copy(d.ifsc)} /></span>],
            ['Bank', d.bankName],
            ['UPI', d.upiId],
          ]}
        />
      ) : (
        <div className="space-y-3">
          <KeyValue
            columns={1}
            items={[
              ['Account holder', payout?.bank?.accountHolderName],
              ['Account number', <span className="num font-mono">XXXXXX{payout?.bank?.accountNumberLast4}</span>],
              ['IFSC', payout?.bank?.ifsc],
            ]}
          />
          <p className="text-caption text-ink-500">The full account number is shown only when you need it to make the transfer. Every reveal is recorded in the audit log.</p>
          {state.status === 'error' ? <p className="text-caption font-semibold text-danger-600" role="alert">{errorMessage(state.error)}</p> : null}
          <Button variant="primary" icon={Eye} loading={state.status === 'loading'} onClick={reveal}>Reveal full details</Button>
        </div>
      )}
    </Modal>
  );
}

function MarkPaid({ payout, open, onClose, onDone }) {
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const pay = useAction((body) => api.post(`${ADMIN}/payouts/${payout.id}/decision`, body), {
    success: 'Payout marked as paid — the host has been notified',
    invalidate: [['payouts'], ['dashboard']],
    toastError: false,
    onSuccess: () => {
      setUtr('');
      setNote('');
      onDone();
    },
  });
  const submit = (e) => {
    e?.preventDefault();
    const v = utr.trim();
    if (!/^[A-Za-z0-9]{8,40}$/.test(v)) {
      setErr('Enter the bank UTR / reference: 8–40 letters or digits.');
      return;
    }
    setErr(null);
    pay.mutate({ action: 'mark_paid', utr: v, note: note.trim() || undefined }, { onError: (e2) => setErr(errorMessage(e2)) });
  };
  return (
    <Modal
      open={open}
      onClose={() => !pay.isPending && onClose()}
      title="Mark payout as paid"
      description={`Record the bank transfer of ${money(payout?.amountPaise)} to ${hostName(payout?.vendor)}. This cannot be undone.`}
      footer={
        <>
          <Button onClick={onClose} disabled={pay.isPending}>Cancel</Button>
          <Button variant="success" loading={pay.isPending} onClick={submit}>Confirm payment</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="UTR / bank reference" htmlFor="utr" required error={err}>
          <Input id="utr" value={utr} onChange={(e) => setUtr(e.target.value.replace(/\s/g, ''))} className="num font-mono uppercase" maxLength={40} autoComplete="off" invalid={Boolean(err)} data-autofocus />
        </Field>
        <Field label="Note" htmlFor="utr-note" hint="Optional — internal only.">
          <Textarea id="utr-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Payouts() {
  const { can } = useAuth();
  const [s, set] = useSearchState({ page: 1, status: 'requested', vendorId: '' });
  const query = compact({ page: s.page, limit: 25, status: s.status === 'all' ? '' : s.status, vendorId: s.vendorId });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['payouts'], `${ADMIN}/payouts`, query);
  const [bankFor, setBankFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const decide = useAction((vars) => api.post(`${ADMIN}/payouts/${vars.id}/decision`, vars.body), {
    success: (_d, v) => (v.body.action === 'approve' ? 'Payout approved — make the transfer, then mark it paid' : 'Payout rejected — funds returned to the host wallet'),
    invalidate: [['payouts'], ['dashboard']],
    toastError: false,
  });

  const columns = [
    {
      key: 'host',
      header: 'Host',
      cell: (p) => (
        <div className="min-w-0">
          {can('vendors.read') && p.vendor?._id ? <Link to={`/hosts/${p.vendor._id}`} className="block max-w-[220px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">{hostName(p.vendor)}</Link> : <span className="font-semibold">{hostName(p.vendor)}</span>}
          <div className="num text-caption text-ink-500">{maskPhone(p.vendor?.phone)}</div>
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', cell: (p) => <span className="font-bold text-ink-900">{money(p.amountPaise)}</span> },
    { key: 'bank', header: 'To account', cell: (p) => <CellStack primary={`${p.bank?.bankName || 'Bank'} · XXXX${p.bank?.accountNumberLast4 || ''}`} secondary={`${p.bank?.accountHolderName || ''} · ${p.bank?.ifsc || ''}`} className="max-w-[240px]" /> },
    { key: 'status', header: 'Status', cell: (p) => <StatusPill map={PAYOUT_STATUS} value={p.status} /> },
    { key: 'requested', header: 'Requested', cell: (p) => <span className="whitespace-nowrap text-ink-600">{dateTime(p.createdAt)}</span> },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (p) =>
        p.status === 'paid' ? <CellStack primary={<span className="num font-mono">{p.utr}</span>} secondary={p.paidAt ? `Paid ${dateTime(p.paidAt)}` : null} />
          : p.status === 'rejected' ? <span className="block max-w-[220px] truncate text-caption text-ink-600" title={p.rejectionReason}>{p.rejectionReason}</span>
            : p.reviewedAt ? <span className="text-caption text-ink-500">Approved {dateTime(p.reviewedAt)}</span> : <span className="text-ink-400">—</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (p) =>
        ['requested', 'approved'].includes(p.status) ? (
          <div className="flex justify-end gap-1.5">
            <Button size="xs" variant="ghost" icon={Eye} onClick={() => setBankFor(p)}>Bank</Button>
            {p.status === 'requested' ? <Button size="xs" icon={CircleCheck} onClick={() => setConfirm({ p, action: 'approve' })}>Approve</Button> : null}
            <Button size="xs" variant="success" icon={Banknote} onClick={() => setPayFor(p)}>Mark paid</Button>
            <Button size="xs" variant="danger-outline" icon={CircleX} onClick={() => setConfirm({ p, action: 'reject' })}>Reject</Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Payouts" description="Host withdrawal requests. Approve, transfer the money from the company bank account, then record the UTR to mark it paid." />
      <Tabs
        className="mb-4"
        label="Payout status"
        value={s.status}
        onChange={(v) => set({ status: v })}
        items={[
          { value: 'requested', label: 'Requested', count: s.status === 'requested' ? meta?.total : undefined },
          { value: 'approved', label: 'Processing', count: s.status === 'approved' ? meta?.total : undefined },
          { value: 'paid', label: 'Paid' },
          { value: 'rejected', label: 'Declined' },
          { value: 'all', label: 'All' },
        ]}
      />
      {s.vendorId ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip label={`Host …${shortId(s.vendorId)}`} onClear={() => set({ vendorId: '' })} />
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        empty={<EmptyState icon={Wallet} title={s.status === 'requested' ? 'No withdrawal requests waiting' : 'No payouts in this view'} description="Hosts request withdrawals from their available earnings in the host app." />}
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
      <BankDetails payout={bankFor} open={Boolean(bankFor)} onClose={() => setBankFor(null)} />
      {payFor ? <MarkPaid payout={payFor} open onClose={() => setPayFor(null)} onDone={() => setPayFor(null)} /> : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.action === 'approve' ? 'Approve this payout?' : 'Reject this payout?'}
        description={
          confirm?.action === 'approve'
            ? `${money(confirm?.p.amountPaise)} to ${hostName(confirm?.p.vendor)}. Approving marks it as processing; mark it paid once the transfer is done.`
            : `${money(confirm?.p.amountPaise)} goes back to the host’s available balance. The host sees your reason.`
        }
        confirmLabel={confirm?.action === 'approve' ? 'Approve' : 'Reject payout'}
        tone={confirm?.action === 'approve' ? 'primary' : 'danger'}
        reason={confirm?.action === 'reject' ? { label: 'Reason for the host', minLength: 5 } : undefined}
        onConfirm={(reason) => decide.mutateAsync({ id: confirm.p.id, body: confirm.action === 'approve' ? { action: 'approve' } : { action: 'reject', reason } })}
      />
    </>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil, Landmark, Eye, Banknote, HandCoins } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong, maskPhone } from '@shared/lib/format.js';
import { LEDGER_TYPE } from '@/admin/lib/labels.js';
import { useAction, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, errorMessage, fieldErrorMap, toPaise } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, SearchInput } from '@/admin/components/Filters.jsx';
import { Panel, KeyValue, StatTile } from '@/admin/components/Panel.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState, ErrorState } from '@/admin/components/EmptyState.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, MoneyInput, Textarea, Switch } from '@/admin/components/Form.jsx';

/**
 * Investors who fund WAY2CARS fleet cars. Link a car to an investor (with their share) on the car's
 * page; their share of each settled trip accrues here and finance pays it out against a bank UTR.
 */

function InvestorForm({ investor, onClose }) {
  const isNew = !investor?.id;
  const [f, setF] = useState({
    name: investor?.name || '', phone: investor?.phone || '', email: investor?.email || '', pan: '', notes: investor?.notes || '', isActive: investor?.isActive ?? true,
    changeBank: isNew, holder: investor?.bank?.accountHolderName || '', account: '', confirm: '', ifsc: investor?.bank?.ifsc || '', bankName: investor?.bank?.bankName || '', upi: investor?.bank?.upiId || '',
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/investors`, body) : api.patch(`${ADMIN}/investors/${investor.id}`, body)), {
    success: isNew ? 'Investor added' : 'Investor saved', invalidate: [['investors'], ['investor', investor?.id]], toastError: false, onSuccess: onClose,
  });
  const submit = (e) => {
    e?.preventDefault();
    const next = {};
    if (f.name.trim().length < 2) next.name = 'Enter the investor’s name.';
    if (f.phone && !/^[6-9]\d{9}$/.test(f.phone.trim())) next.phone = '10-digit mobile number.';
    if (f.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.pan.trim().toUpperCase())) next.pan = 'Enter a valid PAN.';
    const bankStarted = f.changeBank && (f.holder || f.account || f.ifsc);
    if (bankStarted) {
      if (f.holder.trim().length < 2) next.holder = 'Account holder name.';
      if (!/^\d{9,18}$/.test(f.account)) next.account = '9–18 digits.';
      if (f.account !== f.confirm) next.confirm = 'Account numbers do not match.';
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.trim().toUpperCase())) next.ifsc = 'Enter a valid IFSC.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(compact({
      name: f.name.trim(), phone: f.phone.trim() || (isNew ? undefined : ''), email: f.email.trim() || (isNew ? undefined : ''), notes: f.notes.trim() || undefined,
      pan: f.pan.trim() ? f.pan.trim().toUpperCase() : undefined, isActive: f.isActive,
      bank: bankStarted ? compact({ accountHolderName: f.holder.trim(), accountNumber: f.account, ifsc: f.ifsc.trim().toUpperCase(), bankName: f.bankName.trim() || undefined, upiId: f.upi.trim() || undefined }) : undefined,
    }), { onError: (err) => setErrors({ ...fieldErrorMap(err), form: errorMessage(err) }) });
  };
  return (
    <Modal open onClose={() => !save.isPending && onClose()} title={isNew ? 'New investor' : `Edit ${investor.name}`} size="lg"
      footer={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" onClick={submit} loading={save.isPending}>{isNew ? 'Add investor' : 'Save'}</Button></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="iv-name" required error={errors.name}><Input id="iv-name" value={f.name} onChange={set('name')} maxLength={120} invalid={Boolean(errors.name)} data-autofocus /></Field>
          <Field label="Mobile" htmlFor="iv-phone" error={errors.phone}><Input id="iv-phone" value={f.phone} onChange={set('phone')} inputMode="numeric" maxLength={10} className="num" /></Field>
          <Field label="Email" htmlFor="iv-email" error={errors.email}><Input id="iv-email" type="email" value={f.email} onChange={set('email')} maxLength={200} /></Field>
          <Field label="PAN" htmlFor="iv-pan" error={errors.pan} hint={investor?.panMasked ? `Saved: ${investor.panMasked}. Leave blank to keep it.` : 'For TDS and records.'}><Input id="iv-pan" value={f.pan} onChange={set('pan')} maxLength={10} className="uppercase" /></Field>
        </div>
        <fieldset className="rounded-md border border-line p-4">
          <legend className="px-1 text-label text-ink-800">Bank account for payouts</legend>
          {!isNew && !f.changeBank ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-bodySm text-ink-700">{investor.bank ? `${investor.bank.accountHolderName} · ${investor.bank.accountNumberMasked} · ${investor.bank.ifsc}` : 'No bank account yet.'}</p>
              <Button size="sm" onClick={() => setF((x) => ({ ...x, changeBank: true }))}>{investor.bank ? 'Replace bank account' : 'Add bank account'}</Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account holder" htmlFor="iv-holder" error={errors.holder}><Input id="iv-holder" value={f.holder} onChange={set('holder')} maxLength={120} /></Field>
              <Field label="Bank name" htmlFor="iv-bank"><Input id="iv-bank" value={f.bankName} onChange={set('bankName')} maxLength={100} /></Field>
              <Field label="Account number" htmlFor="iv-acc" error={errors.account}><Input id="iv-acc" value={f.account} onChange={set('account')} inputMode="numeric" className="num" autoComplete="off" /></Field>
              <Field label="Confirm account number" htmlFor="iv-acc2" error={errors.confirm}><Input id="iv-acc2" value={f.confirm} onChange={set('confirm')} inputMode="numeric" className="num" autoComplete="off" /></Field>
              <Field label="IFSC" htmlFor="iv-ifsc" error={errors.ifsc}><Input id="iv-ifsc" value={f.ifsc} onChange={set('ifsc')} maxLength={11} className="uppercase num" /></Field>
              <Field label="UPI ID" htmlFor="iv-upi"><Input id="iv-upi" value={f.upi} onChange={set('upi')} maxLength={100} /></Field>
            </div>
          )}
        </fieldset>
        <Field label="Notes" htmlFor="iv-notes"><Textarea id="iv-notes" rows={2} maxLength={1000} value={f.notes} onChange={set('notes')} placeholder="Agreement reference, payout schedule…" /></Field>
        <Switch label="Active" description="Inactive investors can't be linked to more cars." checked={f.isActive} onChange={(on) => setF((x) => ({ ...x, isActive: on }))} />
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

function PayoutForm({ investor, onClose }) {
  const [amount, setAmount] = useState(String((investor.wallet?.availablePaise || 0) / 100));
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const pay = useAction((body) => api.post(`${ADMIN}/investors/${investor.id}/payouts`, body), { success: 'Payout recorded', invalidate: [['investor', investor.id], ['investors']], toastError: false, onSuccess: onClose });
  const submit = () => {
    const paise = toPaise(amount);
    const next = {};
    if (!paise || paise < 100 || paise > (investor.wallet?.availablePaise || 0)) next.amount = `Between ₹1 and ${money(investor.wallet?.availablePaise || 0)}.`;
    if (!/^[A-Za-z0-9]{8,40}$/.test(utr.trim())) next.utr = 'Enter the bank UTR / reference (8–40 letters or digits).';
    setErrors(next);
    if (Object.keys(next).length) return;
    pay.mutate(compact({ amountPaise: paise, utr: utr.trim(), note: note.trim() || undefined }), { onError: (err) => setErrors({ form: errorMessage(err) }) });
  };
  return (
    <Modal open onClose={() => !pay.isPending && onClose()} title={`Pay ${investor.name}`} description="Record a bank transfer you have already made. It reduces the investor’s unpaid balance."
      footer={<><Button onClick={onClose} disabled={pay.isPending}>Cancel</Button><Button variant="primary" onClick={submit} loading={pay.isPending}>Record payout</Button></>}>
      <div className="space-y-4">
        <Field label="Amount" htmlFor="ip-amt" error={errors.amount} hint={`Unpaid balance ${money(investor.wallet?.availablePaise || 0)}`}><MoneyInput id="ip-amt" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(errors.amount)} /></Field>
        <Field label="Bank UTR / reference" htmlFor="ip-utr" error={errors.utr}><Input id="ip-utr" value={utr} onChange={(e) => setUtr(e.target.value)} className="num" invalid={Boolean(errors.utr)} /></Field>
        <Field label="Note" htmlFor="ip-note"><Input id="ip-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. October earnings" /></Field>
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

export function InvestorsList() {
  const { can } = useAuth();
  const [s, set] = useSearchState({ page: 1, q: '' });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['investors'], `${ADMIN}/investors`, compact({ page: s.page, limit: 25, q: s.q }));
  const [creating, setCreating] = useState(false);
  const columns = [
    { key: 'name', header: 'Investor', cell: (i) => <div><Link to={`/investors/${i.id}`} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{i.name}</Link><div className="num text-caption text-ink-500">{i.phone ? maskPhone(i.phone) : 'No phone'}</div></div> },
    { key: 'bank', header: 'Bank', cell: (i) => (i.bank ? <CellStack primary={i.bank.accountNumberMasked} secondary={i.bank.ifsc} /> : <StatusPill tone="warning" dot={false}>No bank account</StatusPill>) },
    { key: 'cars', header: 'Cars', align: 'right', cell: (i) => i.cars },
    { key: 'due', header: 'Unpaid', align: 'right', cell: (i) => <span className="font-semibold text-ink-900">{money(i.wallet?.availablePaise || 0)}</span> },
    { key: 'earned', header: 'Earned (lifetime)', align: 'right', cell: (i) => money(i.wallet?.lifetimeEarnedPaise || 0) },
    { key: 'paid', header: 'Paid out', align: 'right', cell: (i) => money(i.wallet?.lifetimePaidOutPaise || 0) },
    { key: 'status', header: 'Status', cell: (i) => <StatusPill tone={i.isActive ? 'success' : 'neutral'}>{i.isActive ? 'Active' : 'Inactive'}</StatusPill> },
  ];
  return (
    <>
      <PageHeader title="Investors" description="People who fund WAY2CARS fleet cars. Link a fleet car to an investor and their share on the car page; fleet cars without an investor earn 100% for WAY2CARS." actions={can('payouts.manage') ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New investor</Button> : null} />
      <FilterBar><SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Name or phone" label="Search investors" className="sm:w-72" /></FilterBar>
      <DataTable columns={columns} rows={rows} loading={isLoading} error={error} onRetry={refetch} rowHref={(i) => `/investors/${i.id}`}
        empty={<EmptyState icon={HandCoins} title="No investors yet" description="Add an investor, then link their cars from the fleet car pages." />}
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />} />
      {creating ? <InvestorForm onClose={() => setCreating(false)} /> : null}
    </>
  );
}

export function InvestorDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: inv, isLoading, error, refetch } = useQuery({ queryKey: ['investor', id], queryFn: () => api.get(`${ADMIN}/investors/${id}`) });
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [bank, setBank] = useState(null);
  const reveal = useAction(() => api.get(`${ADMIN}/investors/${id}/bank-details`), { onSuccess: (d) => setBank(d) });
  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>;
  return (
    <>
      <PageHeader title={inv.name} back={{ to: '/investors', label: 'Investors' }} meta={<StatusPill tone={inv.isActive ? 'success' : 'neutral'}>{inv.isActive ? 'Active' : 'Inactive'}</StatusPill>}
        actions={can('payouts.manage') ? <><Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button><Button variant="primary" icon={Banknote} disabled={!(inv.wallet?.availablePaise >= 100)} onClick={() => setPaying(true)}>Record payout</Button></> : null} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Unpaid balance" value={money(inv.wallet?.availablePaise || 0)} sub="Credited when each trip settles" />
        <StatTile label="Earned (lifetime)" value={money(inv.wallet?.lifetimeEarnedPaise || 0)} />
        <StatTile label="Paid out" value={money(inv.wallet?.lifetimePaidOutPaise || 0)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Details">
          <KeyValue items={[
            ['Mobile', inv.phone ? <span className="num">{inv.phone}</span> : null],
            ['Email', inv.email],
            ['PAN', inv.panMasked],
            ['Added', dateLong(inv.createdAt)],
            { label: 'Notes', value: inv.notes, wide: true },
          ]} />
        </Panel>
        <Panel title="Bank account" actions={inv.bank && can('payouts.manage') && !bank ? <Button size="sm" icon={Eye} loading={reveal.isPending} onClick={() => reveal.mutate()}>Show full number</Button> : null}>
          {inv.bank ? (
            <KeyValue items={[
              ['Account holder', inv.bank.accountHolderName],
              ['Account number', <span className="num">{bank?.accountNumber || inv.bank.accountNumberMasked}</span>],
              ['IFSC', <span className="num">{inv.bank.ifsc}</span>],
              ['Bank', inv.bank.bankName],
              ['UPI', inv.bank.upiId],
            ]} />
          ) : <EmptyState icon={Landmark} title="No bank account" description="Add one with Edit before recording payouts." />}
        </Panel>
        <Panel title="Cars" description="Change a car’s investor or share on the car page." flush>
          <MiniTable rows={inv.cars} empty="No cars linked yet." columns={[
            { key: 'car', header: 'Car', cell: (c) => <Link to={`/vehicles/${c.id}`} className="link">{c.title}</Link> },
            { key: 'reg', header: 'Reg. no.', cell: (c) => <span className="num">{c.registrationNumber}</span> },
            { key: 'share', header: 'Share', align: 'right', cell: (c) => `${(c.shareBps || 0) / 100}%` },
            { key: 'trips', header: 'Trips', align: 'right', cell: (c) => c.trips },
          ]} />
        </Panel>
        <Panel title="Payouts" flush>
          <MiniTable rows={inv.payouts} empty="No payouts yet." columns={[
            { key: 'at', header: 'Paid', cell: (p) => dateTime(p.paidAt) },
            { key: 'utr', header: 'UTR', cell: (p) => <span className="num">{p.utr}</span> },
            { key: 'note', header: 'Note', cell: (p) => p.note || '—' },
            { key: 'amt', header: 'Amount', align: 'right', cell: (p) => money(p.amountPaise) },
          ]} />
        </Panel>
        <Panel title="Earnings ledger" className="xl:col-span-2" flush>
          <MiniTable rows={inv.ledger} empty="Nothing yet. The share of each settled trip on this investor's cars appears here." columns={[
            { key: 'at', header: 'Date', cell: (e) => dateTime(e.createdAt) },
            { key: 'type', header: 'Entry', cell: (e) => LEDGER_TYPE[e.type] || e.type },
            { key: 'booking', header: 'Booking', cell: (e) => (e.bookingId ? <Link to={`/bookings/${e.bookingId}`} className="num link">{e.bookingRef || 'Open'}</Link> : '—') },
            { key: 'note', header: 'Note', cell: (e) => e.note || '—' },
            { key: 'amt', header: 'Amount', align: 'right', cell: (e) => <span className={e.direction === 'credit' ? 'text-success-700' : 'text-ink-800'}>{e.direction === 'credit' ? '+' : '−'}{money(e.amountPaise)}</span> },
            { key: 'bal', header: 'Unpaid after', align: 'right', cell: (e) => money(e.balanceAfterPaise) },
          ]} />
        </Panel>
      </div>
      {editing ? <InvestorForm investor={inv} onClose={() => setEditing(false)} /> : null}
      {paying ? <PayoutForm investor={inv} onClose={() => setPaying(false)} /> : null}
    </>
  );
}

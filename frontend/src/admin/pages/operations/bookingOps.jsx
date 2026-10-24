import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Check, X, HandCoins } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime } from '@shared/lib/format.js';
import { EXTENSION_STATUS, CHARGE_STATUS, BALANCE_STATUS, OFFICE_METHOD, OWNER_PAYOUT } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { cn, toPaise, errorMessage, istDateTimeInput, fromIstDateTime } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, MoneyInput, Select, Textarea } from '@/admin/components/Form.jsx';

/**
 * Operations panels on the booking page: acting for the car owner, extensions, money still to
 * collect (balance / extension / dues, incl. office payments), the Way2Cars ↔ owner split and
 * refunds that must be handed back by hand.
 */

const invalidateFor = (id) => [['booking', id], ['bookings'], ['dashboard']];

function OfficeMethodFields({ method, setMethod, reference, setReference, idPrefix }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Paid by" htmlFor={`${idPrefix}-method`}>
        <Select id={`${idPrefix}-method`} value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(OFFICE_METHOD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Reference" htmlFor={`${idPrefix}-ref`} hint="UPI / card / bank reference, or receipt number.">
        <Input id={`${idPrefix}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
      </Field>
    </div>
  );
}

/** Records money collected at the office against one thing the booking owes. */
export function OfficePaymentDialog({ booking, due, onClose }) {
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState(null);
  const action = useAction((body) => api.post(`${ADMIN}/bookings/${booking.id}/office-payments`, body), {
    success: 'Payment recorded', invalidate: invalidateFor(booking.id), toastError: false, onSuccess: onClose,
  });
  return (
    <Modal
      open={Boolean(due)}
      onClose={() => !action.isPending && onClose()}
      title="Record office payment"
      description={due ? `${due.label}: ${money(due.amountPaise)}. The renter's app updates straight away.` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={action.isPending}>Cancel</Button>
          <Button variant="primary" loading={action.isPending} onClick={() => action.mutate({ purpose: due.purpose, extensionId: due.extensionId, method, reference: reference.trim() || undefined }, { onError: (e) => setErr(errorMessage(e)) })}>
            Record {due ? money(due.amountPaise) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <OfficeMethodFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} idPrefix="op" />
        {err ? <p className="text-caption font-semibold text-danger-600" role="alert">{err}</p> : null}
      </div>
    </Modal>
  );
}

/** Accept/decline for cars awaiting the owner, and settling returns (company fleet or unresponsive hosts). */
export function OwnerActionsPanel({ b }) {
  const { can } = useAuth();
  const [confirm, setConfirm] = useState(null);
  const inv = invalidateFor(b.id);
  const decide = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/decision`, body), { success: (_d, v) => (v.decision === 'accept' ? 'Booking confirmed' : 'Booking declined — full refund initiated'), invalidate: inv, toastError: false });
  const settle = useAction(() => api.post(`${ADMIN}/bookings/${b.id}/return-review`, { decision: 'accept' }), { success: 'Return accepted and trip settled', invalidate: inv, toastError: false });
  const pendingClaim = b.inspections?.damageClaim?.status === 'pending';
  const awaitingOwner = b.status === 'pending_vendor_approval' && can('bookings.manage');
  const returnToSettle = b.status === 'return_pending' && !pendingClaim && can('trips.manage');
  if (!awaitingOwner && !returnToSettle) return null;
  const company = b.ownership === 'company';
  return (
    <Panel title={awaitingOwner ? 'Waiting for the car owner' : 'Return waiting for review'} description={company ? 'This is a WAY2CARS fleet car — operations act as the owner.' : 'You can act for the host, e.g. when they cannot be reached.'}>
      <div className="flex flex-wrap gap-2">
        {awaitingOwner ? (
          <>
            <Button variant="success" size="sm" icon={Check} onClick={() => setConfirm('accept')}>Confirm booking</Button>
            <Button variant="danger-outline" size="sm" icon={X} onClick={() => setConfirm('reject')}>Decline…</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" icon={Check} onClick={() => setConfirm('settle')}>Accept return and settle</Button>
        )}
      </div>
      <ConfirmDialog open={confirm === 'accept'} onClose={() => setConfirm(null)} title="Confirm this booking?" description="The renter and host are notified." confirmLabel="Confirm booking" onConfirm={() => decide.mutateAsync({ decision: 'accept' })} />
      <ConfirmDialog open={confirm === 'reject'} onClose={() => setConfirm(null)} title="Decline this booking?" description="The renter gets a full refund." confirmLabel="Decline" tone="danger" reason={{ label: 'Reason (shared with the renter)', minLength: 5 }} onConfirm={(reason) => decide.mutateAsync({ decision: 'reject', reason })} />
      <ConfirmDialog open={confirm === 'settle'} onClose={() => setConfirm(null)} title="Accept the return as-is?" description="Settles the trip now: deductions come out of the deposit, the rest is refunded and the owner's share is credited." confirmLabel="Accept and settle" onConfirm={() => settle.mutateAsync()} />
    </Panel>
  );
}

/** Way2Cars' share vs the car owner's for this booking. */
export function SplitPanel({ b }) {
  const s = b.split;
  if (!s) return null;
  const company = s.ownership === 'company';
  return (
    <Panel title="Money split" description={company ? 'WAY2CARS fleet car: all revenue stays with WAY2CARS.' : `WAY2CARS keeps ${(s.commissionBps || 0) / 100}% of the rental; the owner's share settles to their bank account after the trip.`} actions={<StatusPill map={OWNER_PAYOUT} value={s.status} />}>
      <AmountRows
        rows={[
          { label: 'Collected from renter (net of refunds)', value: money(s.collectedPaise), strong: true },
          { label: 'GST (to be remitted)', value: money(s.gstPaise) },
          s.depositHeldPaise ? { label: 'Security deposit held', value: money(s.depositHeldPaise) } : null,
          company ? null : { label: { settled: 'Owner earning', closed: 'Owner kept (late cancellation)', pending_trip: 'Owner share (expected)' }[s.status], value: money(s.ownerPaise), tone: 'success' },
          { label: s.status === 'pending_trip' ? 'WAY2CARS share (expected)' : 'WAY2CARS share', value: money(s.platformPaise), strong: true },
        ]}
      />
    </Panel>
  );
}

/** Balance still to collect on advance or office bookings. */
export function BalancePanel({ b }) {
  const { can } = useAuth();
  const [due, setDue] = useState(null);
  if (!b.balance) return null;
  const open = b.balance.status === 'due' && ['pending_vendor_approval', 'confirmed'].includes(b.status);
  return (
    <Panel title="Balance" actions={<StatusPill map={BALANCE_STATUS} value={b.balance.status} />}>
      <KeyValue
        columns={1}
        items={[
          b.pricing?.advancePaise ? ['Advance paid', money(b.pricing.advancePaise)] : null,
          [b.balance.status === 'paid' ? 'Balance paid' : 'Balance', money(b.balance.duePaise)],
          b.balance.status === 'due' ? ['Due by', dateTime(b.balance.dueAt)] : null,
          b.balance.paidAt ? ['Paid on', dateTime(b.balance.paidAt)] : null,
        ]}
      />
      {open && can('bookings.manage') ? (
        <div className="mt-4">
          <Button size="sm" icon={HandCoins} onClick={() => setDue({ purpose: 'balance', amountPaise: b.balance.duePaise, label: 'Booking balance' })}>Record office payment…</Button>
          <p className="mt-2 text-caption text-ink-500">The renter can also pay it in the app. Pickup is blocked until it is paid.</p>
        </div>
      ) : null}
      <OfficePaymentDialog booking={b} due={due} onClose={() => setDue(null)} />
    </Panel>
  );
}

function ExtendDialog({ b, open, onClose }) {
  const [endAt, setEndAt] = useState('');
  const [rental, setRental] = useState('');
  const [charge, setCharge] = useState('collect_in_app');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setEndAt(istDateTimeInput(new Date(new Date(b.endAt).getTime() + 24 * 3600_000)));
      setRental('');
      setCharge('collect_in_app');
      setErr(null);
    }
  }, [open, b.endAt]);
  const iso = endAt ? fromIstDateTime(endAt) : null;
  const check = useQuery({
    queryKey: ['extension-check', b.id, iso],
    queryFn: () => api.get(`${ADMIN}/bookings/${b.id}/extension-check`, { endAt: iso }),
    enabled: Boolean(open && iso && new Date(iso) > new Date(b.endAt)),
    retry: false,
  });
  const action = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/extensions`, body), { success: 'Booking extended — the renter has been notified', invalidate: invalidateFor(b.id), toastError: false, onSuccess: onClose });
  const submit = () => {
    setErr(null);
    if (!iso || new Date(iso) <= new Date(b.endAt)) return setErr('Choose a return time after the current one.');
    if (new Date(iso).getMinutes() % 30) return setErr('Use a time on the hour or half hour.');
    const body = { endAt: iso, charge, note: note.trim() || undefined };
    if (rental !== '') {
      const p = toPaise(rental);
      if (p === null || p < 0) return setErr('Enter a valid rental amount.');
      body.rentalPaise = p;
    }
    if (charge === 'paid_offline') Object.assign(body, { method, reference: reference.trim() || undefined });
    action.mutate(body, { onError: (e) => setErr(errorMessage(e)) });
  };
  const c = check.data;
  return (
    <Modal
      open={open}
      onClose={() => !action.isPending && onClose()}
      title="Extend booking"
      description={`Currently returns ${dateTime(b.endAt)} IST. The renter's app shows the new time and charge immediately.`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={action.isPending}>Cancel</Button>
          <Button variant="primary" loading={action.isPending} disabled={c && !c.available} onClick={submit}>Extend booking</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New return time (IST)" htmlFor="ext-end">
            <Input id="ext-end" type="datetime-local" step={1800} value={endAt} onChange={(e) => setEndAt(e.target.value)} className="num" />
          </Field>
          <Field label="Rental for the extra time" htmlFor="ext-rental" hint={c ? `Car's rate: ${money(c.pricing.rentalPaise)} for ${c.pricing.hours} h. Leave blank to use it.` : 'Leave blank to use the car’s rates.'}>
            <MoneyInput id="ext-rental" value={rental} onChange={(e) => setRental(e.target.value)} />
          </Field>
        </div>
        {check.isFetching ? <p className="text-caption text-ink-500">Checking availability…</p> : c ? (
          <div className={cn('rounded-md border p-3 text-caption', c.available ? 'border-success-100 bg-success-50 text-success-700' : 'border-danger-100 bg-danger-50 text-danger-700')}>
            {c.available ? 'The car is free for the extra time.' : 'The car is booked or blocked during the extra time.'}
            {c.nextBooking ? <span className="text-ink-600"> Next booking {c.nextBooking.ref} starts {dateTime(c.nextBooking.startAt)}.</span> : null}
          </div>
        ) : check.error ? <p className="text-caption font-semibold text-danger-600">{errorMessage(check.error)}</p> : null}
        <Field label="Charge" htmlFor="ext-charge">
          <Select id="ext-charge" value={charge} onChange={(e) => setCharge(e.target.value)}>
            <option value="collect_in_app">Renter pays in the app</option>
            <option value="paid_offline">Paid at the office</option>
            <option value="waive">Waive (no charge)</option>
          </Select>
        </Field>
        {charge === 'paid_offline' ? <OfficeMethodFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} idPrefix="ext" /> : null}
        <Field label="Note" htmlFor="ext-note" hint="For the audit log.">
          <Textarea id="ext-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
        </Field>
        {err ? <p className="text-caption font-semibold text-danger-600" role="alert">{err}</p> : null}
      </div>
    </Modal>
  );
}

function ExtensionRequest({ b, e }) {
  const [confirm, setConfirm] = useState(null);
  const check = useQuery({ queryKey: ['extension-check', b.id, e.requestedEndAt], queryFn: () => api.get(`${ADMIN}/bookings/${b.id}/extension-check`, { endAt: e.requestedEndAt }), retry: false });
  const decide = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/extensions/${e.id}/decision`, body), { success: (_d, v) => (v.decision === 'approve' ? 'Extension approved — renter notified' : 'Extension rejected — renter notified'), invalidate: invalidateFor(b.id), toastError: false });
  const free = check.data?.available;
  return (
    <div className="rounded-md border border-warning-100 bg-warning-50 p-4">
      <p className="text-label text-ink-900">Renter asks to return {dateTime(e.requestedEndAt)} instead of {dateTime(e.previousEndAt)}</p>
      <p className="mt-0.5 text-caption text-ink-600">
        {e.pricing?.hours} h extra · {money(e.pricing?.totalPaise)} incl. GST · requested {dateTime(e.requestedAt)}
      </p>
      <p className={cn('mt-1 text-caption font-semibold', check.isLoading ? 'text-ink-500' : free ? 'text-success-700' : 'text-danger-700')}>
        {check.isLoading ? 'Checking availability…' : free ? 'Car is free for this time.' : 'Car is NOT free for this time.'}
        {check.data?.nextBooking ? <span className="font-normal text-ink-600"> Next booking starts {dateTime(check.data.nextBooking.startAt)}.</span> : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="success" size="sm" icon={Check} disabled={!free} onClick={() => setConfirm('approve')}>Approve</Button>
        <Button variant="danger-outline" size="sm" icon={X} onClick={() => setConfirm('reject')}>Reject…</Button>
      </div>
      <ConfirmDialog open={confirm === 'approve'} onClose={() => setConfirm(null)} title="Approve this extension?" description={`The return moves to ${dateTime(e.requestedEndAt)} and ${money(e.pricing?.totalPaise)} becomes due in the renter's app.`} confirmLabel="Approve" onConfirm={() => decide.mutateAsync({ decision: 'approve' })} />
      <ConfirmDialog open={confirm === 'reject'} onClose={() => setConfirm(null)} title="Reject this extension?" description="The held time is released and the renter must return on time." confirmLabel="Reject" tone="danger" reason={{ label: 'Reason (shared with the renter)', minLength: 5 }} onConfirm={(reason) => decide.mutateAsync({ decision: 'reject', reason })} />
    </div>
  );
}

/** Extension requests, history and the "extend directly" action. */
export function ExtensionsPanel({ b, MiniTable }) {
  const { can } = useAuth();
  const [extending, setExtending] = useState(false);
  const [due, setDue] = useState(null);
  const exts = b.extensions || [];
  const pending = exts.filter((e) => e.status === 'pending_approval');
  const canExtend = can('bookings.manage') && ['confirmed', 'ongoing'].includes(b.status) && !pending.length;
  if (!exts.length && !canExtend) return null;
  return (
    <Panel
      title="Extensions"
      flush
      actions={canExtend ? <Button size="sm" icon={CalendarPlus} onClick={() => setExtending(true)}>Extend booking…</Button> : null}
    >
      {pending.length && can('bookings.manage') ? <div className="space-y-3 border-b border-line px-5 py-4">{pending.map((e) => <ExtensionRequest key={e.id} b={b} e={e} />)}</div> : null}
      <MiniTable
        rows={exts}
        empty="No extensions. Renters can request one up to the configured hours before their return time."
        columns={[
          { key: 'from', header: 'From → to', cell: (e) => <span className="whitespace-nowrap">{dateTime(e.previousEndAt)} → {dateTime(e.requestedEndAt)}</span> },
          { key: 'hours', header: 'Hours', cell: (e) => e.pricing?.hours },
          { key: 'status', header: 'Status', cell: (e) => <div><StatusPill map={EXTENSION_STATUS} value={e.status} />{e.reason ? <p className="mt-1 max-w-[220px] text-caption text-ink-500">{e.reason}</p> : null}</div> },
          {
            key: 'charge',
            header: 'Charge',
            cell: (e) => (e.chargeStatus ? (
              <div className="space-y-1">
                <StatusPill map={CHARGE_STATUS} value={e.chargeStatus} dot={false} />
                {e.chargeStatus === 'due' && can('bookings.manage') && ['confirmed', 'ongoing'].includes(b.status) ? (
                  <button type="button" className="link block text-caption" onClick={() => setDue({ purpose: 'extension', extensionId: e.id, amountPaise: e.pricing.totalPaise, label: 'Extension charge' })}>Record office payment</button>
                ) : null}
              </div>
            ) : '—'),
          },
          { key: 'amt', header: 'Amount', align: 'right', cell: (e) => money(e.pricing?.totalPaise) },
        ]}
      />
      <ExtendDialog b={b} open={extending} onClose={() => setExtending(false)} />
      <OfficePaymentDialog booking={b} due={due} onClose={() => setDue(null)} />
    </Panel>
  );
}

/** "Mark as returned" for refunds of money collected at the office. */
export function ManualRefundAction({ bookingId, refund }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const action = useAction((reference) => api.post(`${ADMIN}/bookings/${bookingId}/refunds/${refund.id}/manual-processed`, { reference }), { success: 'Refund marked as returned', invalidate: invalidateFor(bookingId), toastError: false });
  if (refund.status !== 'manual' || !can('refunds.manage')) return null;
  return (
    <>
      <button type="button" className="link mt-1 block text-caption" onClick={() => setOpen(true)}>Mark as returned…</button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Returned ${money(refund.amountPaise)} to the renter?`}
        description="This money was collected at the office, so it is returned outside the payment gateway."
        confirmLabel="Mark returned"
        reason={{ label: 'Reference (UTR, UPI ref or receipt no.)', minLength: 3 }}
        onConfirm={(reference) => action.mutateAsync(reference)}
      />
    </>
  );
}

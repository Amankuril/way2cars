import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, PackageCheck, PackageOpen, MessageCircle, Copy, Send, ShieldCheck } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong } from '@shared/lib/format.js';
import { DEPOSIT_TYPE, COLLATERAL_STATUS, DEPOSIT_REFUND_STATUS, MESSAGE_STATUS, OFFICE_METHOD } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { cn, errorMessage, toPaise, istDateInput } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { useToast } from '@/admin/components/Toast.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { Button, IconButton, classes as buttonClasses } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, MoneyInput, Textarea, Checkbox, Select } from '@/admin/components/Form.jsx';
import { RefundDestination } from './adjustOps.jsx';

/**
 * Booking-page panels for the security deposit (money or a bike / laptop handed over), the deposit
 * inspection and refund approval after the trip, and the WhatsApp booking confirmation.
 */

const collateralText = (c) => (c ? [c.make, c.model, c.year].filter(Boolean).join(' ') : '');

export function DepositPanel({ b }) {
  const { can } = useAuth();
  const [action, setAction] = useState(null);
  const d = b.depositDetail || b.deposit || { type: 'cash' };
  const collateral = d.type !== 'cash';
  const office = d.type === 'cash' && d.payAt === 'office';
  const tracked = collateral || office; // something is handed over at pickup
  const mark = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/collateral`, body), {
    success: (_d, body) => `${office ? 'Deposit' : DEPOSIT_TYPE[d.type]} marked ${body.action}`, invalidate: [['booking', b.id], ['bookings']], toastError: false,
  });
  const st = b.settlement;
  const canReceive = tracked && d.status === 'awaiting' && ['confirmed', 'ongoing'].includes(b.status);
  // After a trip, an office deposit goes back through the deposit inspection (charges deducted first).
  const canReturn = tracked && d.status === 'received' && (office ? ['cancelled', 'rejected'] : ['return_pending', 'completed', 'cancelled', 'rejected']).includes(b.status);
  const officeAmount = b.pricing?.depositAtPickupPaise || 0;
  return (
    <Panel title="Security deposit" actions={tracked && !(office && st?.depositRefundStatus) ? <StatusPill map={office ? OFFICE_DEPOSIT_STATUS : COLLATERAL_STATUS} value={d.status} /> : st?.depositRefundStatus ? <StatusPill map={DEPOSIT_REFUND_STATUS} value={st.depositRefundStatus} /> : null}>
      <KeyValue columns={1} items={[
        ['Type', office ? 'Money deposit · pay at office' : DEPOSIT_TYPE[d.type] || 'Money deposit'],
        collateral ? ['Item', collateralText(d.collateral)] : ['Amount', money(office ? officeAmount : b.pricing?.depositPaise || 0)],
        office && d.method ? ['Paid by', OFFICE_METHOD[d.method] || d.method] : null,
        collateral && d.collateral?.registrationNumber ? ['Registration no.', <span className="num">{d.collateral.registrationNumber}</span>] : null,
        collateral && d.collateral?.serialNumber ? ['Serial no.', <span className="num">{d.collateral.serialNumber}</span>] : null,
        d.receivedAt ? ['Received', `${dateTime(d.receivedAt)}${d.receivedBy?.realm ? ` · by ${d.receivedBy.realm === 'vendor' ? 'host' : 'operations'}` : ''}`] : null,
        d.returnedAt ? ['Returned', dateTime(d.returnedAt)] : null,
        d.note ? ['Note', d.note] : null,
        !collateral && st?.depositRefundAt ? [st.depositRefundStatus === 'refunded' ? 'Refunded on' : 'Refund date', `${dateLong(st.depositRefundAt)}${st.depositRefundTo ? ` · ${REFUND_TO[st.depositRefundTo]}` : ''}`] : null,
      ]} />
      {can('trips.manage') && (canReceive || canReturn) ? (
        <div className="mt-4">
          {canReceive ? <Button size="sm" variant="primary" icon={PackageCheck} onClick={() => setAction('received')}>{office ? `Mark ${money(officeAmount)} received` : `Mark ${d.type} received`}</Button> : null}
          {canReturn ? <Button size="sm" icon={PackageOpen} onClick={() => setAction('returned')}>{office ? 'Mark deposit handed back' : `Mark ${d.type} returned`}</Button> : null}
          <p className="mt-2 text-caption text-ink-500">{canReceive ? `The renter cannot start the trip until the ${office ? 'deposit' : 'item'} is received.` : office ? 'The booking was called off: give the deposit back in full.' : 'Return it once the car has been handed back.'}</p>
        </div>
      ) : null}
      {office ? (
        <OfficeDepositDialog open={Boolean(action)} action={action} amount={officeAmount} onClose={() => setAction(null)} onConfirm={(body) => mark.mutateAsync({ action, ...body })} />
      ) : null}
      <ConfirmDialog
        open={Boolean(action) && !office}
        onClose={() => setAction(null)}
        title={action === 'received' ? `Received the ${d.type}?` : `Returned the ${d.type}?`}
        description={action === 'received' ? `Check it matches: ${collateralText(d.collateral)}${d.collateral?.registrationNumber ? ` (${d.collateral.registrationNumber})` : ''}${d.collateral?.serialNumber ? ` (S/N ${d.collateral.serialNumber})` : ''}.` : 'The renter is notified that their item was returned.'}
        confirmLabel={action === 'received' ? 'Mark received' : 'Mark returned'}
        reason={{ label: 'Note (condition, documents taken…)', required: false }}
        onConfirm={(note) => mark.mutateAsync({ action, ...(note ? { note } : {}) })}
      />
    </Panel>
  );
}

/** Records the deposit paid at the office at pickup (with how it was paid), or handed back after a cancellation. */
function OfficeDepositDialog({ open, action, amount, onClose, onConfirm }) {
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ ...(action === 'received' ? { method } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      setNote('');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={action === 'received' ? `Received ${money(amount)} deposit?` : `Handed back ${money(amount)}?`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{action === 'received' ? 'Mark received' : 'Mark handed back'}</Button></>}>
      <div className="space-y-3">
        <p className="text-body text-ink-700">{action === 'received' ? 'Collect the full amount before handing over the keys. The renter can start the trip once you confirm.' : 'Give the full deposit back; the booking was called off before the trip.'}</p>
        {action === 'received' ? (
          <Field label="Paid by" htmlFor="od-method">
            <Select id="od-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['cash', 'upi', 'card', 'bank_transfer'].map((m) => <option key={m} value={m}>{OFFICE_METHOD[m]}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Note (receipt no., UPI ref…)" htmlFor="od-note"><Input id="od-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error ? <p className="text-caption font-semibold text-danger-600" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}

const OFFICE_DEPOSIT_STATUS = {
  awaiting: { label: 'To collect at pickup', tone: 'warning' },
  received: { label: 'Received', tone: 'info' },
  returned: { label: 'Handed back', tone: 'success' },
};
const REFUND_TO = { source: 'original payment method', wallet: 'WAY2CARS wallet', counter: 'handed back at the office' };

/** After the trip settles: inspect the car, add charges, and approve the refund for a date. */
export function DepositReviewPanel({ b }) {
  const { can } = useAuth();
  const st = b.settlement;
  const dd = b.depositDetail || b.deposit || {};
  const collateral = dd.type && dd.type !== 'cash';
  const office = dd.type === 'cash' && dd.payAt === 'office';
  const open = st && b.status === 'completed' && (['pending_review', 'scheduled'].includes(st.depositRefundStatus) || (collateral && !st.depositReview?.at));
  const prevExtra = (st?.extraCharges || []).reduce((t, c) => t + c.amountPaise, 0);
  const [rows, setRows] = useState(() => (st?.extraCharges || []).map((c) => ({ label: c.label, amount: String(c.amountPaise / 100), note: c.note || '' })));
  const [refundNow, setRefundNow] = useState(false);
  const [refundTo, setRefundTo] = useState(st?.depositRefundTo || (office ? 'counter' : 'source'));
  const [date, setDate] = useState(() => istDateInput(new Date(Date.now() + (b.depositDefaultRefundDays ?? 7) * 86400000)));
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const review = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/deposit-review`, body), { success: 'Deposit review saved', invalidate: [['booking', b.id], ['bookings']], toastError: false });
  if (!open || !can('trips.manage')) return null;

  const deposit = office ? (['received', 'returned'].includes(dd.status) ? b.pricing?.depositAtPickupPaise || 0 : 0) : b.pricing?.depositPaise || 0;
  const now = refundNow || (office && refundTo === 'counter'); // counter refunds happen right away
  const baseDeductions = (st.totalDeductionsPaise || 0) - prevExtra;
  const parsed = rows.map((r) => ({ label: r.label.trim(), amountPaise: toPaise(r.amount), note: r.note.trim() }));
  const extra = parsed.reduce((t, r) => t + (r.amountPaise || 0), 0);
  const refund = Math.max(0, deposit - baseDeductions - extra);
  const dues = Math.max(0, baseDeductions + extra - deposit);
  const lateHourly = b.lateFeePerHourPaise || 0;
  const setRow = (i, patch) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addLate = () => {
    const hours = Number(window.prompt('How many hours late was the car handed over (beyond what was already charged)?', '1'));
    if (hours > 0) setRows((x) => [...x, { label: `Late handover (${hours} h)`, amount: String((hours * lateHourly) / 100), note: `${hours} h × ${money(lateHourly)}/h` }]);
  };
  const submit = () => {
    setError(null);
    for (const r of parsed) {
      if (r.label.length < 2) return setError('Name every charge (or remove the empty row).');
      if (!r.amountPaise || r.amountPaise < 100) return setError('Each charge must be at least ₹1.');
    }
    if (!now && !date) return setError('Choose the refund date.');
    return setConfirm(true);
  };
  return (
    <Panel title={collateral ? 'Return inspection' : 'Deposit inspection & refund'} description={collateral ? 'Add any charges found when the car was inspected. They become dues the renter pays in the app or at the office.' : 'Inspect the returned car, add any charges, then approve the refund and choose when it is sent.'}
      actions={<StatusPill map={DEPOSIT_REFUND_STATUS} value={st.depositRefundStatus} />}>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-label text-ink-800">Extra charges</p>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1fr_1.4fr_36px] items-start gap-2">
              <Input aria-label={`Charge ${i + 1}`} placeholder="e.g. Interior cleaning" value={r.label} maxLength={60} onChange={(e) => setRow(i, { label: e.target.value })} />
              <MoneyInput aria-label={`Charge ${i + 1} amount`} value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} />
              <Input aria-label={`Charge ${i + 1} note`} placeholder="Note (optional)" value={r.note} maxLength={200} onChange={(e) => setRow(i, { note: e.target.value })} />
              <IconButton icon={Trash2} label={`Remove charge ${i + 1}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Plus} disabled={rows.length >= 10} onClick={() => setRows((x) => [...x, { label: '', amount: '', note: '' }])}>Add charge</Button>
            {lateHourly ? <Button size="sm" variant="ghost" disabled={rows.length >= 10} onClick={addLate}>+ Late handover ({money(lateHourly)}/h)</Button> : null}
          </div>
          <p className="text-caption text-ink-500">Late return beyond the grace period, extra km, fuel and approved damage were already calculated at settlement. Extra charges stay with WAY2CARS.</p>
        </div>
        <AmountRows rows={[
          collateral ? null : { label: 'Deposit held', value: money(deposit) },
          { label: 'Charges at settlement', value: money(baseDeductions) },
          { label: 'Extra charges', value: money(extra) },
          collateral ? null : { label: 'Refund to renter', value: money(refund), strong: true, tone: 'success' },
          dues ? { label: 'Renter must pay', value: money(dues), tone: 'danger', strong: true } : null,
        ]} />
        {office && refund > 0 ? <OfficeRefundDestination value={refundTo} onChange={setRefundTo} /> : null}
        {!collateral && refund > 0 && !(office && refundTo === 'counter') ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label="Refund now" description="Send the refund as soon as you approve." checked={refundNow} onChange={(e) => setRefundNow(e.target.checked)} />
            {!refundNow ? <Field label="Refund on" htmlFor="dr-date" hint="The refund is sent automatically on this date."><Input id="dr-date" type="date" min={istDateInput(new Date())} value={date} onChange={(e) => setDate(e.target.value)} className="num" /></Field> : null}
          </div>
        ) : null}
        {!collateral && !office && refund > 0 ? <RefundDestination value={refundTo} onChange={setRefundTo} offline={b.source === 'offline'} /> : null}
        <Field label="Inspection note" htmlFor="dr-note"><Textarea id="dr-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Minor scratch on rear bumper — existing; interior needed cleaning" /></Field>
        {error ? <p className="text-caption font-semibold text-danger-600" role="alert">{error}</p> : null}
        <Button variant="primary" icon={ShieldCheck} onClick={submit}>{collateral ? 'Save inspection' : refund > 0 ? (office && refundTo === 'counter' ? `Hand back ${money(refund)} at the counter` : now ? `Approve refund of ${money(refund)} now` : 'Approve and schedule refund') : 'Save inspection'}</Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={collateral ? 'Save the inspection?' : refund > 0 ? (office && refundTo === 'counter' ? `Have you handed ${money(refund)} back to the renter?` : `Refund ${money(refund)} ${now ? 'now' : `on ${date}`}?`) : 'No refund is left — save the inspection?'}
        description={dues ? `The renter will owe ${money(dues)}; they are notified and can pay in the app.` : 'The renter is notified with the charges and the refund date.'}
        confirmLabel="Confirm"
        onConfirm={async () => {
          try {
            await review.mutateAsync({ extraCharges: parsed.map((r) => ({ label: r.label, amountPaise: r.amountPaise, ...(r.note ? { note: r.note } : {}) })), ...(now || collateral ? {} : { refundAt: new Date(`${date}T10:00:00+05:30`).toISOString() }), ...(note.trim() ? { note: note.trim() } : {}), refundTo });
          } catch (e) {
            setError(errorMessage(e));
            throw e;
          }
        }}
      />
    </Panel>
  );
}

/** Where a deposit paid at the office goes back: by hand at the counter, or to the wallet. */
function OfficeRefundDestination({ value, onChange }) {
  const opts = [
    { v: 'counter', title: 'Hand back at the counter', sub: 'Cash / UPI given back now by staff' },
    { v: 'wallet', title: 'WAY2CARS wallet', sub: 'Credited on the refund date; usable on the next booking' },
  ];
  return (
    <fieldset>
      <legend className="mb-1.5 text-label text-ink-800">Refund to <span className="font-normal text-ink-500">(deposit was paid at the office)</span></legend>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
            className={cn('rounded-md border p-3 text-left', value === o.v ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-ink-50')}>
            <span className="block text-label text-ink-900">{o.title}</span>
            <span className="block text-caption text-ink-500">{o.sub}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Booking confirmation on WhatsApp: send log, the message itself, click-to-send and resend. */
export function ConfirmationPanel({ b }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirmed = ['confirmed', 'ongoing', 'return_pending', 'completed'].includes(b.status);
  const [show, setShow] = useState(false);
  const preview = useQuery({ queryKey: ['booking', b.id, 'confirmation'], queryFn: () => api.get(`${ADMIN}/bookings/${b.id}/confirmation-message`), enabled: confirmed && show });
  const resend = useAction(() => api.post(`${ADMIN}/bookings/${b.id}/confirmation-message`), {
    success: (d) => (d.results?.some((r) => r.status === 'sent') ? 'Confirmation sent' : 'No provider is configured — use “Open in WhatsApp”'), invalidate: [['booking', b.id]],
  });
  if (!confirmed) return null;
  const log = b.messages || [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview.data?.text || '');
      toast.success('Message copied');
    } catch {
      toast.error('Could not copy — select the text instead');
    }
  };
  return (
    <Panel title="Booking confirmation" description="Booking details and trip rules sent to the renter on WhatsApp and SMS."
      actions={<Button size="sm" variant="ghost" onClick={() => setShow((x) => !x)}>{show ? 'Hide message' : 'Show message'}</Button>}>
      <div className="space-y-3">
        {log.length ? (
          <ul className="space-y-1.5">
            {log.slice(-6).reverse().map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-caption text-ink-700">
                <span className="font-semibold uppercase">{m.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</span>
                <StatusPill map={MESSAGE_STATUS} value={m.status} dot={false} />
                <span className="text-ink-500">{dateTime(m.at)}</span>
                {m.error ? <span className="text-danger-600">{m.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-caption text-ink-500">Nothing sent yet.</p>}
        {show ? (
          preview.data ? (
            <pre className={cn('max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-ink-50 p-3 font-sans text-caption text-ink-800')}>{preview.data.text}</pre>
          ) : <p className="text-caption text-ink-500">{preview.error ? errorMessage(preview.error) : 'Loading…'}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {preview.data?.whatsappUrl || !show ? (
            <a href={preview.data?.whatsappUrl || '#'} onClick={(e) => { if (!preview.data?.whatsappUrl) { e.preventDefault(); setShow(true); } }} target="_blank" rel="noreferrer" className={buttonClasses({ size: 'sm' })}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Open in WhatsApp
            </a>
          ) : null}
          {show && preview.data ? <Button size="sm" icon={Copy} onClick={copy}>Copy message</Button> : null}
          {can('bookings.manage') ? <Button size="sm" icon={Send} loading={resend.isPending} onClick={() => resend.mutate()}>Resend automatically</Button> : null}
        </div>
      </div>
    </Panel>
  );
}

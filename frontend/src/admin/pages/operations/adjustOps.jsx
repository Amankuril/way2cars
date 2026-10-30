import { useState } from 'react';
import { Link } from 'react-router';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime } from '@shared/lib/format.js';
import { REALM_LABEL } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { cn, errorMessage, toPaise } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { Panel, AmountRows } from '@/admin/components/Panel.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, MoneyInput, Textarea } from '@/admin/components/Form.jsx';

/**
 * Payment adjustments (reduce what the renter pays, with a reason) and the choice of where a refund
 * goes: back to the original payment, or into the renter's WAY2CARS wallet for their next booking.
 */

const invalidate = (id) => [['booking', id], ['bookings'], ['dashboard'], ['settlements'], ['wallet-transactions']];

/** Two-option radio: refund to the original payment method or to the WAY2CARS wallet. */
export function RefundDestination({ value, onChange, offline }) {
  const opts = [
    { v: 'source', title: offline ? 'Return the money' : 'Original payment method', sub: offline ? 'Collected at the office — finance returns it by hand' : 'Card / UPI / bank, 5–7 working days' },
    { v: 'wallet', title: 'WAY2CARS wallet', sub: 'Credited instantly; usable on the next booking' },
  ];
  return (
    <fieldset>
      <legend className="mb-1.5 text-label text-ink-800">Refund to</legend>
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

/** What an adjustment would do right now: lower the balance, lower dues, then refund the rest. */
function preview(b, amount) {
  let rest = amount || 0;
  const balance = b.balance?.status === 'due' ? Math.min(rest, b.balance.duePaise) : 0;
  rest -= balance;
  const dues = b.settlement?.outstandingStatus === 'due' ? Math.min(rest, b.settlement.outstandingPaise) : 0;
  rest -= dues;
  return { balance, dues, refund: rest };
}

export function AdjustAmountDialog({ b, open, onClose }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [to, setTo] = useState('wallet');
  const [errors, setErrors] = useState({});
  const save = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/adjustments`, body), {
    success: (_d, body) => `Booking reduced by ${money(body.amountPaise)}`, invalidate: invalidate(b.id), toastError: false,
    onSuccess: () => { setAmount(''); setReason(''); onClose(); },
  });
  const paise = toPaise(amount);
  const pv = preview(b, paise);
  const submit = () => {
    const next = {};
    if (!paise || paise < 100) next.amount = 'Enter at least ₹1.';
    if (reason.trim().length < 5) next.reason = 'A reason is required (at least 5 characters). It is shown to the renter and on the booking.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ amountPaise: paise, reason: reason.trim(), refundTo: to }, { onError: (e) => setErrors({ form: errorMessage(e) }) });
  };
  return (
    <Modal open={open} onClose={() => !save.isPending && onClose()} title="Adjust the amount payable"
      description="Reduce what the renter pays, e.g. for a breakdown or vehicle issue caused by WAY2CARS. Any balance or dues are lowered first; the rest is refunded. Host / investor earnings are not reduced."
      footer={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Apply adjustment</Button></>}>
      <div className="space-y-4">
        <Field label="Reduce by" htmlFor="adj-amt" required error={errors.amount}><MoneyInput id="adj-amt" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(errors.amount)} data-autofocus /></Field>
        <Field label="Reason" htmlFor="adj-reason" required error={errors.reason}>
          <Textarea id="adj-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} invalid={Boolean(errors.reason)} placeholder="e.g. Car broke down for 4 hours on day 2 — engine fault" />
        </Field>
        {paise ? (
          <AmountRows rows={[
            pv.balance ? { label: 'Balance to collect lowered by', value: money(pv.balance) } : null,
            pv.dues ? { label: 'Trip dues lowered by', value: money(pv.dues) } : null,
            pv.refund ? { label: 'Refunded to the renter', value: money(pv.refund), strong: true, tone: 'success' } : null,
          ]} />
        ) : null}
        {pv.refund > 0 ? <RefundDestination value={to} onChange={setTo} offline={b.source === 'offline'} /> : null}
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

/** Every adjustment on the booking: amount, reason, who, and where the money went. */
export function AdjustmentsPanel({ b }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const adjustable = ['pending_vendor_approval', 'confirmed', 'ongoing', 'return_pending', 'completed'].includes(b.status);
  if (!b.adjustments?.length && !(adjustable && can('refunds.manage'))) return null;
  return (
    <Panel title="Payment adjustments" description={b.pricing?.adjustmentPaise ? `Total reduced: ${money(b.pricing.adjustmentPaise)}` : 'Reduce the amount payable, with a reason.'}
      actions={adjustable && can('refunds.manage') ? <Button size="sm" onClick={() => setOpen(true)}>Adjust amount…</Button> : null}>
      {b.adjustments?.length ? (
        <ul className="divide-y divide-line">
          {b.adjustments.map((a, i) => (
            <li key={i} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="num font-semibold text-ink-900">−{money(a.amountPaise)}</span>
                <span className="text-caption text-ink-500">{dateTime(a.at)}{a.by?.realm ? ` · ${REALM_LABEL[a.by.realm] || a.by.realm}` : ''}</span>
              </div>
              <p className="text-bodySm text-ink-800">{a.reason}</p>
              <p className="text-caption text-ink-500">
                {[a.balancePaise ? `balance −${money(a.balancePaise)}` : null, a.outstandingPaise ? `dues −${money(a.outstandingPaise)}` : null, a.refundPaise ? `refund ${money(a.refundPaise)} to ${a.refundTo === 'wallet' ? 'WAY2CARS wallet' : 'original payment'}` : null].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      ) : <p className="text-bodySm text-ink-500">No adjustments yet.</p>}
      {b.userId ? <p className="mt-3 text-caption text-ink-500">Wallet credits also appear in the renter’s <Link to={`/users/${b.userId}`} className="link">wallet history</Link>.</p> : null}
      <AdjustAmountDialog b={b} open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

/** For a refund still waiting (to return by hand) or failed at the gateway: credit it to the wallet instead. */
export function RefundToWalletAction({ bookingId, refund }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const action = useAction(() => api.post(`${ADMIN}/bookings/${bookingId}/refunds/${refund.id}/to-wallet`), { success: 'Refund credited to the WAY2CARS wallet', invalidate: invalidate(bookingId), toastError: false });
  if (!['manual', 'failed'].includes(refund.status) || !can('refunds.manage')) return null;
  return (
    <>
      <button type="button" className="link mt-1 block text-caption" onClick={() => setOpen(true)}>Credit to wallet instead…</button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title={`Credit ${money(refund.amountPaise)} to the renter’s wallet?`}
        description="The renter can use it on their next booking. It is recorded in the wallet history and this refund is closed." confirmLabel="Credit wallet"
        onConfirm={() => action.mutateAsync()} />
    </>
  );
}

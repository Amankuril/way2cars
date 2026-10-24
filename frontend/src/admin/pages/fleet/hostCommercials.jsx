import { useEffect, useState } from 'react';
import { Eye, Percent, Send } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money } from '@shared/lib/format.js';
import { useAction } from '@/admin/lib/hooks.js';
import { toPaise, toRupeesInput, errorMessage } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { useToast } from '@/admin/components/Toast.jsx';
import { Panel } from '@/admin/components/Panel.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, MoneyInput, PercentInput, Select, Textarea } from '@/admin/components/Form.jsx';
import { DocumentUpload } from '@/admin/components/FileUpload.jsx';

/** Per-host money split, what the host may see, bank details entered by admins, and direct settlement. */

const VISIBILITY = [
  ['renterName', 'Renter name'],
  ['renterPhone', 'Renter phone number'],
  ['renterKycStatus', 'Renter verification status'],
  ['bookingAmounts', 'Booking amounts'],
  ['paymentStatus', 'Payment status'],
];

export function CommissionPanel({ v, invalidate }) {
  const { can } = useAuth();
  const [value, setValue] = useState('');
  const [err, setErr] = useState(null);
  useEffect(() => setValue(v.commissionBps === null || v.commissionBps === undefined ? '' : String(v.commissionBps / 100)), [v.commissionBps]);
  const save = useAction((commissionBps) => api.patch(`${ADMIN}/vendors/${v.id}/commission`, { commissionBps }), { success: 'Commission updated — applies to new bookings', invalidate, toastError: false });
  const submit = (reset) => {
    setErr(null);
    if (reset) return save.mutate(null, { onError: (e) => setErr(errorMessage(e)) });
    const n = Number(value);
    if (value === '' || !(n >= 0 && n <= 90)) return setErr('Enter 0–90%.');
    save.mutate(Math.round(n * 100), { onError: (e) => setErr(errorMessage(e)) });
  };
  return (
    <Panel title="Commission" actions={<Percent className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
      <p className="text-bodySm text-ink-800">
        WAY2CARS keeps <span className="font-bold">{(v.effectiveCommissionBps ?? 0) / 100}%</span> of this host’s rentals; the host gets {100 - (v.effectiveCommissionBps ?? 0) / 100}%.
        {v.commissionBps === null || v.commissionBps === undefined ? <span className="text-ink-500"> (platform default)</span> : null}
      </p>
      {can('payouts.manage') ? (
        <div className="mt-4 space-y-2">
          <Field label="Host-specific commission" htmlFor="host-comm" hint="Leave as the default unless agreed with the host. Existing bookings keep the rate they were made at." error={err}>
            <PercentInput id="host-comm" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Default" invalid={Boolean(err)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={save.isPending} onClick={() => submit(false)}>Save</Button>
            {v.commissionBps !== null && v.commissionBps !== undefined ? <Button size="sm" onClick={() => submit(true)} disabled={save.isPending}>Use platform default</Button> : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export function VisibilityPanel({ v, invalidate }) {
  const { can } = useAuth();
  const save = useAction((body) => api.patch(`${ADMIN}/vendors/${v.id}/visibility`, body), { success: 'Host visibility updated', invalidate });
  const eff = v.effectiveHostVisibility || {};
  const own = v.hostVisibility || {};
  return (
    <Panel title="What this host can see" description="In the host app. “Default” follows Settings → What hosts can see.">
      <ul className="space-y-3">
        {VISIBILITY.map(([key, label]) => {
          const current = own[key] === true ? 'show' : own[key] === false ? 'hide' : 'default';
          return (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="text-bodySm text-ink-800">
                {label}
                <span className={`block text-caption font-semibold ${eff[key] ? 'text-success-700' : 'text-ink-500'}`}>{eff[key] ? 'Shown' : 'Hidden'}</span>
              </span>
              {can('vendors.manage') ? (
                <Select
                  aria-label={label}
                  value={current}
                  className="w-44"
                  disabled={save.isPending}
                  onChange={(e) => save.mutate({ [key]: e.target.value === 'default' ? null : e.target.value === 'show' })}
                >
                  <option value="default">Platform default</option>
                  <option value="show">Show</option>
                  <option value="hide">Hide</option>
                </Select>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const blankBank = { accountHolderName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', bankName: '', upiId: '', proof: null };

/** Admin enters or replaces a host's bank account (recorded as verified). */
export function BankFormDialog({ v, open, onClose, invalidate }) {
  const [f, setF] = useState(blankBank);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  useEffect(() => {
    if (open) {
      setF({ ...blankBank, accountHolderName: v.bank?.accountHolderName || v.name || '' });
      setErrors({});
      setFormError(null);
    }
  }, [open, v.bank?.accountHolderName, v.name]);
  const save = useAction((body) => api.put(`${ADMIN}/vendors/${v.id}/bank`, body), { success: 'Bank account saved and verified', invalidate, toastError: false, onSuccess: onClose });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = () => {
    const e = {};
    if (f.accountHolderName.trim().length < 2) e.accountHolderName = 'Enter the account holder’s name.';
    if (!/^\d{9,18}$/.test(f.accountNumber)) e.accountNumber = '9–18 digits.';
    if (f.confirmAccountNumber !== f.accountNumber) e.confirmAccountNumber = 'Account numbers do not match.';
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.trim().toUpperCase())) e.ifsc = 'Enter a valid IFSC, e.g. HDFC0001234.';
    if (f.upiId && !/^[\w.-]{2,64}@[a-zA-Z]{2,64}$/.test(f.upiId.trim())) e.upiId = 'Enter a valid UPI ID.';
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate({
      accountHolderName: f.accountHolderName.trim(), accountNumber: f.accountNumber, confirmAccountNumber: f.confirmAccountNumber,
      ifsc: f.ifsc.trim().toUpperCase(), bankName: f.bankName.trim() || undefined, upiId: f.upiId.trim() || undefined, proofFileId: f.proof?.id,
    }, { onError: (err) => setFormError(errorMessage(err)) });
  };
  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title={v.bank ? 'Replace bank account' : 'Add bank account'}
      description="Earnings are settled to this account. Check the details against a cancelled cheque or passbook."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>Save and verify</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account holder name" htmlFor="bk-name" required error={errors.accountHolderName} className="sm:col-span-2">
          <Input id="bk-name" value={f.accountHolderName} onChange={set('accountHolderName')} maxLength={120} invalid={Boolean(errors.accountHolderName)} />
        </Field>
        <Field label="Account number" htmlFor="bk-acc" required error={errors.accountNumber}>
          <Input id="bk-acc" inputMode="numeric" autoComplete="off" value={f.accountNumber} onChange={set('accountNumber')} className="num" invalid={Boolean(errors.accountNumber)} />
        </Field>
        <Field label="Confirm account number" htmlFor="bk-acc2" required error={errors.confirmAccountNumber}>
          <Input id="bk-acc2" inputMode="numeric" autoComplete="off" value={f.confirmAccountNumber} onChange={set('confirmAccountNumber')} onPaste={(e) => e.preventDefault()} className="num" invalid={Boolean(errors.confirmAccountNumber)} />
        </Field>
        <Field label="IFSC" htmlFor="bk-ifsc" required error={errors.ifsc}>
          <Input id="bk-ifsc" value={f.ifsc} onChange={set('ifsc')} maxLength={11} className="num uppercase" invalid={Boolean(errors.ifsc)} />
        </Field>
        <Field label="Bank name" htmlFor="bk-bank">
          <Input id="bk-bank" value={f.bankName} onChange={set('bankName')} maxLength={100} />
        </Field>
        <Field label="UPI ID" htmlFor="bk-upi" error={errors.upiId}>
          <Input id="bk-upi" value={f.upiId} onChange={set('upiId')} maxLength={100} invalid={Boolean(errors.upiId)} />
        </Field>
        <DocumentUpload id="bk-proof" purpose="bank_proof" label="Cancelled cheque / passbook" value={f.proof} onChange={(proof) => setF((x) => ({ ...x, proof }))} hint="Optional, but recommended." />
        {formError ? <p className="text-caption font-semibold text-danger-600 sm:col-span-2" role="alert">{formError}</p> : null}
      </div>
    </Modal>
  );
}

/** Reveals the full account number (audited) for making the transfer. */
export function RevealBankButton({ vendorId }) {
  const toast = useToast();
  const [shown, setShown] = useState(null);
  const [busy, setBusy] = useState(false);
  const reveal = async () => {
    setBusy(true);
    try {
      setShown(await api.get(`${ADMIN}/vendors/${vendorId}/bank/details`));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  if (shown) return <p className="num rounded-md bg-ink-50 p-2 font-mono text-bodySm text-ink-900">{shown.accountNumber} · {shown.ifsc}</p>;
  return <Button size="sm" variant="ghost" icon={Eye} loading={busy} onClick={reveal}>Show full number</Button>;
}

/** Pays a host's available balance directly against a bank transfer reference. */
export function SettleHostDialog({ v, open, onClose, invalidate }) {
  const available = v.wallet?.availablePaise || 0;
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setAmount(toRupeesInput(available));
      setUtr('');
      setNote('');
      setErr(null);
    }
  }, [open, available]);
  const settle = useAction((body) => api.post(`${ADMIN}/payouts/settle`, body), { success: 'Settlement recorded — host notified', invalidate, toastError: false, onSuccess: onClose });
  const submit = () => {
    setErr(null);
    const p = toPaise(amount);
    if (!p || p < 100 || p > available) return setErr(`Enter between ₹1 and ${money(available)}.`);
    if (!/^[A-Za-z0-9]{8,40}$/.test(utr.trim())) return setErr('Enter the bank UTR / reference (8–40 letters or digits).');
    settle.mutate({ vendorId: v.id, amountPaise: p, utr: utr.trim(), note: note.trim() || undefined }, { onError: (e) => setErr(errorMessage(e)) });
  };
  return (
    <Modal
      open={open}
      onClose={() => !settle.isPending && onClose()}
      title="Settle host earnings"
      description={`Transfer the amount to the host's verified bank account first, then record it here. Available: ${money(available)}.`}
      footer={
        <>
          <Button onClick={onClose} disabled={settle.isPending}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={settle.isPending} onClick={submit}>Record settlement</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount transferred" htmlFor="st-amt"><MoneyInput id="st-amt" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Bank UTR / reference" htmlFor="st-utr"><Input id="st-utr" value={utr} onChange={(e) => setUtr(e.target.value)} maxLength={40} className="num" /></Field>
        </div>
        <Field label="Note" htmlFor="st-note"><Textarea id="st-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} /></Field>
        {err ? <p className="text-caption font-semibold text-danger-600" role="alert">{err}</p> : null}
      </div>
    </Modal>
  );
}


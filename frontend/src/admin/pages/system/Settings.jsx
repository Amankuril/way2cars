import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { useAction } from '@/admin/lib/hooks.js';
import { cn, errorMessage } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Button, IconButton } from '@/admin/components/Button.jsx';
import { Field, Input, MoneyInput, PercentInput, AffixInput, Switch, FormSection, StickySaveBar } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';

/**
 * Every editable setting. unit: rupees (stored as paise), pct (stored as bps), mult (bps, ×10000 = 1×),
 * int (with optional suffix), bool, text. `path` is section.key or a top-level key.
 */
const SECTIONS = [
  {
    key: 'tax', title: 'Tax and invoicing', description: 'Printed on every invoice. GST applies to rental, delivery and convenience fees.',
    fields: [
      { path: 'tax.rentalGstBps', label: 'GST rate', unit: 'pct', min: 0, max: 50 },
      { path: 'tax.sacCode', label: 'SAC code', unit: 'text', pattern: /^\d{6}$/, patternMsg: 'Six digits.' },
      { path: 'tax.gstin', label: 'Company GSTIN', unit: 'text', maxLength: 15, upper: true },
      { path: 'tax.stateCode', label: 'GST state code', unit: 'text', pattern: /^(\d{2})?$/, patternMsg: 'Two digits, or blank.' },
      { path: 'tax.legalName', label: 'Legal name', unit: 'text', maxLength: 150, wide: true },
      { path: 'tax.registeredAddress', label: 'Registered address', unit: 'text', maxLength: 300, wide: true },
    ],
  },
  {
    key: 'fees', title: 'Fees and commission', description: 'Charged to renters per booking; commission is deducted from host earnings.',
    fields: [
      { path: 'commissionBps', label: 'Platform commission', unit: 'pct', min: 0, max: 90, hint: 'Share of the rental kept by WAY2CARS.' },
      { path: 'fees.convenienceFeePaise', label: 'Convenience fee', unit: 'rupees', hint: 'Per booking.' },
      { path: 'fees.deliveryBaseFeePaise', label: 'Doorstep delivery — base fee', unit: 'rupees' },
      { path: 'fees.deliveryPerKmPaise', label: 'Doorstep delivery — per km', unit: 'rupees' },
      { path: 'fees.deliveryMaxKm', label: 'Doorstep delivery — max distance', unit: 'int', suffix: 'km', min: 0, max: 200 },
    ],
  },
  {
    key: 'booking', title: 'Booking rules', description: 'Limits applied when renters search and check out.',
    fields: [
      { path: 'booking.holdMinutes', label: 'Payment hold', unit: 'int', suffix: 'min', min: 5, max: 60, hint: 'How long a car is held while the renter pays.' },
      { path: 'booking.minDurationHours', label: 'Minimum trip', unit: 'int', suffix: 'hrs', min: 1, max: 48 },
      { path: 'booking.maxDurationDays', label: 'Maximum trip', unit: 'int', suffix: 'days', min: 1, max: 180 },
      { path: 'booking.minLeadMinutes', label: 'Minimum notice', unit: 'int', suffix: 'min', min: 0, max: 1440, hint: 'Earliest start after booking.' },
      { path: 'booking.maxAdvanceDays', label: 'Book up to', unit: 'int', suffix: 'days', min: 1, max: 365, hint: 'How far ahead renters can book.' },
      { path: 'booking.bufferMinutes', label: 'Buffer between trips', unit: 'int', suffix: 'min', min: 0, max: 720 },
      { path: 'booking.vendorApprovalSlaMinutes', label: 'Host response time', unit: 'int', suffix: 'min', min: 10, max: 1440, hint: 'Unanswered requests are auto-declined and refunded.' },
      { path: 'booking.pickupWindowMinutesBefore', label: 'Early pickup window', unit: 'int', suffix: 'min', min: 0, max: 240 },
      { path: 'booking.kycRequired', label: 'Require verified KYC to book', unit: 'bool' },
      { path: 'booking.requireUserApproval', label: 'Approve new renter accounts manually', unit: 'bool' },
    ],
  },
  { key: 'cancellation', title: 'Cancellation policy', description: 'Refund of trip charges by how early the renter cancels. The deposit is always refunded.', custom: 'tiers', fields: [{ path: 'cancellation.feePaise', label: 'Cancellation fee', unit: 'rupees', hint: 'Flat fee deducted from any refund.' }] },
  {
    key: 'trip', title: 'Trip charges', description: 'Applied when the car is returned.',
    fields: [
      { path: 'trip.lateGraceMinutes', label: 'Late return grace', unit: 'int', suffix: 'min', min: 0, max: 240 },
      { path: 'trip.lateFeeMultiplierBps', label: 'Late fee multiplier', unit: 'mult', min: 1, max: 5, hint: 'Hourly rate × this for late hours.' },
      { path: 'trip.fuelChargePerEighthPaise', label: 'Fuel charge per ⅛ tank', unit: 'rupees' },
      { path: 'trip.returnReviewHours', label: 'Host return review window', unit: 'int', suffix: 'hrs', min: 1, max: 168 },
      { path: 'trip.minPickupPhotos', label: 'Minimum inspection photos', unit: 'int', min: 1, max: 12 },
    ],
  },
  {
    key: 'payouts', title: 'Host payouts',
    fields: [
      { path: 'payouts.holdDays', label: 'Earnings hold period', unit: 'int', suffix: 'days', min: 0, max: 60, hint: 'Days after trip completion before earnings are withdrawable.' },
      { path: 'payouts.minWithdrawalPaise', label: 'Minimum withdrawal', unit: 'rupees' },
    ],
  },
  {
    key: 'rewards', title: 'Referral, loyalty and wallet',
    fields: [
      { path: 'referral.enabled', label: 'Referral programme', unit: 'bool' },
      { path: 'referral.referrerRewardPaise', label: 'Referrer reward', unit: 'rupees' },
      { path: 'referral.refereeRewardPaise', label: 'New renter reward', unit: 'rupees' },
      { path: 'loyalty.enabled', label: 'Loyalty cashback', unit: 'bool' },
      { path: 'loyalty.earnBps', label: 'Cashback rate', unit: 'pct', min: 0, max: 20, hint: 'Of trip charges, credited after completion.' },
      { path: 'wallet.maxRedeemBps', label: 'Max wallet use per booking', unit: 'pct', min: 0, max: 100 },
    ],
  },
  {
    key: 'support', title: 'Support contacts', description: 'Shown in the apps’ help screens.',
    fields: [
      { path: 'support.phone', label: 'Support phone', unit: 'text', maxLength: 20 },
      { path: 'support.whatsapp', label: 'WhatsApp', unit: 'text', maxLength: 20 },
      { path: 'support.email', label: 'Support email', unit: 'text', maxLength: 200 },
      { path: 'support.hours', label: 'Support hours', unit: 'text', maxLength: 60 },
      { path: 'support.roadsidePhone', label: 'Roadside assistance phone', unit: 'text', maxLength: 20 },
      { path: 'support.emergencyPhone', label: 'Emergency number', unit: 'text', maxLength: 20 },
    ],
  },
];
const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function toDisplay(f, v) {
  if (f.unit === 'bool') return Boolean(v);
  if (v === null || v === undefined) return '';
  if (f.unit === 'rupees' || f.unit === 'pct') return String(v / 100);
  if (f.unit === 'mult') return String(v / 10000);
  return String(v);
}
function fromDisplay(f, v) {
  if (f.unit === 'bool') return v;
  if (f.unit === 'text') return f.upper ? v.trim().toUpperCase() : v.trim();
  const n = Number(v);
  if (f.unit === 'rupees' || f.unit === 'pct') return Math.round(n * 100);
  if (f.unit === 'mult') return Math.round(n * 10000);
  return n;
}
function check(f, v) {
  if (f.unit === 'bool') return null;
  if (f.unit === 'text') return f.pattern && !f.pattern.test(v.trim()) ? f.patternMsg : null;
  if (v === '' || !Number.isFinite(Number(v))) return 'Enter a number.';
  const n = Number(v);
  if (f.unit === 'int' && !Number.isInteger(n)) return 'Whole number.';
  if (n < (f.min ?? 0)) return `At least ${f.min ?? 0}.`;
  if (f.max !== undefined && n > f.max) return `At most ${f.max}.`;
  if (f.unit === 'rupees' && n > 1_000_000) return 'Too large.';
  return null;
}

function Tiers({ tiers, onChange, errors }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-caption font-semibold text-ink-500">
        <span>Cancelled at least</span>
        <span>Refund of trip charges</span>
        <span />
      </div>
      {tiers.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_36px] items-start gap-2">
          <div>
            <label htmlFor={`tier-h-${i}`} className="sr-only">Hours before start, tier {i + 1}</label>
            <AffixInput id={`tier-h-${i}`} suffix="hrs before" value={t.hours} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))} invalid={Boolean(errors?.[i]?.hours)} className="[&_input]:pr-20" />
            {errors?.[i]?.hours ? <p className="mt-1 text-caption font-semibold text-danger-600">{errors[i].hours}</p> : null}
          </div>
          <div>
            <label htmlFor={`tier-r-${i}`} className="sr-only">Refund percentage, tier {i + 1}</label>
            <PercentInput id={`tier-r-${i}`} value={t.refund} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, refund: e.target.value } : x)))} invalid={Boolean(errors?.[i]?.refund)} />
            {errors?.[i]?.refund ? <p className="mt-1 text-caption font-semibold text-danger-600">{errors[i].refund}</p> : null}
          </div>
          <IconButton icon={Trash2} label={`Remove tier ${i + 1}`} disabled={tiers.length <= 1} onClick={() => onChange(tiers.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" icon={Plus} disabled={tiers.length >= 6} onClick={() => onChange([...tiers, { hours: '0', refund: '0' }])}>Add tier</Button>
      <p className="text-caption text-ink-500">The first matching tier (most hours first) applies. Add a 0-hour tier to cover late cancellations.</p>
    </div>
  );
}

export default function Settings() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get(`${ADMIN}/settings`) });
  const [values, setValues] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [formError, setFormError] = useState(null);

  const initial = useMemo(() => {
    if (!data) return null;
    return {
      values: Object.fromEntries(ALL_FIELDS.map((f) => [f.path, toDisplay(f, get(data, f.path))])),
      tiers: (data.cancellation?.tiers || []).map((t) => ({ hours: String(t.minHoursBeforeStart), refund: String(t.refundBps / 100) })),
    };
  }, [data]);
  useEffect(() => {
    if (initial) {
      setValues(initial.values);
      setTiers(initial.tiers);
      setErrors({});
    }
  }, [initial]);

  const save = useAction((body) => api.patch(`${ADMIN}/settings`, body), { success: (d) => `Settings saved (version ${d.version})`, invalidate: [['settings']], toastError: false });

  if (isLoading || (data && !values)) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>;

  const dirty = JSON.stringify({ values, tiers }) !== JSON.stringify(initial);
  const changed = ALL_FIELDS.filter((f) => values[f.path] !== initial.values[f.path]);
  const tiersChanged = JSON.stringify(tiers) !== JSON.stringify(initial.tiers);

  const validate = () => {
    const next = {};
    for (const f of ALL_FIELDS) {
      const e = check(f, values[f.path]);
      if (e) next[f.path] = e;
    }
    const tErr = tiers.map((t) => {
      const e = {};
      const h = Number(t.hours);
      const r = Number(t.refund);
      if (t.hours === '' || !(h >= 0 && h <= 720)) e.hours = '0–720 hours.';
      if (t.refund === '' || !(r >= 0 && r <= 100)) e.refund = '0–100%.';
      return Object.keys(e).length ? e : null;
    });
    if (tErr.some(Boolean)) next.tiers = tErr;
    setErrors(next);
    return !Object.keys(next).length;
  };

  const buildPatch = () => {
    const patch = {};
    for (const f of changed) {
      const parts = f.path.split('.');
      const v = fromDisplay(f, values[f.path]);
      if (parts.length === 1) patch[parts[0]] = v;
      else (patch[parts[0]] ||= {})[parts[1]] = v;
    }
    if (tiersChanged) {
      (patch.cancellation ||= {}).tiers = [...tiers]
        .map((t) => ({ minHoursBeforeStart: Number(t.hours), refundBps: Math.round(Number(t.refund) * 100) }))
        .sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);
    }
    return patch;
  };

  const onSave = () => {
    setFormError(null);
    if (validate()) setConfirm(true);
    else setFormError('Fix the highlighted fields.');
  };

  const setVal = (path, v) => setValues((x) => ({ ...x, [path]: v }));

  const renderField = (f) => {
    const id = `set-${f.path.replace('.', '-')}`;
    const v = values[f.path];
    const err = errors[f.path];
    const mod = v !== initial.values[f.path];
    if (f.unit === 'bool') return <Switch key={f.path} id={id} label={f.label} description={f.hint} checked={v} onChange={(on) => setVal(f.path, on)} className="sm:col-span-2" />;
    const common = { id, value: v, onChange: (e) => setVal(f.path, e.target.value), invalid: Boolean(err) };
    const input =
      f.unit === 'rupees' ? <MoneyInput {...common} />
        : f.unit === 'pct' ? <PercentInput {...common} />
          : f.unit === 'mult' ? <AffixInput {...common} suffix="×" inputMode="decimal" />
            : f.unit === 'int' ? <AffixInput {...common} suffix={f.suffix} inputMode="numeric" />
              : <Input {...common} maxLength={f.maxLength} className={f.upper ? 'uppercase' : undefined} />;
    return (
      <Field key={f.path} label={f.label} htmlFor={id} error={err} hint={f.hint} className={cn(f.wide && 'sm:col-span-2')} aside={mod ? <span className="text-caption font-semibold text-brand-600">Changed</span> : null}>
        {input}
      </Field>
    );
  };

  return (
    <>
      <PageHeader title="Settings" description={`Platform-wide business rules. Version ${data.version}${data.updatedAt ? ` · last changed ${dateTime(data.updatedAt)} IST` : ''}. Every change is audited and applies to new bookings immediately.`} />
      <div className="panel px-5">
        {SECTIONS.map((s) => (
          <FormSection key={s.key} title={s.title} description={s.description}>
            {s.custom === 'tiers' ? <Tiers tiers={tiers} onChange={setTiers} errors={errors.tiers} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">{s.fields.map(renderField)}</div>
          </FormSection>
        ))}
      </div>
      <StickySaveBar dirty={dirty} message={formError ? <span className="font-semibold text-danger-600" role="alert">{formError}</span> : undefined}>
        <Button onClick={() => { setValues(initial.values); setTiers(initial.tiers); setErrors({}); setFormError(null); }} disabled={!dirty || save.isPending}>Discard changes</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty} loading={save.isPending}>Save settings</Button>
      </StickySaveBar>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Apply these settings?"
        description="They take effect immediately for new searches, bookings and settlements."
        confirmLabel="Save settings"
        onConfirm={async () => {
          try {
            await save.mutateAsync(buildPatch());
          } catch (e) {
            setFormError(errorMessage(e));
            throw e;
          }
        }}
      >
        <ul className="max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-caption text-ink-700">
          {changed.map((f) => (
            <li key={f.path}>
              <span className="font-semibold">{f.label}:</span> {String(initial.values[f.path]) || '—'} → {String(values[f.path]) || '—'}
            </li>
          ))}
          {tiersChanged ? <li><span className="font-semibold">Cancellation tiers</span> updated</li> : null}
        </ul>
      </ConfirmDialog>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, duration } from '@shared/lib/format.js';
import { KYC_STATUS, OFFICE_METHOD, OWNERSHIP, DEPOSIT_TYPE } from '@/admin/lib/labels.js';
import { useAction, useDebounced, useDocumentTitle } from '@/admin/lib/hooks.js';
import { cn, toPaise, errorMessage, istDateTimeInput, fromIstDateTime } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { Field, Input, MoneyInput, Select, Textarea, Switch, FormSection, StickySaveBar } from '@/admin/components/Form.jsx';

/**
 * Office (walk-in) booking. The customer is identified by mobile number: an existing account is
 * reused, otherwise one is created so the booking shows in their app when they sign in with it.
 * Uses the same availability check as app bookings, so the two can never double-book a car.
 */

const HALF_HOUR = 30 * 60_000;
const nextHalfHour = (offsetMs = 0) => new Date(Math.ceil((Date.now() + offsetMs) / HALF_HOUR) * HALF_HOUR);
const digits = (v) => v.replace(/\D/g, '').slice(-10);

function CustomerLookup({ phone }) {
  const ten = digits(phone);
  const q = useQuery({
    queryKey: ['office-customer', ten],
    queryFn: () => api.list(`${ADMIN}/users`, { q: ten, limit: 1 }),
    enabled: ten.length === 10,
  });
  if (ten.length !== 10) return <p className="text-caption text-ink-500">Enter the customer’s 10-digit mobile number.</p>;
  if (q.isLoading) return <p className="text-caption text-ink-500">Looking up…</p>;
  const u = q.data?.data?.[0];
  if (!u) return <p className="text-caption text-ink-600">New customer — an account is created with this number. The booking appears in their app when they sign in with it.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption text-ink-700">
      <span>Existing customer: <span className="font-semibold">{u.name || 'No name yet'}</span></span>
      <StatusPill map={KYC_STATUS} value={u.kyc?.status} />
      {u.status !== 'active' ? <StatusPill tone="danger">{u.status}</StatusPill> : null}
    </div>
  );
}

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const timeLabel = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const SEATS = [{ value: '', label: 'All cars' }, { value: '5', label: '5 seater' }, { value: '7', label: '7 seater' }];

/** Cars free for the whole chosen period (from the server), with seat filters and search. */
function AvailableCars({ startAt, endAt, value, onChange }) {
  const [q, setQ] = useState('');
  const [seats, setSeats] = useState('');
  const dq = useDebounced(q);
  const ready = Boolean(startAt && endAt && endAt > startAt);
  const list = useQuery({
    queryKey: ['office-available', startAt, endAt, seats, dq],
    queryFn: () => api.list(`${ADMIN}/bookings/offline/available-cars`, { startAt, endAt, seats: seats || undefined, q: dq || undefined }),
    enabled: ready,
    retry: false,
  });
  const cars = list.data?.data || [];
  const meta = list.data?.meta;
  useEffect(() => {
    if (value && list.data && !cars.some((c) => c.id === value.id)) onChange(null); // chosen car no longer free for the new times
  }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <p className="text-caption text-ink-500">Choose the start and end date &amp; time to see the cars that are free.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Seats">
          {SEATS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={seats === o.value} onClick={() => setSeats(o.value)}
              className={cn('rounded px-3 py-1.5 text-label', seats === o.value ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50')}>{o.label}</button>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search registration or model" aria-label="Search cars" className="min-w-[200px] flex-1" />
      </div>
      <p className="text-caption text-ink-500">
        {list.isFetching ? 'Checking availability…' : list.error ? errorMessage(list.error) : `${meta?.total ?? 0} car${meta?.total === 1 ? '' : 's'} free for this period${meta?.unavailable ? ` · ${meta.unavailable} booked or blocked` : ''}`}
      </p>
      <div className="scroll-thin max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {!list.isLoading && !cars.length ? <p className="p-3 text-caption text-ink-500">No free cars match. Try other times or seats.</p> : cars.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c)}
            className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-50', value?.id === c.id && 'bg-brand-50')}
            aria-pressed={value?.id === c.id}
          >
            {c.photos?.[0] ? <img src={c.photos[0]} alt="" className="h-10 w-14 shrink-0 rounded-sm object-cover" /> : <span className="h-10 w-14 shrink-0 rounded-sm bg-ink-100" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label text-ink-900">{c.title}</span>
              <span className="num block text-caption text-ink-500">{c.registrationNumber} · {c.seats} seats · {c.city?.name} · {money(c.estimate?.rentalPaise)} for {c.estimate?.hours} h</span>
            </span>
            <StatusPill map={OWNERSHIP} value={c.ownership} dot={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OfficeBooking() {
  useDocumentTitle('New office booking');
  const navigate = useNavigate();
  const [f, setF] = useState(() => ({
    phone: '', name: '', car: null,
    startDate: istDateTimeInput(nextHalfHour(HALF_HOUR)).slice(0, 10), startTime: istDateTimeInput(nextHalfHour(HALF_HOUR)).slice(11, 16),
    endDate: istDateTimeInput(nextHalfHour(HALF_HOUR + 24 * 3600_000)).slice(0, 10), endTime: istDateTimeInput(nextHalfHour(HALF_HOUR + 24 * 3600_000)).slice(11, 16),
    rental: '', deposit: '', discount: '', waiveFee: false, priceNote: '',
    payStatus: 'paid', amount: '', method: 'cash', reference: '', balanceDueAt: '', note: '',
    unlimitedKm: false, depositOption: 'cash', cMake: '', cModel: '', cYear: '', cReg: '', cSerial: '', pickupLocationId: '', dropoffLocationId: '',
  }));
  const company = f.car?.ownership === 'company';
  const hubs = useQuery({ queryKey: ['public', 'locations', f.car?.city?.id], queryFn: () => api.get('/api/v1/public/locations', { cityId: f.car.city.id }), enabled: Boolean(company && f.car?.city?.id) });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  // Composed IST "YYYY-MM-DDTHH:mm" values (what the rest of the form and the API helpers use).
  const startAt = f.startDate && f.startTime ? `${f.startDate}T${f.startTime}` : '';
  const endAt = f.endDate && f.endTime ? `${f.endDate}T${f.endTime}` : '';

  const pricing = useMemo(() => {
    const out = {};
    if (f.rental !== '') out.rentalPaise = toPaise(f.rental);
    if (f.deposit !== '') out.depositPaise = toPaise(f.deposit);
    if (f.discount !== '') out.discountPaise = toPaise(f.discount);
    if (f.waiveFee) out.waiveConvenienceFee = true;
    if (Object.keys(out).length && f.priceNote.trim()) out.note = f.priceNote.trim();
    return Object.keys(out).length ? out : undefined;
  }, [f.rental, f.deposit, f.discount, f.waiveFee, f.priceNote]);

  // Debounce a string key (a fresh object every render would never settle).
  const options = { unlimitedKm: f.unlimitedKm || undefined, depositOption: f.depositOption, pickupLocationId: (company && f.pickupLocationId) || undefined, dropoffLocationId: (company && f.dropoffLocationId) || undefined };
  const key = useDebounced(JSON.stringify({ start: fromIstDateTime(startAt), end: fromIstDateTime(endAt), carId: f.car?.id, pricing, options }), 400);
  const win = JSON.parse(key);
  const quote = useQuery({
    queryKey: ['office-quote', key],
    queryFn: () => api.post(`${ADMIN}/bookings/offline/quote`, { vehicleId: win.carId, startAt: win.start, endAt: win.end, pricing: win.pricing, ...win.options }),
    enabled: Boolean(win.carId && win.start && win.end && win.end > win.start),
    retry: false,
  });
  const q = quote.data;
  useEffect(() => {
    setErrors({});
    setF((x) => ({ ...x, unlimitedKm: false, pickupLocationId: '', dropoffLocationId: '' }));
  }, [f.car]);

  const create = useAction((body) => api.post(`${ADMIN}/bookings/offline`, body), {
    success: (d) => `Booking ${d.ref} confirmed`,
    invalidate: [['bookings'], ['dashboard']],
    toastError: false,
    onSuccess: (d) => navigate(`/bookings/${d.id}`),
  });

  const submit = () => {
    const e = {};
    if (digits(f.phone).length !== 10) e.phone = 'Enter a 10-digit mobile number.';
    if (!f.car) e.car = 'Choose a car.';
    if (!startAt || !endAt || endAt <= startAt) e.endAt = 'Return must be after pickup.';

    if (pricing && Object.values(pricing).some((v) => v === null)) e.pricing = 'Check the price fields.';
    let collateral;
    if (f.depositOption !== 'cash') {
      collateral = { make: f.cMake.trim(), model: f.cModel.trim(), year: Number(f.cYear), ...(f.depositOption === 'bike' ? { registrationNumber: f.cReg.trim() } : { serialNumber: f.cSerial.trim() }) };
      if (!collateral.make || !collateral.model || !collateral.year) e.collateral = `Enter the ${f.depositOption}'s make, model and year.`;
      else if (f.depositOption === 'bike' && !collateral.registrationNumber) e.collateral = "Enter the bike's registration number.";
      else if (f.depositOption === 'laptop' && !collateral.serialNumber) e.collateral = "Enter the laptop's serial number.";
    }
    const payment = f.payStatus === 'unpaid' ? { status: 'unpaid' } : { status: f.payStatus, method: f.method, reference: f.reference.trim() || undefined };
    if (f.payStatus === 'partial') {
      payment.amountPaise = toPaise(f.amount);
      if (!payment.amountPaise || (q && payment.amountPaise >= q.payablePaise)) e.amount = `Enter less than the total${q ? ` (${money(q.payablePaise)})` : ''}.`;
    }
    setErrors(e);
    if (Object.keys(e).length) return setFormError('Fix the highlighted fields.');
    if (q && !q.available) return setFormError('The car is not available for these times.');
    setFormError(null);
    create.mutate({
      phone: digits(f.phone), name: f.name.trim() || undefined, vehicleId: f.car.id,
      startAt: fromIstDateTime(startAt), endAt: fromIstDateTime(endAt),
      pricing, payment, ...options, ...(collateral ? { collateral } : {}),
      balanceDueAt: f.payStatus !== 'paid' && f.balanceDueAt ? fromIstDateTime(f.balanceDueAt) : undefined,
      note: f.note.trim() || undefined,
    }, { onError: (err) => setFormError(errorMessage(err)) });
  };

  return (
    <>
      <PageHeader back={{ to: '/bookings', label: 'Bookings' }} title="New office booking" description="For customers booking at the WAY2CARS office. The car is checked against app bookings before confirming." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="panel min-w-0 px-5 lg:col-span-2">
          <FormSection title="Customer" description="Matched to their app account by mobile number.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile number" htmlFor="ob-phone" required error={errors.phone}>
                <Input id="ob-phone" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="98765 43210" className="num" invalid={Boolean(errors.phone)} />
              </Field>
              <Field label="Name" htmlFor="ob-name" hint="Saved if the account has no name yet.">
                <Input id="ob-name" value={f.name} onChange={set('name')} maxLength={100} />
              </Field>
            </div>
            <CustomerLookup phone={f.phone} />
          </FormSection>

          <FormSection title="Schedule" description="Start and end date and time (IST). Times are on the hour or half hour.">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Start date" htmlFor="ob-sdate" required error={errors.startAt}>
                <Input id="ob-sdate" type="date" value={f.startDate} onChange={set('startDate')} className="num" invalid={Boolean(errors.startAt)} />
              </Field>
              <Field label="Start time" htmlFor="ob-stime" required>
                <Select id="ob-stime" value={f.startTime} onChange={set('startTime')}>{TIMES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</Select>
              </Field>
              <Field label="End date" htmlFor="ob-edate" required error={errors.endAt}>
                <Input id="ob-edate" type="date" min={f.startDate} value={f.endDate} onChange={set('endDate')} className="num" invalid={Boolean(errors.endAt)} />
              </Field>
              <Field label="End time" htmlFor="ob-etime" required>
                <Select id="ob-etime" value={f.endTime} onChange={set('endTime')}>{TIMES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}</Select>
              </Field>
            </div>
            {startAt && endAt && endAt > startAt ? <p className="text-caption text-ink-600">{dateTime(fromIstDateTime(startAt))} → {dateTime(fromIstDateTime(endAt))} · {duration(fromIstDateTime(startAt), fromIstDateTime(endAt))}</p> : null}
          </FormSection>

          <FormSection title="Available cars" description="Only cars free for the whole period are listed (existing bookings, the buffer between trips and blocked dates are checked).">
            <Field label="Car" error={errors.car}>
              <AvailableCars startAt={fromIstDateTime(startAt)} endAt={fromIstDateTime(endAt)} value={f.car} onChange={(c) => setF((x) => ({ ...x, car: c }))} />
            </Field>
          </FormSection>

          <FormSection title="Pricing" description="Leave blank to use the car’s own rates. Changes are recorded on the booking.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rental (total)" htmlFor="ob-rental" hint="Blank = the car's rates for these dates">
                <MoneyInput id="ob-rental" value={f.rental} onChange={set('rental')} />
              </Field>
              <Field label="Extra discount" htmlFor="ob-discount">
                <MoneyInput id="ob-discount" value={f.discount} onChange={set('discount')} />
              </Field>
              <Field label="Security deposit" htmlFor="ob-deposit" hint={f.car ? `Car's deposit: ${money(f.car.pricing?.securityDepositPaise)}` : undefined}>
                <MoneyInput id="ob-deposit" value={f.deposit} onChange={set('deposit')} />
              </Field>
            </div>
            <Switch label="Waive convenience fee" checked={f.waiveFee} onChange={(v) => setF((x) => ({ ...x, waiveFee: v }))} />
            {pricing ? (
              <Field label="Reason for the price change" htmlFor="ob-pnote">
                <Input id="ob-pnote" value={f.priceNote} onChange={set('priceNote')} maxLength={200} placeholder="e.g. Corporate rate" />
              </Field>
            ) : null}
            {errors.pricing ? <p className="text-caption font-semibold text-danger-600">{errors.pricing}</p> : null}
          </FormSection>

          <FormSection title="Trip options" description="Unlimited km, the security deposit, and (for WAY2CARS fleet cars) pickup / drop-off points.">
            {f.car?.unlimitedKm ? <Switch label={`Unlimited km (+${money(f.car.unlimitedKm.dailyPaise)}/day)`} description="No extra-km charge at return." checked={f.unlimitedKm} onChange={(v) => setF((x) => ({ ...x, unlimitedKm: v }))} /> : f.car ? <p className="text-caption text-ink-500">This car does not offer unlimited km.</p> : null}
            <Field label="Security deposit" htmlFor="ob-dep">
              <Select id="ob-dep" value={f.depositOption} onChange={set('depositOption')} className="sm:max-w-xs">
                {Object.entries(DEPOSIT_TYPE).map(([k, l]) => <option key={k} value={k}>{k === 'cash' ? 'Money deposit' : `${l} (handed over at pickup)`}</option>)}
              </Select>
            </Field>
            {f.depositOption !== 'cash' ? (
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label={f.depositOption === 'bike' ? 'Bike make' : 'Laptop brand'} htmlFor="ob-cmake"><Input id="ob-cmake" value={f.cMake} onChange={set('cMake')} maxLength={40} /></Field>
                <Field label="Model" htmlFor="ob-cmodel"><Input id="ob-cmodel" value={f.cModel} onChange={set('cModel')} maxLength={60} /></Field>
                <Field label="Model year" htmlFor="ob-cyear" hint={f.depositOption === 'bike' ? '2022 or newer' : 'Latest models only'}><Input id="ob-cyear" inputMode="numeric" value={f.cYear} onChange={set('cYear')} maxLength={4} className="num" /></Field>
                {f.depositOption === 'bike'
                  ? <Field label="Registration no." htmlFor="ob-creg"><Input id="ob-creg" value={f.cReg} onChange={set('cReg')} maxLength={15} className="num uppercase" /></Field>
                  : <Field label="Serial no." htmlFor="ob-cserial"><Input id="ob-cserial" value={f.cSerial} onChange={set('cSerial')} maxLength={60} className="num" /></Field>}
              </div>
            ) : null}
            {errors.collateral ? <p className="text-caption font-semibold text-danger-600">{errors.collateral}</p> : null}
            {company && hubs.data?.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pickup point" htmlFor="ob-hub-p"><Select id="ob-hub-p" value={f.pickupLocationId} onChange={set('pickupLocationId')}><option value="">Car’s own location</option>{hubs.data.filter((h) => h.kinds.includes('pickup')).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>
                <Field label="Drop-off point" htmlFor="ob-hub-d"><Select id="ob-hub-d" value={f.dropoffLocationId} onChange={set('dropoffLocationId')}><option value="">Same as pickup</option>{hubs.data.filter((h) => h.kinds.includes('dropoff')).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Payment" description="Money taken at the office. Anything left is shown to the customer as a balance they can pay in the app or here.">
            <Field label="Payment status" htmlFor="ob-pay">
              <Select id="ob-pay" value={f.payStatus} onChange={set('payStatus')}>
                <option value="paid">Paid in full</option>
                <option value="partial">Advance paid (part)</option>
                <option value="unpaid">Not paid yet</option>
              </Select>
            </Field>
            {f.payStatus !== 'unpaid' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {f.payStatus === 'partial' ? (
                  <Field label="Amount received" htmlFor="ob-amt" required error={errors.amount}>
                    <MoneyInput id="ob-amt" value={f.amount} onChange={set('amount')} invalid={Boolean(errors.amount)} />
                  </Field>
                ) : null}
                <Field label="Paid by" htmlFor="ob-method">
                  <Select id="ob-method" value={f.method} onChange={set('method')}>
                    {Object.entries(OFFICE_METHOD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Reference" htmlFor="ob-ref">
                  <Input id="ob-ref" value={f.reference} onChange={set('reference')} maxLength={60} />
                </Field>
              </div>
            ) : null}
            {f.payStatus !== 'paid' ? (
              <Field label="Balance due by (IST)" htmlFor="ob-due" hint="Defaults to the pickup time. Pickup is blocked until it is paid.">
                <Input id="ob-due" type="datetime-local" value={f.balanceDueAt} onChange={set('balanceDueAt')} className="num sm:max-w-xs" />
              </Field>
            ) : null}
            <Field label="Office note" htmlFor="ob-note">
              <Textarea id="ob-note" value={f.note} onChange={set('note')} maxLength={500} rows={2} />
            </Field>
          </FormSection>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Summary" className="lg:sticky lg:top-4">
            {!f.car ? <p className="text-caption text-ink-500">Choose a car and dates to see the price.</p> : quote.isFetching && !q ? <p className="text-caption text-ink-500">Checking availability…</p> : quote.error ? (
              <p className="text-caption font-semibold text-danger-600">{errorMessage(quote.error)}</p>
            ) : q ? (
              <div className="space-y-3">
                <p className={cn('rounded-md p-2 text-caption font-semibold', q.available ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700')}>
                  {q.available ? `Available · ${duration(fromIstDateTime(startAt), fromIstDateTime(endAt))}` : q.message || 'Not available for these times.'}
                </p>
                {q.available ? (
                  <AmountRows
                    rows={[
                      { label: 'Rental', value: money(q.rentalPaise) },
                      q.discountPaise ? { label: 'Discount', value: `−${money(q.discountPaise)}`, tone: 'success' } : null,
                      { label: 'Convenience fee', value: money(q.convenienceFeePaise) },
                      { label: `GST (${(q.gstBps || 0) / 100}%)`, value: money(q.gstPaise) },
                      q.unlimitedKmPaise ? { label: 'incl. unlimited km', value: money(q.unlimitedKmPaise) } : null,
                      { label: f.depositOption === 'cash' ? 'Refundable deposit' : `Deposit: ${f.depositOption} at pickup`, value: money(q.depositPaise) },
                      { label: 'Total to collect', value: money(q.payablePaise), strong: true },
                      f.payStatus === 'partial' && toPaise(f.amount) ? { label: 'Balance after advance', value: money(q.payablePaise - toPaise(f.amount)) } : null,
                    ]}
                  />
                ) : null}
                <p className="text-caption text-ink-500">{dateTime(fromIstDateTime(startAt))} → {dateTime(fromIstDateTime(endAt))} IST</p>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
      <StickySaveBar dirty message={formError ? <span className="font-semibold text-danger-600" role="alert">{formError}</span> : 'The booking is confirmed straight away; the customer and host are notified.'}>
        <Button onClick={() => navigate('/bookings')} disabled={create.isPending}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={create.isPending} disabled={q && !q.available}>Confirm booking</Button>
      </StickySaveBar>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ADMIN } from '@/lib/api.js';
import { money, dateTime } from '@shared/lib/format.js';
import { CAMPAIGN } from '@/lib/labels.js';
import { useAction, useCatalog, useListQuery } from '@/lib/hooks.js';
import { applyFieldErrors, cn, fromIstDateTime, istDateTimeInput, toPaise, toRupeesInput, fmtNumber } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { Panel } from '@/components/Panel.jsx';
import { Button } from '@/components/Button.jsx';
import { Field, Input, Textarea, Select, MoneyInput, PercentInput, Switch, Checkbox, FormSection, StickySaveBar } from '@/components/Form.jsx';
import { DetailSkeleton } from '@/components/Skeleton.jsx';
import { ErrorState } from '@/components/EmptyState.jsx';
import { StatusPill } from '@/components/StatusPill.jsx';
import { MiniTable } from '@/components/MiniTable.jsx';
import { Pagination } from '@/components/Pagination.jsx';
import { useToast } from '@/components/Toast.jsx';
import { couponState } from './CouponsList.jsx';

const REDEMPTION = { reserved: { label: 'Reserved', tone: 'warning' }, redeemed: { label: 'Redeemed', tone: 'success' }, released: { label: 'Released', tone: 'neutral' } };
const money_ = (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0);
const intOrBlank = (v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 1);
const OID = /^[a-f0-9]{24}$/;

const schema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, 'Use 4–20 letters or digits, no spaces'),
    title: z.string().trim().min(3, 'At least 3 characters').max(80),
    description: z.string().trim().max(300),
    campaign: z.enum(['discount', 'referral', 'festival', 'first_ride']),
    type: z.enum(['percent', 'flat']),
    value: z.string().trim().min(1, 'Enter the discount'),
    maxDiscount: z.string().trim().refine(money_, 'Enter an amount in rupees'),
    minRental: z.string().trim().refine(money_, 'Enter an amount in rupees'),
    startsAt: z.string().min(1, 'Choose a start'),
    endsAt: z.string().min(1, 'Choose an end'),
    usageLimit: z.string().trim().refine(intOrBlank, 'Whole number, or blank for unlimited'),
    perUserLimit: z.string().trim().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100, '1 to 100'),
    firstBookingOnly: z.boolean(),
    cityIds: z.array(z.string()),
    categoryIds: z.array(z.string()),
    userIds: z.string().refine((v) => v.split(/[\s,]+/).filter(Boolean).every((x) => OID.test(x)), 'Paste user IDs (24-character) separated by commas'),
    isPublic: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const n = Number(d.value);
    if (d.type === 'percent' && !(n > 0 && n <= 100)) ctx.addIssue({ path: ['value'], code: 'custom', message: 'Enter a percentage between 0.01 and 100' });
    if (d.type === 'flat' && !(n >= 1)) ctx.addIssue({ path: ['value'], code: 'custom', message: 'Enter at least ₹1' });
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) ctx.addIssue({ path: ['endsAt'], code: 'custom', message: 'End must be after the start' });
  });

const EMPTY = {
  code: '', title: '', description: '', campaign: 'discount', type: 'percent', value: '', maxDiscount: '', minRental: '',
  startsAt: istDateTimeInput(new Date()), endsAt: istDateTimeInput(new Date(Date.now() + 30 * 86400000)), usageLimit: '', perUserLimit: '1',
  firstBookingOnly: false, cityIds: [], categoryIds: [], userIds: '', isPublic: true, isActive: true,
};

function toForm(c) {
  return {
    code: c.code, title: c.title || '', description: c.description || '', campaign: c.campaign, type: c.type,
    value: c.type === 'percent' ? String((c.valueBps || 0) / 100) : toRupeesInput(c.valuePaise),
    maxDiscount: toRupeesInput(c.maxDiscountPaise), minRental: c.minRentalPaise ? toRupeesInput(c.minRentalPaise) : '',
    startsAt: istDateTimeInput(c.startsAt), endsAt: istDateTimeInput(c.endsAt), usageLimit: c.usageLimit ? String(c.usageLimit) : '',
    perUserLimit: String(c.perUserLimit || 1), firstBookingOnly: Boolean(c.firstBookingOnly), cityIds: (c.cityIds || []).map(String),
    categoryIds: (c.categoryIds || []).map(String), userIds: (c.userIds || []).join(', '), isPublic: c.isPublic !== false, isActive: c.isActive !== false,
  };
}

function toBody(d) {
  const body = {
    title: d.title, campaign: d.campaign, type: d.type, minRentalPaise: toPaise(d.minRental) || 0,
    startsAt: fromIstDateTime(d.startsAt), endsAt: fromIstDateTime(d.endsAt), usageLimit: d.usageLimit ? Number(d.usageLimit) : null,
    perUserLimit: Number(d.perUserLimit), firstBookingOnly: d.firstBookingOnly, cityIds: d.cityIds, categoryIds: d.categoryIds,
    userIds: d.userIds.split(/[\s,]+/).filter(Boolean), isPublic: d.isPublic, isActive: d.isActive,
  };
  if (d.description) body.description = d.description;
  if (d.type === 'percent') {
    body.valueBps = Math.round(Number(d.value) * 100);
    body.maxDiscountPaise = toPaise(d.maxDiscount) || 0; // 0 = no cap
  } else {
    body.valuePaise = toPaise(d.value);
  }
  return body;
}

/** There is no GET /admin/coupons/:id — find the coupon by paging through the list. */
async function findCoupon(id) {
  for (let page = 1; page <= 50; page += 1) {
    const res = await api.list(`${ADMIN}/coupons`, { page, limit: 100 });
    const hit = res.data.find((c) => c.id === id);
    if (hit) return hit;
    if (page >= (res.meta?.pages || 0)) break;
  }
  const err = new Error('This coupon no longer exists.');
  err.status = 404;
  throw err;
}

function TargetList({ label, hint, options, value, onChange }) {
  const all = value.length === 0;
  return (
    <fieldset>
      <legend className="mb-1.5 text-label text-ink-800">{label}</legend>
      <p className="mb-2 text-caption text-ink-500">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={all} onClick={() => onChange([])} className={cn('h-8 rounded-full border px-3 text-caption font-semibold', all ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-600 hover:bg-ink-50')}>
          All
        </button>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
              className={cn('h-8 rounded-full border px-3 text-caption font-semibold', on ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-600 hover:bg-ink-50')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Redemptions({ id }) {
  const [page, setPage] = useState(1);
  const { rows, meta, isLoading, error, refetch } = useListQuery(['coupon-redemptions', id], `${ADMIN}/coupons/${id}/redemptions`, { page, limit: 20 });
  return (
    <Panel
      title="Redemptions"
      description={meta ? `${fmtNumber(meta.redeemedCount || 0)} redeemed · ${money(meta.totalDiscountPaise || 0)} total discount` : undefined}
      flush
    >
      {isLoading ? <p className="px-5 py-4 text-caption text-ink-500">Loading…</p> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <>
          <MiniTable
            columns={[
              { key: 'at', header: 'Date', cell: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
              { key: 'user', header: 'Renter', cell: (r) => (r.user?._id ? <Link to={`/users/${r.user._id}`} className="link">{r.user.name || r.user.phone}</Link> : '—') },
              { key: 'booking', header: 'Booking', cell: (r) => (r.booking?._id ? <Link to={`/bookings/${r.booking._id}`} className="num link">{r.booking.ref}</Link> : '—') },
              { key: 'status', header: 'Status', cell: (r) => <StatusPill map={REDEMPTION} value={r.status} dot={false} /> },
              { key: 'amt', header: 'Discount', align: 'right', cell: (r) => money(r.discountPaise) },
            ]}
            rows={rows}
            empty="Nobody has used this coupon yet."
          />
          {meta?.pages > 1 ? <Pagination meta={meta} onPage={setPage} /> : null}
        </>
      )}
    </Panel>
  );
}

function CouponEditor({ id }) {
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const cities = useCatalog('cities');
  const categories = useCatalog('categories');
  const existing = useQuery({ queryKey: ['coupon', id], queryFn: () => findCoupon(id), enabled: !isNew });

  const { register, handleSubmit, control, watch, reset, setError, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY });
  useEffect(() => {
    if (existing.data) reset(toForm(existing.data));
  }, [existing.data, reset]);

  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/coupons`, body) : api.patch(`${ADMIN}/coupons/${id}`, body)), {
    success: isNew ? 'Coupon created' : 'Coupon saved',
    invalidate: [['coupons'], ['coupon', id]],
    toastError: false,
    onSuccess: (c) => (isNew ? navigate(`/coupons/${c.id}`, { replace: true }) : reset(toForm(c))),
  });

  const onSubmit = (d) => {
    const body = toBody(d);
    if (isNew) body.code = d.code.trim().toUpperCase();
    save.mutate(body, {
      onError: (err) => {
        const mapped = applyFieldErrors(err, setError, { valueBps: 'value', valuePaise: 'value', maxDiscountPaise: 'maxDiscount', minRentalPaise: 'minRental', '': false });
        if (err.code === 'COUPON_EXISTS') setError('code', { message: err.message });
        else if (!mapped) toast.error(err);
      },
    });
  };

  if (!isNew && existing.isLoading) return <DetailSkeleton />;
  if (!isNew && existing.error) return <div className="panel"><ErrorState error={existing.error} onRetry={existing.refetch} title="Could not load this coupon" /></div>;

  const type = watch('type');
  const st = existing.data ? couponState(existing.data) : null;

  return (
    <>
      <PageHeader
        back={{ to: '/coupons', label: 'Coupons' }}
        title={isNew ? 'New coupon' : <span className="num font-mono">{existing.data.code}</span>}
        crumb={isNew ? 'New coupon' : existing.data.code}
        meta={st ? <StatusPill tone={st.tone}>{st.label}</StatusPill> : null}
        description={isNew ? 'Discounts apply to the rental amount only (not fees, GST or deposit).' : `${fmtNumber(existing.data.usedCount || 0)} uses so far. The code cannot be changed after creation.`}
      />
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="panel px-5">
          <FormSection title="Basics" description="What renters see when they apply the code.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="code" required error={errors.code?.message} hint={isNew ? '4–20 letters or digits.' : 'Fixed after creation.'}>
                <Input id="code" {...register('code')} disabled={!isNew} className="num font-mono uppercase" autoComplete="off" invalid={Boolean(errors.code)} />
              </Field>
              <Field label="Campaign" htmlFor="campaign">
                <Select id="campaign" {...register('campaign')}>
                  {Object.entries(CAMPAIGN).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Title" htmlFor="title" required error={errors.title?.message}>
              <Input id="title" {...register('title')} maxLength={80} placeholder="e.g. 20% off weekend trips" invalid={Boolean(errors.title)} />
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description?.message} hint="Optional terms shown under the offer.">
              <Textarea id="description" rows={2} maxLength={300} {...register('description')} />
            </Field>
          </FormSection>

          <FormSection title="Discount" description="Percentage discounts can be capped. The rental must reach the minimum for the code to apply.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Type" htmlFor="type">
                <Select id="type" {...register('type')}>
                  <option value="percent">Percentage</option>
                  <option value="flat">Flat amount</option>
                </Select>
              </Field>
              <Field label={type === 'percent' ? 'Percentage off' : 'Amount off'} htmlFor="value" required error={errors.value?.message}>
                {type === 'percent' ? <PercentInput id="value" {...register('value')} invalid={Boolean(errors.value)} /> : <MoneyInput id="value" {...register('value')} invalid={Boolean(errors.value)} />}
              </Field>
              {type === 'percent' ? (
                <Field label="Maximum discount" htmlFor="maxDiscount" error={errors.maxDiscount?.message} hint="Blank = no cap.">
                  <MoneyInput id="maxDiscount" {...register('maxDiscount')} invalid={Boolean(errors.maxDiscount)} />
                </Field>
              ) : null}
            </div>
            <Field label="Minimum rental amount" htmlFor="minRental" error={errors.minRental?.message} hint="Blank = no minimum." className="sm:max-w-[240px]">
              <MoneyInput id="minRental" {...register('minRental')} invalid={Boolean(errors.minRental)} />
            </Field>
          </FormSection>

          <FormSection title="Validity and limits" description="Times are in IST.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" htmlFor="startsAt" required error={errors.startsAt?.message}>
                <Input id="startsAt" type="datetime-local" {...register('startsAt')} className="num" invalid={Boolean(errors.startsAt)} />
              </Field>
              <Field label="Ends" htmlFor="endsAt" required error={errors.endsAt?.message}>
                <Input id="endsAt" type="datetime-local" {...register('endsAt')} className="num" invalid={Boolean(errors.endsAt)} />
              </Field>
              <Field label="Total uses" htmlFor="usageLimit" error={errors.usageLimit?.message} hint="Blank = unlimited.">
                <Input id="usageLimit" type="number" min={1} {...register('usageLimit')} className="num" invalid={Boolean(errors.usageLimit)} />
              </Field>
              <Field label="Uses per renter" htmlFor="perUserLimit" required error={errors.perUserLimit?.message}>
                <Input id="perUserLimit" type="number" min={1} max={100} {...register('perUserLimit')} className="num" invalid={Boolean(errors.perUserLimit)} />
              </Field>
            </div>
            <Checkbox label="First booking only" description="Only renters with no previous paid booking can use it." {...register('firstBookingOnly')} />
          </FormSection>

          <FormSection title="Targeting" description="Leave a list on “All” to apply everywhere.">
            <Controller
              control={control}
              name="cityIds"
              render={({ field }) => <TargetList label="Cities" hint="The car’s city must be selected." options={(cities.data || []).map((c) => ({ value: c.id, label: c.name }))} value={field.value} onChange={field.onChange} />}
            />
            <Controller
              control={control}
              name="categoryIds"
              render={({ field }) => <TargetList label="Car categories" hint="The car’s category must be selected." options={(categories.data || []).map((c) => ({ value: c.id, label: c.name }))} value={field.value} onChange={field.onChange} />}
            />
            <Field label="Restrict to specific renters" htmlFor="userIds" error={errors.userIds?.message} hint="Optional. Paste user IDs (from the user page URL), separated by commas — e.g. for goodwill coupons.">
              <Textarea id="userIds" rows={2} className="num font-mono text-caption" {...register('userIds')} invalid={Boolean(errors.userIds)} />
            </Field>
          </FormSection>

          <FormSection title="Visibility">
            <Controller control={control} name="isPublic" render={({ field }) => <Switch label="Show under Offers" description="Off = the code works but is not advertised in the app." checked={field.value} onChange={field.onChange} />} />
            <Controller control={control} name="isActive" render={({ field }) => <Switch label="Active" description="Turn off to stop the code working immediately." checked={field.value} onChange={field.onChange} />} />
          </FormSection>
        </div>

        <StickySaveBar dirty={isDirty || isNew} message={isNew ? 'The coupon goes live at its start time once created.' : undefined}>
          <Button onClick={() => (isNew ? navigate('/coupons') : reset(toForm(existing.data)))} disabled={save.isPending || (!isNew && !isDirty)}>
            {isNew ? 'Cancel' : 'Discard changes'}
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!isNew && !isDirty}>
            {isNew ? 'Create coupon' : 'Save changes'}
          </Button>
        </StickySaveBar>
      </form>

      {!isNew ? <div className="mt-6"><Redemptions id={id} /></div> : null}
    </>
  );
}

/** Keyed by id so creating a coupon (new → :id) mounts a fresh editor instead of reusing state. */
export default function CouponEdit() {
  const { id } = useParams();
  return <CouponEditor key={id || 'new'} id={id} />;
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { useAction, useCatalog } from '@/admin/lib/hooks.js';
import { cn, errorMessage, fieldErrorMap, fromIstDateTime, istDateTimeInput } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Button, IconButton } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Switch } from '@/admin/components/Form.jsx';
import { ImageUpload } from '@/admin/components/FileUpload.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { EmptyState, ErrorState } from '@/admin/components/EmptyState.jsx';
import { Skeleton } from '@/admin/components/Skeleton.jsx';

const blank = { title: '', subtitle: '', image: null, link: '', couponCode: '', cityIds: [], startsAt: '', endsAt: '', sortOrder: '0', isActive: true };

function bannerState(b) {
  const now = Date.now();
  if (!b.isActive) return { label: 'Inactive', tone: 'neutral' };
  if (b.startsAt && new Date(b.startsAt) > now) return { label: 'Scheduled', tone: 'info' };
  if (b.endsAt && new Date(b.endsAt) < now) return { label: 'Ended', tone: 'neutral' };
  return { label: 'Live', tone: 'success' };
}

function BannerForm({ banner, open, onClose }) {
  const isNew = !banner?.id;
  const cities = useCatalog('cities');
  const [f, setF] = useState(() =>
    banner?.id
      ? {
          title: banner.title || '', subtitle: banner.subtitle || '', image: { url: banner.imageUrl }, link: banner.link || '', couponCode: banner.couponCode || '',
          cityIds: (banner.cityIds || []).map(String), startsAt: istDateTimeInput(banner.startsAt), endsAt: istDateTimeInput(banner.endsAt),
          sortOrder: String(banner.sortOrder ?? 0), isActive: banner.isActive !== false,
        }
      : blank,
  );
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/cms/banners`, body) : api.patch(`${ADMIN}/cms/banners/${banner.id}`, body)), {
    success: isNew ? 'Banner created' : 'Banner saved',
    invalidate: [['banners']],
    toastError: false,
    onSuccess: onClose,
  });

  const submit = (e) => {
    e?.preventDefault();
    const next = {};
    if (f.title.trim().length < 2) next.title = 'Enter a title (2–80 characters).';
    if (!f.image?.url) next.imageFileId = 'Upload a banner image.';
    if (f.link && !/^\/[\w\-/?=&.%]*$/.test(f.link)) next.link = 'Use an in-app path that starts with /, e.g. /search?category=suv';
    if (f.startsAt && f.endsAt && f.endsAt <= f.startsAt) next.endsAt = 'End must be after the start.';
    if (!/^\d+$/.test(f.sortOrder)) next.sortOrder = 'Whole number.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = {
      title: f.title.trim(), cityIds: f.cityIds, startsAt: f.startsAt ? fromIstDateTime(f.startsAt) : null, endsAt: f.endsAt ? fromIstDateTime(f.endsAt) : null,
      sortOrder: Number(f.sortOrder), isActive: f.isActive,
    };
    if (f.subtitle.trim()) body.subtitle = f.subtitle.trim();
    if (f.link.trim()) body.link = f.link.trim();
    if (f.couponCode.trim()) body.couponCode = f.couponCode.trim().toUpperCase();
    if (f.image?.id) body.imageFileId = f.image.id;
    save.mutate(body, { onError: (err) => setErrors({ ...fieldErrorMap(err), form: err.status === 422 ? null : errorMessage(err) }) });
  };

  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title={isNew ? 'New banner' : 'Edit banner'}
      description="Shown in the carousel on the renter home screen."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{isNew ? 'Create banner' : 'Save banner'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ImageUpload purpose="banner" label="Banner image" value={f.image} onChange={(img) => setF((x) => ({ ...x, image: img }))} error={errors.imageFileId} allowRemove={false} hint="Wide image, about 1200×600 px. JPG, PNG or WebP." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="b-title" required error={errors.title}>
            <Input id="b-title" value={f.title} onChange={set('title')} maxLength={80} invalid={Boolean(errors.title)} />
          </Field>
          <Field label="Subtitle" htmlFor="b-sub" error={errors.subtitle}>
            <Input id="b-sub" value={f.subtitle} onChange={set('subtitle')} maxLength={160} />
          </Field>
          <Field label="Opens in app" htmlFor="b-link" error={errors.link} hint="In-app path, e.g. /search?category=suv">
            <Input id="b-link" value={f.link} onChange={set('link')} maxLength={200} className="font-mono text-caption" invalid={Boolean(errors.link)} />
          </Field>
          <Field label="Coupon code" htmlFor="b-coupon" error={errors.couponCode} hint="Optional — shown on the banner.">
            <Input id="b-coupon" value={f.couponCode} onChange={set('couponCode')} maxLength={30} className="num font-mono uppercase" />
          </Field>
          <Field label="Starts (IST)" htmlFor="b-start" error={errors.startsAt} hint="Blank = immediately.">
            <Input id="b-start" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} className="num" />
          </Field>
          <Field label="Ends (IST)" htmlFor="b-end" error={errors.endsAt} hint="Blank = no end date.">
            <Input id="b-end" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} className="num" invalid={Boolean(errors.endsAt)} />
          </Field>
          <Field label="Order" htmlFor="b-order" error={errors.sortOrder} hint="Lower numbers show first.">
            <Input id="b-order" type="number" min={0} value={f.sortOrder} onChange={set('sortOrder')} className="num" />
          </Field>
          <div className="pt-6">
            <Switch label="Active" checked={f.isActive} onChange={(v) => setF((x) => ({ ...x, isActive: v }))} />
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-label text-ink-800">Cities</legend>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!f.cityIds.length} onClick={() => setF((x) => ({ ...x, cityIds: [] }))} className={cn('h-8 rounded-full border px-3 text-caption font-semibold', !f.cityIds.length ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line text-ink-600 hover:bg-ink-50')}>All cities</button>
            {(cities.data || []).map((c) => {
              const on = f.cityIds.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setF((x) => ({ ...x, cityIds: on ? x.cityIds.filter((i) => i !== c.id) : [...x.cityIds, c.id] }))} className={cn('h-8 rounded-full border px-3 text-caption font-semibold', on ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line text-ink-600 hover:bg-ink-50')}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

export default function Banners() {
  const cities = useCatalog('cities');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['banners'], queryFn: () => api.get(`${ADMIN}/cms/banners`) });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const toggle = useAction(({ id, isActive }) => api.patch(`${ADMIN}/cms/banners/${id}`, { isActive }), { success: (_d, v) => (v.isActive ? 'Banner activated' : 'Banner deactivated'), invalidate: [['banners']] });
  const remove = useAction((id) => api.del(`${ADMIN}/cms/banners/${id}`), { success: 'Banner deleted', invalidate: [['banners']], toastError: false });
  const cityName = new Map((cities.data || []).map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Banners" description="Promotional banners on the renter home screen, optionally limited to cities and dates." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New banner</Button>} />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="panel p-3"><Skeleton className="aspect-[2/1] w-full" /><Skeleton className="mt-3 h-4 w-2/3" /></div>)}</div>
      ) : error ? (
        <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>
      ) : !data.length ? (
        <div className="panel"><EmptyState icon={ImageIcon} title="No banners yet" description="Add a banner to promote an offer or a car category on the home screen." action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({})}>New banner</Button>} /></div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((b) => {
            const st = bannerState(b);
            return (
              <li key={b.id} className="panel flex flex-col overflow-hidden">
                <div className="relative aspect-[2/1] bg-ink-50">
                  <img src={b.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute left-2 top-2"><StatusPill tone={st.tone} className="bg-surface/95">{st.label}</StatusPill></span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-bodySm font-bold text-ink-900">{b.title}</p>
                      {b.subtitle ? <p className="line-clamp-2 text-caption text-ink-600">{b.subtitle}</p> : null}
                    </div>
                    <Tag>#{b.sortOrder}</Tag>
                  </div>
                  <dl className="space-y-0.5 text-caption text-ink-600">
                    <div><dt className="inline font-semibold">Cities: </dt><dd className="inline">{b.cityIds?.length ? b.cityIds.map((c) => cityName.get(String(c)) || 'Inactive city').join(', ') : 'All'}</dd></div>
                    <div><dt className="inline font-semibold">When: </dt><dd className="inline">{b.startsAt ? dateTime(b.startsAt) : 'Now'} → {b.endsAt ? dateTime(b.endsAt) : 'No end'}</dd></div>
                    {b.link ? <div><dt className="inline font-semibold">Opens: </dt><dd className="inline font-mono">{b.link}</dd></div> : null}
                    {b.couponCode ? <div><dt className="inline font-semibold">Coupon: </dt><dd className="inline font-mono">{b.couponCode}</dd></div> : null}
                  </dl>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
                    <Switch label={<span className="text-caption">Active</span>} checked={b.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: b.id, isActive: v })} className="items-center" />
                    <div className="flex gap-1">
                      <IconButton icon={Pencil} label={`Edit ${b.title}`} onClick={() => setEditing(b)} />
                      <IconButton icon={Trash2} label={`Delete ${b.title}`} onClick={() => setDeleting(b)} className="hover:text-danger-600" />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? <BannerForm key={editing.id || 'new'} banner={editing} open onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this banner?"
        description={`“${deleting?.title}” is removed from the app immediately. To pause it instead, switch it off.`}
        confirmLabel="Delete banner"
        tone="danger"
        onConfirm={() => remove.mutateAsync(deleting.id)}
      />
    </>
  );
}

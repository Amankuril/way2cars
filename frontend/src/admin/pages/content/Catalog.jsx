import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Tags, ImageOff } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { BODY_TYPE } from '@/admin/lib/labels.js';
import { useAction, useSearchState } from '@/admin/lib/hooks.js';
import { errorMessage, fieldErrorMap } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';
import { Button, IconButton } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Textarea, Select, Switch } from '@/admin/components/Form.jsx';
import { ImageUpload } from '@/admin/components/FileUpload.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { ZoneMap } from '@/admin/components/ZoneMap.jsx';

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

const KINDS = {
  cities: {
    label: 'Cities',
    singular: 'city',
    purpose: 'city_image',
    imageField: 'imageFileId',
    imageLabel: 'City image',
    blank: { name: '', slug: '', state: '', gstStateCode: '', lat: '', lng: '', polygon: null, serviceRadiusKm: '40', sortOrder: '0', isActive: true, isPopular: false, image: null },
    fromRow: (c) => ({
      name: c.name, slug: c.slug, state: c.state || '', gstStateCode: '', lat: c.center ? String(c.center.lat) : '', lng: c.center ? String(c.center.lng) : '', polygon: c.geofencePolygon || null,
      serviceRadiusKm: String(c.serviceRadiusKm ?? 40), sortOrder: String(c.sortOrder ?? 0), isActive: c.isActive, isPopular: c.isPopular, image: c.imageUrl ? { url: c.imageUrl } : null,
    }),
    validate: (f) => {
      const e = {};
      const lat = num(f.lat);
      const lng = num(f.lng);
      if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) e.zone = 'Search for the city on the map or draw its service zone.';
      const r = num(f.serviceRadiusKm);
      if (!(r >= 1 && r <= 300)) e.serviceRadiusKm = '1 to 300 km.';
      if (f.gstStateCode && !/^\d{2}$/.test(f.gstStateCode)) e.gstStateCode = 'Two digits, e.g. 29.';
      return e;
    },
    toBody: (f) => ({
      name: f.name.trim(), slug: f.slug, ...(f.state.trim() ? { state: f.state.trim() } : {}), ...(f.gstStateCode ? { gstStateCode: f.gstStateCode } : {}),
      lat: Number(f.lat), lng: Number(f.lng), geofencePolygon: f.polygon?.length >= 3 ? f.polygon : null, serviceRadiusKm: Number(f.serviceRadiusKm), sortOrder: Number(f.sortOrder), isActive: f.isActive, isPopular: f.isPopular,
    }),
  },
  brands: {
    label: 'Brands',
    singular: 'brand',
    purpose: 'brand_logo',
    imageField: 'logoFileId',
    imageLabel: 'Logo',
    blank: { name: '', slug: '', sortOrder: '0', isActive: true, image: null },
    fromRow: (b) => ({ name: b.name, slug: b.slug, sortOrder: String(b.sortOrder ?? 0), isActive: b.isActive, image: b.logoUrl ? { url: b.logoUrl } : null }),
    validate: () => ({}),
    toBody: (f) => ({ name: f.name.trim(), slug: f.slug, sortOrder: Number(f.sortOrder), isActive: f.isActive }),
  },
  categories: {
    label: 'Categories',
    singular: 'category',
    purpose: 'category_image',
    imageField: 'imageFileId',
    imageLabel: 'Category image',
    blank: { name: '', slug: '', bodyType: 'hatchback', description: '', sortOrder: '0', isActive: true, isPopular: false, image: null },
    fromRow: (c) => ({ name: c.name, slug: c.slug, bodyType: c.bodyType, description: c.description || '', sortOrder: String(c.sortOrder ?? 0), isActive: c.isActive, isPopular: c.isPopular, image: c.imageUrl ? { url: c.imageUrl } : null }),
    validate: () => ({}),
    toBody: (f) => ({ name: f.name.trim(), slug: f.slug, bodyType: f.bodyType, ...(f.description.trim() ? { description: f.description.trim() } : {}), sortOrder: Number(f.sortOrder), isActive: f.isActive, isPopular: f.isPopular }),
  },
};

function ItemForm({ kind, item, onClose, rows = [] }) {
  const K = KINDS[kind];
  const isNew = !item.id;
  const [f, setF] = useState(() => (isNew ? K.blank : K.fromRow(item)));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [imageChanged, setImageChanged] = useState(false);
  const [errors, setErrors] = useState({});
  const others = kind === 'cities'
    ? rows.filter((c) => c.id !== item.id).map((c) => ({ name: c.name, polygon: c.geofencePolygon, centre: c.center, radiusKm: c.serviceRadiusKm }))
    : [];
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === 'name' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };
  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/catalog/${kind}`, body) : api.patch(`${ADMIN}/catalog/${kind}/${item.id}`, body)), {
    success: `${K.singular[0].toUpperCase()}${K.singular.slice(1)} ${isNew ? 'added' : 'saved'}`,
    invalidate: [['catalog', kind], ['public', kind]],
    toastError: false,
    onSuccess: onClose,
  });
  const submit = (e) => {
    e?.preventDefault();
    const next = { ...K.validate(f) };
    if (f.name.trim().length < (kind === 'brands' ? 1 : 2)) next.name = 'Enter a name.';
    if (!/^[a-z0-9-]{2,60}$/.test(f.slug)) next.slug = 'Lowercase letters, numbers and dashes (2–60).';
    if (!/^\d+$/.test(f.sortOrder)) next.sortOrder = 'Whole number.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = K.toBody(f);
    if (imageChanged) body[K.imageField] = f.image?.id || null;
    save.mutate(body, {
      onError: (err) => {
        const fe = fieldErrorMap(err, { [K.imageField]: 'image' });
        setErrors({ ...fe, form: Object.keys(fe).length ? null : err.code === 'CONFLICT' || err.status === 409 ? 'That slug is already used. Choose another.' : errorMessage(err) });
      },
    });
  };

  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={isNew ? `New ${K.singular}` : `Edit ${item.name}`}
      size={kind === 'cities' ? 'xl' : 'lg'}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>{isNew ? `Add ${K.singular}` : 'Save'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ct-name" required error={errors.name}>
            <Input id="ct-name" value={f.name} onChange={set('name')} maxLength={80} invalid={Boolean(errors.name)} data-autofocus />
          </Field>
          <Field label="Slug" htmlFor="ct-slug" required error={errors.slug} hint={isNew ? 'Used in URLs. Generated from the name.' : 'Changing it may break saved links.'}>
            <Input id="ct-slug" value={f.slug} onChange={(e) => { setSlugTouched(true); setF((x) => ({ ...x, slug: e.target.value.toLowerCase() })); }} className="font-mono text-caption" invalid={Boolean(errors.slug)} />
          </Field>
          {kind === 'cities' ? (
            <>
              <Field label="State" htmlFor="ct-state"><Input id="ct-state" value={f.state} onChange={set('state')} maxLength={80} /></Field>
              <Field label="GST state code" htmlFor="ct-gst" error={errors.gstStateCode} hint={isNew ? 'Place of supply on invoices, e.g. 29 for Karnataka.' : 'Leave blank to keep the saved code.'}>
                <Input id="ct-gst" value={f.gstStateCode} onChange={set('gstStateCode')} maxLength={2} inputMode="numeric" className="num" invalid={Boolean(errors.gstStateCode)} />
              </Field>
              <Field label="Service radius (km)" htmlFor="ct-radius" required error={errors.serviceRadiusKm} hint={f.polygon?.length ? 'Not used while a zone is drawn.' : 'Used when no zone is drawn.'}><Input id="ct-radius" type="number" min={1} max={300} value={f.serviceRadiusKm} onChange={set('serviceRadiusKm')} className="num" /></Field>
            </>
          ) : null}
          {kind === 'categories' ? (
            <Field label="Body type" htmlFor="ct-body">
              <Select id="ct-body" value={f.bodyType} onChange={set('bodyType')}>
                {Object.entries(BODY_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Order" htmlFor="ct-order" error={errors.sortOrder} hint="Lower numbers show first."><Input id="ct-order" type="number" min={0} value={f.sortOrder} onChange={set('sortOrder')} className="num" /></Field>
        </div>
        {kind === 'cities' ? (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-label font-semibold text-ink-800">Service zone <span className="text-danger-600">*</span></span>
              <span className="num text-caption text-ink-500">{f.lat !== '' && f.lng !== '' ? `Centre ${Number(f.lat).toFixed(4)}, ${Number(f.lng).toFixed(4)}` : 'No centre yet'}</span>
            </div>
            <ZoneMap
              centre={f.lat !== '' && f.lng !== '' ? { lat: Number(f.lat), lng: Number(f.lng) } : null}
              polygon={f.polygon}
              radiusKm={f.serviceRadiusKm}
              others={others}
              onChange={({ polygon, centre }) => setF((x) => ({ ...x, polygon, ...(centre ? { lat: String(centre.lat), lng: String(centre.lng) } : {}) }))}
              onPlace={(p) => setF((x) => ({ ...x, ...(!x.state && p.state ? { state: p.state } : {}) }))}
            />
            {errors.zone ? <p className="mt-1.5 text-caption font-semibold text-danger-600" role="alert">{errors.zone}</p> : null}
          </div>
        ) : null}
        {kind === 'categories' ? (
          <Field label="Description" htmlFor="ct-desc"><Textarea id="ct-desc" rows={2} maxLength={300} value={f.description} onChange={set('description')} /></Field>
        ) : null}
        <ImageUpload
          purpose={K.purpose}
          label={K.imageLabel}
          value={f.image}
          onChange={(img) => { setImageChanged(true); setF((x) => ({ ...x, image: img })); }}
          error={errors.image}
          aspect={kind === 'brands' ? 'aspect-square' : 'aspect-[16/9]'}
          previewFit={kind === 'brands' ? 'object-contain' : 'object-cover'}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Switch label="Active" description="Inactive items are hidden from the apps." checked={f.isActive} onChange={(v) => setF((x) => ({ ...x, isActive: v }))} />
          {'isPopular' in f ? <Switch label="Popular" description="Highlighted in the apps." checked={f.isPopular} onChange={(v) => setF((x) => ({ ...x, isPopular: v }))} /> : null}
        </div>
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

export default function Catalog() {
  const [s, set] = useSearchState({ tab: 'cities' });
  const kind = KINDS[s.tab] ? s.tab : 'cities';
  const K = KINDS[kind];
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['catalog', kind], queryFn: () => api.get(`${ADMIN}/catalog/${kind}`) });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const remove = useAction((id) => api.del(`${ADMIN}/catalog/${kind}/${id}`), {
    success: 'Deleted',
    invalidate: [['catalog', kind], ['public', kind]],
    toastError: false,
  });
  const toggle = useAction(({ id, isActive }) => api.patch(`${ADMIN}/catalog/${kind}/${id}`, { isActive }), {
    success: (_d, v) => (v.isActive ? 'Activated' : 'Deactivated'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public', kind] }),
    invalidate: [['catalog', kind]],
  });

  const imageUrl = (r) => r.imageUrl || r.logoUrl;
  const columns = [
    {
      key: 'name',
      header: K.label.slice(0, -1).replace(/ie$/, 'y'),
      cell: (r) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-ink-50 ${kind === 'brands' ? 'w-9' : 'w-14'}`}>
            {imageUrl(r) ? <img src={imageUrl(r)} alt="" className={`h-full w-full ${kind === 'brands' ? 'object-contain p-1' : 'object-cover'}`} loading="lazy" /> : <ImageOff className="h-4 w-4 text-ink-300" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <button type="button" onClick={() => setEditing(r)} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{r.name}</button>
            <div className="font-mono text-caption text-ink-500">{r.slug}</div>
          </div>
        </div>
      ),
    },
    kind === 'cities' && { key: 'state', header: 'State', cell: (r) => r.state || '—' },
    kind === 'cities' && { key: 'area', header: 'Service area', cell: (r) => (r.hasPolygon ? <Tag tone="info">Zone · {r.geofencePolygon?.length || 0} corners</Tag> : <span className="text-caption text-ink-600">{r.serviceRadiusKm} km radius{r.center ? '' : ' · no centre'}</span>) },
    kind === 'categories' && { key: 'body', header: 'Body type', cell: (r) => BODY_TYPE[r.bodyType] || r.bodyType },
    {
      key: 'flags',
      header: 'Status',
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <StatusPill tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusPill>
          {r.isPopular ? <Tag tone="info">Popular</Tag> : null}
        </div>
      ),
    },
    { key: 'order', header: 'Order', align: 'right', cell: (r) => r.sortOrder },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="xs" variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}>{r.isActive ? 'Deactivate' : 'Activate'}</Button>
          <IconButton size="sm" icon={Pencil} label={`Edit ${r.name}`} onClick={() => setEditing(r)} />
          <IconButton size="sm" icon={Trash2} label={`Delete ${r.name}`} onClick={() => setDeleting(r)} className="hover:text-danger-600" />
        </div>
      ),
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeader title="Catalog" description="Cities, car brands and categories that hosts choose from and renters filter by." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New {K.singular}</Button>} />
      <Tabs className="mb-4" label="Catalog section" value={kind} onChange={(v) => set({ tab: v })} items={Object.entries(KINDS).map(([k, v]) => ({ value: k, label: v.label, count: k === kind ? data?.length : undefined }))} />
      <DataTable
        columns={columns}
        rows={data}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        empty={<EmptyState icon={Tags} title={`No ${K.label.toLowerCase()} yet`} description={`Add the first ${K.singular}.`} />}
      />
      {editing ? <ItemForm key={`${kind}-${editing.id || 'new'}`} kind={kind} item={editing} rows={data || []} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={`This cannot be undone. If any car uses this ${K.singular}, deletion is refused — deactivate it instead.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => remove.mutateAsync(deleting.id)}
      />
    </>
  );
}

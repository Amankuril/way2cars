import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Tags, MapPin } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { FUEL, TRANSMISSION } from '@/admin/lib/labels.js';
import { useAction, useCatalog } from '@/admin/lib/hooks.js';
import { errorMessage, fieldErrorMap } from '@/admin/lib/utils.js';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { Button, IconButton } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Textarea, Select, Switch, Checkbox } from '@/admin/components/Form.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';

/**
 * Catalog tabs that are not slug/image items: car models (with variants) per brand, and Way2Cars
 * pickup / drop-off points per city.
 */

const blankVariant = () => ({ name: '', fuelType: '', transmission: '', seats: '', isActive: true });

function ModelForm({ item, brands, categories, defaultBrandId, onClose }) {
  const isNew = !item.id;
  const [f, setF] = useState(() => ({
    brandId: item.brandId || defaultBrandId || '',
    name: item.name || '',
    categoryId: item.categoryId || '',
    sortOrder: String(item.sortOrder ?? 0),
    isActive: item.isActive ?? true,
    variants: (item.variants || []).map((v) => ({ id: v.id, name: v.name, fuelType: v.fuelType || '', transmission: v.transmission || '', seats: v.seats ? String(v.seats) : '', isActive: v.isActive })),
  }));
  const [errors, setErrors] = useState({});
  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/catalog/models`, body) : api.patch(`${ADMIN}/catalog/models/${item.id}`, body)), {
    success: isNew ? 'Model added' : 'Model saved',
    invalidate: [['catalog', 'models'], ['public', 'models']],
    toastError: false,
    onSuccess: onClose,
  });
  const setVariant = (i, patch) => setF((x) => ({ ...x, variants: x.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const submit = (e) => {
    e?.preventDefault();
    const next = {};
    if (!f.brandId) next.brandId = 'Choose the brand.';
    if (!f.name.trim()) next.name = 'Enter the model name.';
    if (!/^\d+$/.test(f.sortOrder)) next.sortOrder = 'Whole number.';
    f.variants.forEach((v, i) => {
      if (!v.name.trim()) next[`v${i}`] = 'Name each variant (or remove the row).';
      else if (v.seats && !(Number(v.seats) >= 2 && Number(v.seats) <= 12)) next[`v${i}`] = 'Seats must be 2–12.';
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      brandId: f.brandId,
      name: f.name.trim(),
      categoryId: f.categoryId || null,
      sortOrder: Number(f.sortOrder),
      isActive: f.isActive,
      variants: f.variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name.trim(), ...(v.fuelType ? { fuelType: v.fuelType } : {}), ...(v.transmission ? { transmission: v.transmission } : {}), ...(v.seats ? { seats: Number(v.seats) } : {}), isActive: v.isActive })),
    }, {
      onError: (err) => {
        const fe = fieldErrorMap(err);
        setErrors({ ...fe, form: Object.keys(fe).length ? null : err.status === 409 ? 'This brand already has a model with that name.' : errorMessage(err) });
      },
    });
  };
  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={isNew ? 'New model' : `Edit ${item.name}`}
      description="Hosts and admins pick the model and variant from this list when adding a car."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>{isNew ? 'Add model' : 'Save'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand" htmlFor="md-brand" required error={errors.brandId}>
            <Select id="md-brand" value={f.brandId} onChange={(e) => setF((x) => ({ ...x, brandId: e.target.value }))} invalid={Boolean(errors.brandId)}>
              <option value="">Choose…</option>
              {(brands || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Model name" htmlFor="md-name" required error={errors.name}>
            <Input id="md-name" value={f.name} maxLength={60} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} invalid={Boolean(errors.name)} data-autofocus />
          </Field>
          <Field label="Usual car type" htmlFor="md-cat" hint="Pre-selected for hosts; they can still change it.">
            <Select id="md-cat" value={f.categoryId} onChange={(e) => setF((x) => ({ ...x, categoryId: e.target.value }))}>
              <option value="">None</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Order" htmlFor="md-order" error={errors.sortOrder} hint="Lower numbers show first.">
            <Input id="md-order" type="number" min={0} value={f.sortOrder} onChange={(e) => setF((x) => ({ ...x, sortOrder: e.target.value }))} className="num" />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-label text-ink-800">Variants</legend>
          {f.variants.length ? (
            <div className="hidden grid-cols-[1.4fr_1fr_1fr_80px_70px_36px] gap-2 text-caption font-semibold text-ink-500 sm:grid">
              <span>Name</span><span>Fuel</span><span>Gearbox</span><span>Seats</span><span>Active</span><span />
            </div>
          ) : <p className="text-caption text-ink-500">No variants yet. Hosts can then type the variant themselves.</p>}
          {f.variants.map((v, i) => (
            <div key={v.id || `n${i}`}>
              <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1.4fr_1fr_1fr_80px_70px_36px]">
                <Input aria-label={`Variant ${i + 1} name`} placeholder="e.g. SX(O) Turbo" value={v.name} maxLength={60} onChange={(e) => setVariant(i, { name: e.target.value })} />
                <Select aria-label={`Variant ${i + 1} fuel`} value={v.fuelType} onChange={(e) => setVariant(i, { fuelType: e.target.value })}>
                  <option value="">Any fuel</option>
                  {Object.entries(FUEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
                <Select aria-label={`Variant ${i + 1} gearbox`} value={v.transmission} onChange={(e) => setVariant(i, { transmission: e.target.value })}>
                  <option value="">Any gearbox</option>
                  {Object.entries(TRANSMISSION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
                <Input aria-label={`Variant ${i + 1} seats`} type="number" min={2} max={12} placeholder="Seats" value={v.seats} onChange={(e) => setVariant(i, { seats: e.target.value })} className="num" />
                <Checkbox label="Active" checked={v.isActive} onChange={(e) => setVariant(i, { isActive: e.target.checked })} />
                <IconButton icon={Trash2} label={`Remove variant ${i + 1}`} onClick={() => setF((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))} />
              </div>
              {errors[`v${i}`] ? <p className="mt-1 text-caption font-semibold text-danger-600">{errors[`v${i}`]}</p> : null}
            </div>
          ))}
          <Button size="sm" icon={Plus} disabled={f.variants.length >= 40} onClick={() => setF((x) => ({ ...x, variants: [...x.variants, blankVariant()] }))}>Add variant</Button>
        </fieldset>
        <Switch label="Active" description="Inactive models are hidden from the host app." checked={f.isActive} onChange={(on) => setF((x) => ({ ...x, isActive: on }))} />
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

export function ModelsTab() {
  const brands = useCatalog('brands');
  const categories = useCatalog('categories');
  const [brandId, setBrandId] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['catalog', 'models'], queryFn: () => api.get(`${ADMIN}/catalog/models`) });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const remove = useAction((id) => api.del(`${ADMIN}/catalog/models/${id}`), { success: 'Model deleted', invalidate: [['catalog', 'models']], toastError: false });
  const brandName = new Map((brands.data || []).map((b) => [String(b.id), b.name]));
  const rows = (data || []).filter((m) => !brandId || String(m.brandId) === brandId);
  const columns = [
    { key: 'name', header: 'Model', cell: (m) => <button type="button" onClick={() => setEditing(m)} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{m.name}</button> },
    { key: 'brand', header: 'Brand', cell: (m) => brandName.get(String(m.brandId)) || '—' },
    { key: 'variants', header: 'Variants', cell: (m) => (m.variants.length ? <span className="text-caption text-ink-700">{m.variants.map((v) => v.name).join(', ')}</span> : <span className="text-caption text-ink-400">None</span>) },
    { key: 'status', header: 'Status', cell: (m) => <StatusPill tone={m.isActive ? 'success' : 'neutral'}>{m.isActive ? 'Active' : 'Inactive'}</StatusPill> },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
      cell: (m) => (
        <div className="flex justify-end gap-1">
          <IconButton size="sm" icon={Pencil} label={`Edit ${m.name}`} onClick={() => setEditing(m)} />
          <IconButton size="sm" icon={Trash2} label={`Delete ${m.name}`} onClick={() => setDeleting(m)} className="hover:text-danger-600" />
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <Field label="Brand" htmlFor="md-filter" className="w-56">
          <Select id="md-filter" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">All brands</option>
            {(brands.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New model</Button>
      </div>
      <DataTable columns={columns} rows={rows} loading={isLoading} error={error} onRetry={refetch} empty={<EmptyState icon={Tags} title="No models yet" description="Add models (and their variants) for each brand." />} />
      {editing ? <ModelForm key={editing.id || 'new'} item={editing} brands={brands.data} categories={categories.data} defaultBrandId={brandId} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name}?`} description="Refused if any car uses this model — deactivate it instead." confirmLabel="Delete" tone="danger" onConfirm={() => remove.mutateAsync(deleting.id)} />
    </>
  );
}

/** "22.7533, 75.8937" (as copied from Google Maps) → { lat, lng }. */
const parseCoords = (s) => {
  const m = String(s).match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
};

function LocationForm({ item, cities, defaultCityId, onClose }) {
  const isNew = !item.id;
  const [f, setF] = useState(() => ({
    cityId: item.cityId || defaultCityId || '',
    name: item.name || '',
    address: item.address || '',
    coords: item.point ? `${item.point.lat}, ${item.point.lng}` : '',
    pickup: item.kinds ? item.kinds.includes('pickup') : true,
    dropoff: item.kinds ? item.kinds.includes('dropoff') : true,
    instructions: item.instructions || '',
    sortOrder: String(item.sortOrder ?? 0),
    isActive: item.isActive ?? true,
  }));
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/catalog/locations`, body) : api.patch(`${ADMIN}/catalog/locations/${item.id}`, body)), {
    success: isNew ? 'Pickup point added' : 'Pickup point saved',
    invalidate: [['catalog', 'locations']],
    toastError: false,
    onSuccess: onClose,
  });
  const submit = (e) => {
    e?.preventDefault();
    const next = {};
    const pt = parseCoords(f.coords);
    if (!f.cityId) next.cityId = 'Choose the city.';
    if (f.name.trim().length < 2) next.name = 'Enter a name.';
    if (f.address.trim().length < 5) next.address = 'Enter the full address.';
    if (!pt) next.coords = 'Paste the coordinates, e.g. 22.7533, 75.8937.';
    if (!f.pickup && !f.dropoff) next.kinds = 'Allow pickup, drop-off or both.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      cityId: f.cityId, name: f.name.trim(), address: f.address.trim(), lat: pt.lat, lng: pt.lng,
      kinds: [f.pickup && 'pickup', f.dropoff && 'dropoff'].filter(Boolean), ...(f.instructions.trim() ? { instructions: f.instructions.trim() } : {}),
      sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive,
    }, { onError: (err) => setErrors({ ...fieldErrorMap(err), form: errorMessage(err) }) });
  };
  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={isNew ? 'New pickup / drop-off point' : `Edit ${item.name}`}
      description="Renters of WAY2CARS fleet cars can choose these points for pickup and return."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>{isNew ? 'Add point' : 'Save'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="lc-city" required error={errors.cityId}>
            <Select id="lc-city" value={f.cityId} onChange={set('cityId')} invalid={Boolean(errors.cityId)}>
              <option value="">Choose…</option>
              {(cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Name" htmlFor="lc-name" required error={errors.name}>
            <Input id="lc-name" value={f.name} maxLength={80} onChange={set('name')} placeholder="e.g. Vijay Nagar hub" invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Address" htmlFor="lc-address" required error={errors.address} className="sm:col-span-2">
            <Input id="lc-address" value={f.address} maxLength={300} onChange={set('address')} invalid={Boolean(errors.address)} />
          </Field>
          <Field label="Coordinates" htmlFor="lc-coords" required error={errors.coords} hint="In Google Maps, right-click the spot and click the numbers to copy them.">
            <Input id="lc-coords" value={f.coords} onChange={set('coords')} placeholder="22.7533, 75.8937" className="num" invalid={Boolean(errors.coords)} />
          </Field>
          <Field label="Order" htmlFor="lc-order" hint="Lower numbers show first.">
            <Input id="lc-order" type="number" min={0} value={f.sortOrder} onChange={set('sortOrder')} className="num" />
          </Field>
        </div>
        <div>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Pickup" checked={f.pickup} onChange={(e) => setF((x) => ({ ...x, pickup: e.target.checked }))} />
            <Checkbox label="Drop-off" checked={f.dropoff} onChange={(e) => setF((x) => ({ ...x, dropoff: e.target.checked }))} />
          </div>
          {errors.kinds ? <p className="mt-1 text-caption font-semibold text-danger-600">{errors.kinds}</p> : null}
        </div>
        <Field label="Instructions for renters" htmlFor="lc-ins">
          <Textarea id="lc-ins" rows={2} maxLength={300} value={f.instructions} onChange={set('instructions')} placeholder="e.g. Ask for the Way2Cars desk at gate 2." />
        </Field>
        <Switch label="Active" checked={f.isActive} onChange={(on) => setF((x) => ({ ...x, isActive: on }))} />
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

export function LocationsTab() {
  const cities = useCatalog('cities');
  const [cityId, setCityId] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['catalog', 'locations'], queryFn: () => api.get(`${ADMIN}/catalog/locations`) });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const remove = useAction((id) => api.del(`${ADMIN}/catalog/locations/${id}`), { success: 'Pickup point deleted', invalidate: [['catalog', 'locations']], toastError: false });
  const cityName = new Map((cities.data || []).map((c) => [String(c.id), c.name]));
  const rows = (data || []).filter((l) => !cityId || String(l.cityId) === cityId);
  const columns = [
    { key: 'name', header: 'Point', cell: (l) => <div><button type="button" onClick={() => setEditing(l)} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{l.name}</button><div className="text-caption text-ink-500">{l.address}</div></div> },
    { key: 'city', header: 'City', cell: (l) => cityName.get(String(l.cityId)) || '—' },
    { key: 'kinds', header: 'Use', cell: (l) => <div className="flex gap-1">{l.kinds.map((k) => <Tag key={k} tone="info">{k === 'pickup' ? 'Pickup' : 'Drop-off'}</Tag>)}</div> },
    { key: 'status', header: 'Status', cell: (l) => <StatusPill tone={l.isActive ? 'success' : 'neutral'}>{l.isActive ? 'Active' : 'Inactive'}</StatusPill> },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
      cell: (l) => (
        <div className="flex justify-end gap-1">
          <IconButton size="sm" icon={Pencil} label={`Edit ${l.name}`} onClick={() => setEditing(l)} />
          <IconButton size="sm" icon={Trash2} label={`Delete ${l.name}`} onClick={() => setDeleting(l)} className="hover:text-danger-600" />
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <Field label="City" htmlFor="lc-filter" className="w-56">
          <Select id="lc-filter" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">All cities</option>
            {(cities.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New pickup point</Button>
      </div>
      <DataTable columns={columns} rows={rows} loading={isLoading} error={error} onRetry={refetch} empty={<EmptyState icon={MapPin} title="No pickup points yet" description="Add Way2Cars hubs, airports or stations where renters can collect or return fleet cars." />} />
      {editing ? <LocationForm key={editing.id || 'new'} item={editing} cities={cities.data} defaultCityId={cityId} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name}?`} description="Existing bookings keep their saved address." confirmLabel="Delete" tone="danger" onConfirm={() => remove.mutateAsync(deleting.id)} />
    </>
  );
}

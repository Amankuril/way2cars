import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { FUEL, TRANSMISSION, FEATURES, INSURANCE } from '@/admin/lib/labels.js';
import { useCatalog, useDocumentTitle } from '@/admin/lib/hooks.js';
import { toPaise, toRupeesInput, errorMessage, istDateInput } from '@/admin/lib/utils.js';
import { useToast } from '@/admin/components/Toast.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Button, IconButton } from '@/admin/components/Button.jsx';
import { Field, Input, MoneyInput, Select, Textarea, Switch, Checkbox, AffixInput, FormSection, StickySaveBar } from '@/admin/components/Form.jsx';
import { ImageUpload, DocumentUpload } from '@/admin/components/FileUpload.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { DOCS } from './vehicleParts.jsx';

/**
 * Add a WAY2CARS fleet car, or edit any car (fleet or host). Admin edits never send a car back for
 * review. Details save first, then photos, then documents.
 */

const blank = {
  cityId: '', brandId: '', categoryId: '', model: '', variant: '', year: String(new Date().getFullYear()), registrationNumber: '', color: '',
  fuelType: 'petrol', transmission: 'manual', seats: '5', luggageBags: '2', rangeKm: '', features: [], description: '',
  address: '', area: '', pincode: '', lat: '', lng: '',
  hourly: '', daily: '', weekend: '', deposit: '', includedKm: '240', extraKm: '',
  deliveryEnabled: false, deliveryMaxKm: '10', instantBooking: true,
};

function fromVehicle(v) {
  return {
    cityId: v.city?.id || '', brandId: v.brand?.id || '', categoryId: v.category?.id || '', model: v.model || '', variant: v.variant || '', year: String(v.year || ''),
    registrationNumber: v.registrationNumber || '', color: v.color || '', fuelType: v.fuelType, transmission: v.transmission, seats: String(v.seats ?? ''), luggageBags: String(v.luggageBags ?? ''),
    rangeKm: v.rangeKm ? String(v.rangeKm) : '', features: v.features || [], description: v.description || '',
    address: v.location?.address || '', area: v.location?.area || '', pincode: v.location?.pincode || '', lat: String(v.location?.point?.lat ?? ''), lng: String(v.location?.point?.lng ?? ''),
    hourly: toRupeesInput(v.pricing?.hourlyPaise), daily: toRupeesInput(v.pricing?.dailyPaise), weekend: toRupeesInput(v.pricing?.weekendDailyPaise), deposit: toRupeesInput(v.pricing?.securityDepositPaise),
    includedKm: String(v.pricing?.includedKmPerDay ?? ''), extraKm: toRupeesInput(v.pricing?.extraKmChargePaise),
    deliveryEnabled: Boolean(v.delivery?.enabled), deliveryMaxKm: String(v.delivery?.maxKm ?? 10), instantBooking: Boolean(v.instantBooking),
  };
}

const docsFrom = (v) => Object.fromEntries(DOCS.map(({ key }) => {
  const d = v?.documents?.[key];
  return [key, { file: d?.fileId ? { id: d.fileId, name: 'Current file' } : null, number: d?.number || '', expiry: d?.expiry ? istDateInput(d.expiry) : '', provider: d?.provider || '', type: d?.type || 'comprehensive', changed: false }];
}));

export default function VehicleEdit() {
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Add fleet car' : 'Edit car');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cities = useCatalog('cities');
  const brands = useCatalog('brands');
  const categories = useCatalog('categories');
  const existing = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`${ADMIN}/vehicles/${id}`), enabled: !isNew });
  const [f, setF] = useState(blank);
  const [photos, setPhotos] = useState([]);
  const [docs, setDocs] = useState(docsFrom(null));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setF(fromVehicle(existing.data));
      setPhotos((existing.data.photoFiles || []).map((p) => ({ id: p.fileId, url: p.url })));
      setDocs(docsFrom(existing.data));
    }
  }, [existing.data]);

  if (!isNew && existing.isLoading) return <DetailSkeleton />;
  if (!isNew && existing.error) return <div className="panel"><ErrorState error={existing.error} onRetry={existing.refetch} /></div>;

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const setDoc = (key, patch) => setDocs((d) => ({ ...d, [key]: { ...d[key], ...patch, changed: true } }));
  const isEv = f.fuelType === 'electric';

  const validate = () => {
    const e = {};
    for (const k of ['cityId', 'brandId', 'categoryId']) if (!f[k]) e[k] = 'Choose one.';
    if (!f.model.trim()) e.model = 'Enter the model.';
    if (!/^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/.test(f.registrationNumber.toUpperCase().replace(/[\s-]/g, ''))) e.registrationNumber = 'e.g. MP09AB1234';
    if (f.address.trim().length < 5) e.address = 'Enter the pickup address.';
    if (!(Number(f.lat) >= -90 && Number(f.lat) <= 90) || f.lat === '') e.lat = 'Latitude, e.g. 22.7196';
    if (!(Number(f.lng) >= -180 && Number(f.lng) <= 180) || f.lng === '') e.lng = 'Longitude, e.g. 75.8577';
    const hourly = toPaise(f.hourly);
    const daily = toPaise(f.daily);
    if (!hourly || hourly < 1000) e.hourly = 'At least ₹10.';
    if (!daily || daily < 10000) e.daily = 'At least ₹100.';
    if (hourly && daily && hourly > daily) e.hourly = 'Cannot exceed the daily price.';
    if (toPaise(f.deposit) === null) e.deposit = 'Enter a deposit (0 for none).';
    if (toPaise(f.extraKm) === null) e.extraKm = 'Enter the extra-km charge.';
    if (f.pincode && !/^\d{6}$/.test(f.pincode)) e.pincode = 'Six digits.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const body = () => ({
    cityId: f.cityId, brandId: f.brandId, categoryId: f.categoryId, model: f.model.trim(), variant: f.variant.trim() || undefined, year: Number(f.year),
    registrationNumber: f.registrationNumber, color: f.color.trim() || undefined, fuelType: f.fuelType, transmission: f.transmission,
    seats: Number(f.seats), luggageBags: Number(f.luggageBags), rangeKm: isEv && f.rangeKm ? Number(f.rangeKm) : undefined, features: f.features, description: f.description.trim() || undefined,
    location: { address: f.address.trim(), area: f.area.trim() || undefined, pincode: f.pincode || undefined, lat: Number(f.lat), lng: Number(f.lng) },
    pricing: { hourlyPaise: toPaise(f.hourly), dailyPaise: toPaise(f.daily), weekendDailyPaise: f.weekend ? toPaise(f.weekend) : null, securityDepositPaise: toPaise(f.deposit), includedKmPerDay: Number(f.includedKm), extraKmChargePaise: toPaise(f.extraKm) },
    delivery: { enabled: f.deliveryEnabled, maxKm: Number(f.deliveryMaxKm) },
    instantBooking: f.instantBooking,
  });

  const docsBody = () => {
    const out = {};
    for (const { key } of DOCS) {
      const d = docs[key];
      if (!d.changed || !d.file) continue;
      const doc = { fileId: d.file.id, number: d.number.trim() || undefined, expiry: d.expiry ? new Date(`${d.expiry}T23:59:59+05:30`).toISOString() : undefined };
      if (key === 'insurance') Object.assign(doc, { provider: d.provider.trim(), type: d.type });
      out[key] = doc;
    }
    return out;
  };

  const save = async () => {
    setFormError(null);
    if (!validate()) return setFormError('Fix the highlighted fields.');
    const d = docsBody();
    if (d.insurance && (!d.insurance.provider || !d.insurance.expiry)) return setFormError('Insurance needs the provider and expiry date.');
    if (d.puc && !d.puc.expiry) return setFormError('PUC needs an expiry date.');
    setSaving(true);
    try {
      const saved = isNew ? await api.post(`${ADMIN}/vehicles`, body()) : await api.patch(`${ADMIN}/vehicles/${id}`, body());
      if (photos.length) await api.put(`${ADMIN}/vehicles/${saved.id}/photos`, { fileIds: photos.map((p) => p.id) });
      if (Object.keys(d).length) await api.put(`${ADMIN}/vehicles/${saved.id}/documents`, d);
      await Promise.all([qc.invalidateQueries({ queryKey: ['vehicle', saved.id] }), qc.invalidateQueries({ queryKey: ['vehicles'] })]);
      toast.success(isNew ? 'Fleet car added — publish it from the car page when it is ready' : 'Car updated');
      navigate(`/vehicles/${saved.id}`);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const options = (q) => (q.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>);
  const field = (k, label, input, extra = {}) => <Field label={label} htmlFor={`ve-${k}`} error={errors[k]} {...extra}>{input}</Field>;

  return (
    <>
      <PageHeader
        back={isNew ? { to: '/vehicles', label: 'Vehicles' } : { to: `/vehicles/${id}`, label: existing.data?.title || 'Car' }}
        title={isNew ? 'Add WAY2CARS fleet car' : `Edit ${existing.data?.title}`}
        description={isNew ? 'Company-owned car managed by WAY2CARS. It stays a draft until you publish it with photos and documents.' : existing.data?.ownership === 'company' ? 'WAY2CARS fleet car.' : 'Host car — your changes apply immediately and do not need host review.'}
      />
      <div className="panel px-5">
        <FormSection title="Car" description="As on the registration certificate.">
          <div className="grid gap-4 sm:grid-cols-3">
            {field('cityId', 'City', <Select id="ve-cityId" value={f.cityId} onChange={set('cityId')} invalid={Boolean(errors.cityId)}><option value="">Choose…</option>{options(cities)}</Select>)}
            {field('brandId', 'Brand', <Select id="ve-brandId" value={f.brandId} onChange={set('brandId')} invalid={Boolean(errors.brandId)}><option value="">Choose…</option>{options(brands)}</Select>)}
            {field('categoryId', 'Car type', <Select id="ve-categoryId" value={f.categoryId} onChange={set('categoryId')} invalid={Boolean(errors.categoryId)}><option value="">Choose…</option>{options(categories)}</Select>)}
            {field('model', 'Model', <Input id="ve-model" value={f.model} onChange={set('model')} maxLength={60} invalid={Boolean(errors.model)} />)}
            {field('variant', 'Variant', <Input id="ve-variant" value={f.variant} onChange={set('variant')} maxLength={60} />)}
            {field('year', 'Year', <Input id="ve-year" type="number" min={2005} max={new Date().getFullYear() + 1} value={f.year} onChange={set('year')} className="num" />)}
            {field('registrationNumber', 'Registration number', <Input id="ve-registrationNumber" value={f.registrationNumber} onChange={set('registrationNumber')} className="num uppercase" invalid={Boolean(errors.registrationNumber)} />)}
            {field('color', 'Colour', <Input id="ve-color" value={f.color} onChange={set('color')} maxLength={30} />)}
            {field('fuelType', 'Fuel', <Select id="ve-fuelType" value={f.fuelType} onChange={set('fuelType')}>{Object.entries(FUEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>)}
            {field('transmission', 'Transmission', <Select id="ve-transmission" value={f.transmission} onChange={set('transmission')}>{Object.entries(TRANSMISSION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>)}
            {field('seats', 'Seats', <Input id="ve-seats" type="number" min={2} max={12} value={f.seats} onChange={set('seats')} className="num" />)}
            {field('luggageBags', 'Luggage bags', <Input id="ve-luggageBags" type="number" min={0} max={10} value={f.luggageBags} onChange={set('luggageBags')} className="num" />)}
            {isEv ? field('rangeKm', 'Range per charge', <AffixInput id="ve-rangeKm" suffix="km" value={f.rangeKm} onChange={set('rangeKm')} />) : null}
          </div>
          <fieldset>
            <legend className="mb-2 text-label text-ink-800">Features</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(FEATURES).map(([k, label]) => (
                <Checkbox key={k} label={label} checked={f.features.includes(k)} onChange={(e) => setF((x) => ({ ...x, features: e.target.checked ? [...x.features, k] : x.features.filter((y) => y !== k) }))} />
              ))}
            </div>
          </fieldset>
          {field('description', 'Description', <Textarea id="ve-description" value={f.description} onChange={set('description')} maxLength={1500} rows={3} />)}
        </FormSection>

        <FormSection title="Pickup location" description="Must be inside the city's service area. Copy the coordinates from Google Maps (right-click the spot).">
          {field('address', 'Address', <Input id="ve-address" value={f.address} onChange={set('address')} maxLength={300} invalid={Boolean(errors.address)} />)}
          <div className="grid gap-4 sm:grid-cols-4">
            {field('area', 'Area', <Input id="ve-area" value={f.area} onChange={set('area')} maxLength={100} />)}
            {field('pincode', 'Pincode', <Input id="ve-pincode" value={f.pincode} onChange={set('pincode')} maxLength={6} className="num" invalid={Boolean(errors.pincode)} />)}
            {field('lat', 'Latitude', <Input id="ve-lat" inputMode="decimal" value={f.lat} onChange={set('lat')} className="num" invalid={Boolean(errors.lat)} />)}
            {field('lng', 'Longitude', <Input id="ve-lng" inputMode="decimal" value={f.lng} onChange={set('lng')} className="num" invalid={Boolean(errors.lng)} />)}
          </div>
        </FormSection>

        <FormSection title="Pricing" description="Trips are charged per 24 hours, with a trailing part-day charged hourly (capped at the day rate).">
          <div className="grid gap-4 sm:grid-cols-3">
            {field('hourly', 'Per hour', <MoneyInput id="ve-hourly" value={f.hourly} onChange={set('hourly')} invalid={Boolean(errors.hourly)} />)}
            {field('daily', 'Per day', <MoneyInput id="ve-daily" value={f.daily} onChange={set('daily')} invalid={Boolean(errors.daily)} />)}
            {field('weekend', 'Weekend per day', <MoneyInput id="ve-weekend" value={f.weekend} onChange={set('weekend')} />, { hint: 'Blank = same as weekdays.' })}
            {field('deposit', 'Security deposit', <MoneyInput id="ve-deposit" value={f.deposit} onChange={set('deposit')} invalid={Boolean(errors.deposit)} />)}
            {field('includedKm', 'Included distance', <AffixInput id="ve-includedKm" suffix="km/day" value={f.includedKm} onChange={set('includedKm')} className="[&_input]:pr-16" />)}
            {field('extraKm', 'Extra distance', <MoneyInput id="ve-extraKm" value={f.extraKm} onChange={set('extraKm')} invalid={Boolean(errors.extraKm)} />, { hint: 'Per km beyond the included distance.' })}
          </div>
          <Switch label="Instant booking" description="Confirmed as soon as the renter pays. Off: operations or the host accept each request." checked={f.instantBooking} onChange={set('instantBooking')} />
          <Switch label="Doorstep delivery" checked={f.deliveryEnabled} onChange={set('deliveryEnabled')} />
          {f.deliveryEnabled ? field('deliveryMaxKm', 'Deliver up to', <AffixInput id="ve-deliveryMaxKm" suffix="km" value={f.deliveryMaxKm} onChange={set('deliveryMaxKm')} className="sm:max-w-[200px]" />) : null}
        </FormSection>

        <FormSection title="Photos" description="At least 4 to publish. The first photo is the cover.">
          <div className="space-y-3">
            {photos.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <img src={p.url} alt={`Photo ${i + 1}`} className="h-16 w-24 rounded-sm border border-line object-cover" />
                <span className="text-caption text-ink-500">{i === 0 ? 'Cover' : `Photo ${i + 1}`}</span>
                <div className="ml-auto flex gap-1">
                  <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => setPhotos((ps) => { const n = [...ps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} />
                  <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === photos.length - 1} onClick={() => setPhotos((ps) => { const n = [...ps]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} />
                  <IconButton icon={Trash2} label="Remove photo" size="sm" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} />
                </div>
              </div>
            ))}
            {photos.length < 15 ? <ImageUpload key={photos.length} purpose="vehicle_photo" label="Add a photo" value={null} allowRemove={false} onChange={(img) => img && setPhotos((ps) => [...ps, img])} /> : null}
          </div>
        </FormSection>

        <FormSection title="Documents" description="Private — visible only to permitted admins. Upload a new file to replace one.">
          <div className="space-y-5">
            {DOCS.map(({ key, label }) => {
              const d = docs[key];
              if (key === 'puc' && isEv) return null;
              return (
                <div key={key} className="rounded-md border border-line p-4">
                  <p className="mb-3 text-label text-ink-900">{label}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DocumentUpload id={`doc-${key}`} purpose="vehicle_document" value={d.file} onChange={(file) => setDoc(key, { file })} />
                    <Field label="Number" htmlFor={`doc-${key}-num`}><Input id={`doc-${key}-num`} value={d.number} onChange={(e) => setDoc(key, { number: e.target.value })} maxLength={40} /></Field>
                    {key !== 'rc' ? <Field label="Valid until" htmlFor={`doc-${key}-exp`}><Input id={`doc-${key}-exp`} type="date" value={d.expiry} onChange={(e) => setDoc(key, { expiry: e.target.value })} className="num" /></Field> : null}
                    {key === 'insurance' ? (
                      <>
                        <Field label="Insurer" htmlFor="doc-ins-prov"><Input id="doc-ins-prov" value={d.provider} onChange={(e) => setDoc(key, { provider: e.target.value })} maxLength={80} /></Field>
                        <Field label="Cover" htmlFor="doc-ins-type"><Select id="doc-ins-type" value={d.type} onChange={(e) => setDoc(key, { type: e.target.value })}>{Object.entries(INSURANCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </FormSection>
      </div>
      <StickySaveBar dirty message={formError ? <span className="font-semibold text-danger-600" role="alert">{formError}</span> : undefined}>
        <Button onClick={() => navigate(isNew ? '/vehicles' : `/vehicles/${id}`)} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={saving}>{isNew ? 'Add car' : 'Save changes'}</Button>
      </StickySaveBar>
    </>
  );
}

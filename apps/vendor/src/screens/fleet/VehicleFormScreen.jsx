import { useMemo, useState } from 'react';
import { View, Pressable, Switch, FlatList } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, ChevronDown } from 'lucide-react-native';
import { Screen, Header, T, Field, Button, Chip, Section, Panel, Notice, Sheet, Loading, PlaceSearchSheet, useToast } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { FUEL, TRANSMISSION, FEATURES } from '@shared/lib/labels';
import { api } from '../../api';
import { useBrands, useCategories, useCities } from '../../hooks/queries';
import { useAuth } from '../../auth/AuthContext';

const rupees = (paise) => (paise === undefined || paise === null ? '' : String(paise / 100));
const paise = (r) => Math.round(Number(r || 0) * 100);
const YEARS = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() + 1 - i);

function fromVehicle(v, account) {
  if (!v) return { cityId: account?.cityId || null, brandId: null, categoryId: null, model: '', variant: '', year: new Date().getFullYear() - 1, registrationNumber: '', color: '', fuelType: 'petrol', transmission: 'manual', seats: 5, luggageBags: 2, rangeKm: '', features: ['ac'], description: '', location: null, area: '', pincode: '', hourly: '', daily: '', weekend: '', deposit: '3000', kmPerDay: '250', extraKm: '10', deliveryEnabled: false, deliveryMaxKm: '10', instantBooking: false };
  return {
    cityId: v.city?.id, brandId: v.brand?.id, categoryId: v.category?.id, model: v.model, variant: v.variant || '', year: v.year, registrationNumber: v.registrationNumber, color: v.color || '',
    fuelType: v.fuelType, transmission: v.transmission, seats: v.seats, luggageBags: v.luggageBags, rangeKm: v.rangeKm ? String(v.rangeKm) : '', features: v.features || [], description: v.description || '',
    location: v.location?.point ? { address: v.location.address, lat: v.location.point.lat, lng: v.location.point.lng, placeId: v.location.placeId } : null, area: v.location?.area || '', pincode: v.location?.pincode || '',
    hourly: rupees(v.pricing.hourlyPaise), daily: rupees(v.pricing.dailyPaise), weekend: rupees(v.pricing.weekendDailyPaise), deposit: rupees(v.pricing.securityDepositPaise), kmPerDay: String(v.pricing.includedKmPerDay), extraKm: rupees(v.pricing.extraKmChargePaise),
    deliveryEnabled: !!v.delivery?.enabled, deliveryMaxKm: String(v.delivery?.maxKm ?? 10), instantBooking: !!v.instantBooking,
  };
}

export function VehicleFormScreen({ route, navigation }) {
  const editId = route.params?.id;
  const qc = useQueryClient();
  const toast = useToast();
  const { account } = useAuth();
  const brands = useBrands();
  const categories = useCategories();
  const cities = useCities();
  const existing = useQuery({ queryKey: ['vehicle', editId], queryFn: () => api.get(`/api/v1/vendor/vehicles/${editId}`), enabled: !!editId });
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [sheet, setSheet] = useState(null); // brand | place | year
  const [brandQ, setBrandQ] = useState('');
  if (!f && (!editId || existing.data)) setF(fromVehicle(existing.data, account));
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const toggleFeature = (k) => setF((x) => ({ ...x, features: x.features.includes(k) ? x.features.filter((y) => y !== k) : [...x.features, k] }));
  const brandList = useMemo(() => (brands.data || []).filter((b) => b.name.toLowerCase().includes(brandQ.toLowerCase())), [brands.data, brandQ]);

  const body = () => ({
    cityId: f.cityId, brandId: f.brandId, categoryId: f.categoryId, model: f.model.trim(), variant: f.variant.trim() || undefined, year: f.year,
    registrationNumber: f.registrationNumber.trim().toUpperCase(), color: f.color.trim() || undefined, fuelType: f.fuelType, transmission: f.transmission,
    seats: f.seats, luggageBags: f.luggageBags, rangeKm: f.fuelType === 'electric' && f.rangeKm ? Number(f.rangeKm) : undefined, features: f.features, description: f.description.trim() || undefined,
    location: f.location ? { address: f.location.address, area: f.area.trim() || undefined, pincode: /^\d{6}$/.test(f.pincode) ? f.pincode : undefined, placeId: f.location.placeId, lat: f.location.lat, lng: f.location.lng } : undefined,
    pricing: { hourlyPaise: paise(f.hourly), dailyPaise: paise(f.daily), weekendDailyPaise: f.weekend ? paise(f.weekend) : null, securityDepositPaise: paise(f.deposit), includedKmPerDay: Number(f.kmPerDay || 0), extraKmChargePaise: paise(f.extraKm) },
    delivery: { enabled: f.deliveryEnabled, maxKm: Number(f.deliveryMaxKm || 0) },
    instantBooking: f.instantBooking,
  });
  const save = useMutation({
    mutationFn: () => (editId ? api.patch(`/api/v1/vendor/vehicles/${editId}`, body()) : api.post('/api/v1/vendor/vehicles', body())),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicle', v.id] });
      if (v.resubmittedForReview) toast('Saved. These changes need a quick re-review before the car is live again.', 'neutral');
      else toast(editId ? 'Changes saved' : 'Car added. Now add photos and documents.', 'success');
      if (editId) navigation.goBack(); else navigation.replace('Vehicle', { id: v.id });
    },
    onError: (e) => {
      const fe = e.fieldErrors || {};
      const mapped = {};
      for (const [k, msg] of Object.entries(fe)) mapped[{ 'pricing.hourlyPaise': 'hourly', 'pricing.dailyPaise': 'daily', 'pricing.weekendDailyPaise': 'weekend', 'pricing.securityDepositPaise': 'deposit', 'pricing.includedKmPerDay': 'kmPerDay', 'pricing.extraKmChargePaise': 'extraKm' }[k] || k.split('.')[0]] = msg;
      setErrors(mapped);
      toast(Object.keys(fe).length ? 'Please fix the highlighted fields' : e.message, 'danger');
    },
  });

  if (!f) return <Screen header={<Header title={editId ? 'Edit car' : 'Add a car'} />} scroll={false}><Loading /></Screen>;
  const brand = brands.data?.find((b) => b.id === f.brandId);
  const ready = f.cityId && f.brandId && f.categoryId && f.model.trim() && f.registrationNumber.trim().length >= 6 && f.location && Number(f.hourly) > 0 && Number(f.daily) > 0;

  return (
    <Screen header={<Header title={editId ? 'Edit car' : 'Add a car'} />} footer={<Button title={editId ? 'Save changes' : 'Save and continue'} size="lg" block disabled={!ready} loading={save.isPending} onPress={() => save.mutate()} />}>
      {editId && existing.data?.approval?.status === 'approved' ? <Notice tone="warning" className="mx-4 mt-4">Changing brand, model, year, registration, fuel, transmission, seats, city or location sends the car for re-review (it’s hidden until approved).</Notice> : null}

      <Section title="The car" first={!editId}>
        <Panel>
          <Field label="Brand" value={brand?.name || ''} placeholder="Select brand" onPress={() => setSheet('brand')} suffix={<ChevronDown size={18} color={colors.ink[400]} />} error={errors.brandId} />
          <View className="flex-row"><Field className="mr-3 flex-1" label="Model" value={f.model} onChangeText={set('model')} placeholder="Creta" error={errors.model} /><Field className="flex-1" label="Variant" value={f.variant} onChangeText={set('variant')} placeholder="SX (O)" /></View>
          <View className="flex-row">
            <Field className="mr-3 flex-1" label="Year" value={String(f.year)} onPress={() => setSheet('year')} suffix={<ChevronDown size={18} color={colors.ink[400]} />} />
            <Field className="flex-1" label="Colour" value={f.color} onChangeText={set('color')} placeholder="White" />
          </View>
          <Field label="Registration number" value={f.registrationNumber} onChangeText={(t) => set('registrationNumber')(t.toUpperCase())} autoCapitalize="characters" placeholder="MH12AB1234" error={errors.registrationNumber} />
          <T variant="label" tone="muted" className="mb-2">Type</T>
          <View className="mb-3 flex-row flex-wrap">{(categories.data || []).map((c) => <Chip key={c.id} label={c.name} className="mb-2" selected={f.categoryId === c.id} onPress={() => set('categoryId')(c.id)} />)}</View>
          <T variant="label" tone="muted" className="mb-2">Fuel</T>
          <View className="mb-3 flex-row flex-wrap">{Object.entries(FUEL).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={f.fuelType === k} onPress={() => set('fuelType')(k)} />)}</View>
          {f.fuelType === 'electric' ? <Field label="Range per charge (km)" value={f.rangeKm} onChangeText={(t) => set('rangeKm')(t.replace(/\D/g, ''))} keyboardType="number-pad" /> : null}
          <T variant="label" tone="muted" className="mb-2">Transmission</T>
          <View className="mb-3 flex-row">{Object.entries(TRANSMISSION).map(([k, l]) => <Chip key={k} label={l} selected={f.transmission === k} onPress={() => set('transmission')(k)} />)}</View>
          <T variant="label" tone="muted" className="mb-2">Seats</T>
          <View className="mb-3 flex-row flex-wrap">{[4, 5, 6, 7, 8].map((n) => <Chip key={n} label={String(n)} className="mb-2" selected={f.seats === n} onPress={() => set('seats')(n)} />)}</View>
          <T variant="label" tone="muted" className="mb-2">Luggage (bags)</T>
          <View className="flex-row flex-wrap">{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} className="mb-2" selected={f.luggageBags === n} onPress={() => set('luggageBags')(n)} />)}</View>
        </Panel>
      </Section>

      <Section title="Where renters pick it up">
        <Panel>
          <T variant="label" tone="muted" className="mb-2">City</T>
          <View className="mb-3 flex-row flex-wrap">{(cities.data || []).map((c) => <Chip key={c.id} label={c.name} className="mb-2" selected={f.cityId === c.id} onPress={() => set('cityId')(c.id)} />)}</View>
          <Pressable onPress={() => setSheet('place')} className="mb-4 flex-row items-center rounded-md border border-ink-200 p-3 active:bg-ink-50" accessibilityRole="button">
            <MapPin size={18} color={colors.brand[600]} />
            <T variant="bodySm" className="ml-2 flex-1" numberOfLines={2}>{f.location?.address || 'Search the exact pickup address'}</T>
            <T variant="label" tone="brand">{f.location ? 'Change' : 'Search'}</T>
          </Pressable>
          {errors.location ? <T variant="caption" tone="danger" className="-mt-2 mb-3">{errors.location}</T> : null}
          <View className="flex-row"><Field className="mr-3 flex-1" label="Area / locality" value={f.area} onChangeText={set('area')} hint="Shown to renters before booking" /><Field className="flex-1" label="PIN code" value={f.pincode} onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" /></View>
          <T variant="caption" tone="subtle">The exact address is shared only after a booking is confirmed.</T>
        </Panel>
      </Section>

      <Section title="Pricing">
        <Panel>
          <View className="flex-row"><Field className="mr-3 flex-1" label="Per hour (₹)" value={f.hourly} onChangeText={(t) => set('hourly')(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.hourly} /><Field className="flex-1" label="Per day (₹)" value={f.daily} onChangeText={(t) => set('daily')(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.daily} /></View>
          <Field label="Weekend day rate (₹, optional)" value={f.weekend} onChangeText={(t) => set('weekend')(t.replace(/\D/g, ''))} keyboardType="number-pad" hint="Applies to Saturdays and Sundays" error={errors.weekend} />
          <Field label="Security deposit (₹)" value={f.deposit} onChangeText={(t) => set('deposit')(t.replace(/\D/g, ''))} keyboardType="number-pad" hint="Refunded to the renter after the trip, minus extra charges" error={errors.deposit} />
          <View className="flex-row"><Field className="mr-3 flex-1" label="Free km per day" value={f.kmPerDay} onChangeText={(t) => set('kmPerDay')(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.kmPerDay} /><Field className="flex-1" label="Extra km (₹/km)" value={f.extraKm} onChangeText={(t) => set('extraKm')(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" error={errors.extraKm} /></View>
          <T variant="caption" tone="subtle">Trips longer than a few hours are charged per day; partial days are charged hourly, capped at the day rate. Set special prices for festivals in the pricing calendar.</T>
        </Panel>
      </Section>

      <Section title="Options">
        <Panel padded={false}>
          <View className="flex-row items-center border-b border-line px-4 py-3.5">
            <View className="mr-3 flex-1"><T variant="body" className="font-semibold">Instant booking</T><T variant="caption" tone="subtle">Renters book without waiting for your approval</T></View>
            <Switch value={f.instantBooking} onValueChange={set('instantBooking')} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={f.instantBooking ? colors.brand[500] : '#fff'} />
          </View>
          <View className="flex-row items-center px-4 py-3.5">
            <View className="mr-3 flex-1"><T variant="body" className="font-semibold">Doorstep delivery</T><T variant="caption" tone="subtle">Deliver and collect at the renter’s address (fee paid by renter)</T></View>
            <Switch value={f.deliveryEnabled} onValueChange={set('deliveryEnabled')} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={f.deliveryEnabled ? colors.brand[500] : '#fff'} />
          </View>
          {f.deliveryEnabled ? <View className="px-4"><Field label="Deliver within (km)" value={f.deliveryMaxKm} onChangeText={(t) => set('deliveryMaxKm')(t.replace(/\D/g, ''))} keyboardType="number-pad" /></View> : null}
        </Panel>
      </Section>

      <Section title="Features">
        <View className="flex-row flex-wrap px-4">{Object.entries(FEATURES).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={f.features.includes(k)} onPress={() => toggleFeature(k)} />)}</View>
      </Section>

      <Section title="Description">
        <View className="px-4"><Field multiline value={f.description} onChangeText={(t) => set('description')(t.slice(0, 1500))} placeholder="Condition, recent service, anything renters should know" /></View>
      </Section>

      <Sheet visible={sheet === 'brand'} onClose={() => setSheet(null)} title="Brand">
        <View className="px-5"><Field placeholder="Search brands" value={brandQ} onChangeText={setBrandQ} /></View>
        <FlatList style={{ maxHeight: 360 }} data={brandList} keyExtractor={(b) => b.id} keyboardShouldPersistTaps="handled" renderItem={({ item }) => (
          <Pressable onPress={() => { set('brandId')(item.id); setSheet(null); }} className="px-5 py-3.5 active:bg-ink-50"><T variant="body" className={f.brandId === item.id ? 'font-bold text-brand-700' : ''}>{item.name}</T></Pressable>
        )} />
      </Sheet>
      <Sheet visible={sheet === 'year'} onClose={() => setSheet(null)} title="Model year">
        <View className="flex-row flex-wrap px-5 pb-4">{YEARS.map((y) => <Chip key={y} label={String(y)} className="mb-2" selected={f.year === y} onPress={() => { set('year')(y); setSheet(null); }} />)}</View>
      </Sheet>
      <PlaceSearchSheet visible={sheet === 'place'} onClose={() => setSheet(null)} title="Pickup address" allowCurrentLocation onSelect={(p) => setF((x) => ({ ...x, location: p, pincode: x.pincode || p.pincode || '', area: x.area || (p.address || '').split(',').slice(-4, -3)[0]?.trim() || '' }))} />
    </Screen>
  );
}

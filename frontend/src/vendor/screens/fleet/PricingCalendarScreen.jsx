import { useState } from 'react';
import { View } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen, Header, T, Button, Field, Loading, ErrorState, Sheet, Notice, useToast } from '@/mobile/ui';
import { money } from '../../lib';
import { api } from '../../api';
import { MonthGrid, Legend } from '../../components/MonthGrid';

/** Special daily prices for chosen dates (festivals, long weekends). Tap dates to select. */
export function PricingCalendarScreen({ route }) {
  const { id } = route.params;
  // Web: title/dailyPaise come from the route (query string, so coerce); a pasted link without them reads the car.
  const vehicle = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`/api/v1/vendor/vehicles/${id}`), enabled: !route.params.title || !route.params.dailyPaise });
  const title = route.params.title || vehicle.data?.title;
  const dailyPaise = Number(route.params.dailyPaise) || vehicle.data?.pricing?.dailyPaise || 0;
  const qc = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState([]);
  const [sheet, setSheet] = useState(false);
  const [price, setPrice] = useState('');
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const q = useQuery({ queryKey: ['calendar', id, from.toISOString()], queryFn: () => api.get(`/api/v1/vendor/vehicles/${id}/calendar`, { from: from.toISOString(), to: to.toISOString() }) });
  const overrides = new Map((q.data?.priceOverrides || []).map((o) => [o.date, o]));
  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar', id] });

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/vendor/vehicles/${id}/pricing-calendar`, { entries: selected.map((date) => ({ date, dailyPaise: Math.round(Number(price) * 100) })) }),
    onSuccess: () => { setSheet(false); setSelected([]); setPrice(''); invalidate(); toast('Prices updated', 'success'); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const clear = useMutation({
    mutationFn: async () => { for (const d of selected.filter((x) => overrides.has(x))) await api.del(`/api/v1/vendor/vehicles/${id}/pricing-calendar/${d}`); },
    onSuccess: () => { setSheet(false); setSelected([]); invalidate(); toast('Back to regular prices'); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const toggle = (k) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <Screen header={<Header title="Pricing calendar" subtitle={title} />} footer={<Button title={selected.length ? `Set price for ${selected.length} date${selected.length > 1 ? 's' : ''}` : 'Select dates'} block disabled={!selected.length} onPress={() => setSheet(true)} />}>
      <T variant="bodySm" tone="muted" className="mx-4 mb-3 mt-4">Regular day rate: {money(dailyPaise)}. Special prices replace the regular and weekend rate on those dates; hourly rates scale automatically.</T>
      {q.isLoading ? <Loading full={false} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <MonthGrid month={month} onMonthChange={(m) => { setMonth(m); setSelected([]); }} disablePast selected={selected} onPressDay={toggle}
          decorate={(k) => (overrides.has(k) ? { tone: 'priced', label: `₹${Math.round(overrides.get(k).dailyPaise / 100)}` } : {})} />
      )}
      <Legend items={[['bg-accent-50', 'Special price'], ['bg-brand-500', 'Selected']]} />
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Special price" footer={
        <View className="flex-row">
          {selected.some((d) => overrides.has(d)) ? <Button title="Reset to regular" variant="secondary" className="mr-3 flex-1" loading={clear.isPending} onPress={() => clear.mutate()} /> : null}
          <Button title="Save price" className="flex-1" disabled={!(Number(price) >= 100)} loading={save.isPending} onPress={() => save.mutate()} />
        </View>
      }>
        <View className="px-5 pb-3">
          <T variant="bodySm" tone="muted" className="mb-3">{selected.length} date{selected.length > 1 ? 's' : ''} selected: {selected.slice().sort().slice(0, 6).join(', ')}{selected.length > 6 ? '…' : ''}</T>
          <Field label="Day rate (₹)" value={price} onChangeText={(t) => setPrice(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={String(dailyPaise / 100)} />
          <Notice tone="info">Bookings already made keep the price they were booked at.</Notice>
        </View>
      </Sheet>
    </Screen>
  );
}

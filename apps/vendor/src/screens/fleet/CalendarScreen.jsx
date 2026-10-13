import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Lock, Trash2, CalendarPlus } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, Sheet, Chip, Field, Loading, ErrorState, ListItem, IconButton, Notice, Confirm, useToast } from '@shared/native';
import { BOOKING_STATUS } from '@shared/lib/labels';
import { dateTime } from '../../lib';
import { api } from '../../api';
import { MonthGrid, Legend } from '../../components/MonthGrid';

const istKey = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
const roundHalf = (d) => new Date(Math.round(d.getTime() / 1800000) * 1800000);
function pick(value, min, cb) {
  DateTimePickerAndroid.open({ value, mode: 'date', minimumDate: min, onChange: (e, d) => {
    if (e.type !== 'set' || !d) return;
    DateTimePickerAndroid.open({ value: d, mode: 'time', onChange: (e2, t) => e2.type === 'set' && t && cb(roundHalf(t)) });
  } });
}

/** Bookings and blocked periods for a car; hosts add/remove blocks (server rejects overlaps with bookings). */
export function CalendarScreen({ route }) {
  const { id, title } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [block, setBlock] = useState({ startAt: null, endAt: null, reason: 'personal', note: '' });
  const [removing, setRemoving] = useState(null);
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const q = useQuery({ queryKey: ['calendar', id, from.toISOString()], queryFn: () => api.get(`/api/v1/vendor/vehicles/${id}/calendar`, { from: from.toISOString(), to: to.toISOString() }) });

  const marks = useMemo(() => {
    const m = new Map();
    const paint = (start, end, tone) => {
      for (let t = new Date(start).getTime(); t < new Date(end).getTime(); t += 86400000 / 2) m.set(istKey(t), m.get(istKey(t)) === 'booked' ? 'booked' : tone);
      m.set(istKey(new Date(end).getTime() - 1), m.get(istKey(new Date(end).getTime() - 1)) === 'booked' ? 'booked' : tone);
    };
    for (const b of q.data?.blocks || []) paint(b.startAt, b.endAt, 'blocked');
    for (const b of q.data?.bookings || []) paint(b.startAt, b.endAt, 'booked');
    return m;
  }, [q.data]);
  const onDay = (k) => setDay(k);
  const dayItems = day ? [
    ...(q.data?.bookings || []).filter((b) => istKey(b.startAt) <= day && istKey(new Date(b.endAt).getTime() - 1) >= day).map((b) => ({ kind: 'booking', ...b })),
    ...(q.data?.blocks || []).filter((b) => istKey(b.startAt) <= day && istKey(new Date(b.endAt).getTime() - 1) >= day).map((b) => ({ kind: 'block', ...b })),
  ] : [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar', id] });
  const add = useMutation({
    mutationFn: () => api.post(`/api/v1/vendor/vehicles/${id}/blocks`, { startAt: block.startAt.toISOString(), endAt: block.endAt.toISOString(), reason: block.reason, note: block.note.trim() || undefined }),
    onSuccess: () => { setSheet(false); toast('Dates blocked', 'success'); invalidate(); },
    onError: (e) => toast(e.code === 'BLOCK_CONFLICTS_BOOKING' ? `Overlaps booking ${e.details?.bookings?.map((b) => b.ref).join(', ')}` : e.message, 'danger'),
  });
  const del = useMutation({ mutationFn: (blockId) => api.del(`/api/v1/vendor/vehicles/${id}/blocks/${blockId}`), onSuccess: () => { setRemoving(null); invalidate(); toast('Block removed'); }, onError: (e) => toast(e.message, 'danger') });

  return (
    <Screen header={<Header title="Availability" subtitle={title} />} footer={<Button title="Block dates" icon={Lock} block onPress={() => { setBlock({ startAt: null, endAt: null, reason: 'personal', note: '' }); setSheet(true); }} />}>
      <View className="pt-4">
        {q.isLoading ? <Loading full={false} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
          <MonthGrid month={month} onMonthChange={(m) => { setMonth(m); setDay(null); }} decorate={(k) => ({ tone: marks.get(k) })} selected={day ? [day] : []} onPressDay={onDay} />
        )}
        <Legend items={[['bg-brand-100', 'Booked'], ['bg-ink-200', 'Blocked by you']]} />
      </View>
      {day ? (
        <Section title={new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}>
          {dayItems.length ? (
            <Panel padded={false}>
              {dayItems.map((it, i) => it.kind === 'booking' ? (
                <ListItem key={`b${it.id}`} icon={CalendarPlus} title={`Booking ${it.ref}`} subtitle={`${dateTime(it.startAt)} → ${dateTime(it.endAt)} · ${BOOKING_STATUS[it.status]?.label}`} last={i === dayItems.length - 1} />
              ) : (
                <ListItem key={`k${it.id}`} icon={Lock} iconTone="neutral" title={`Blocked · ${it.reason}`} subtitle={`${dateTime(it.startAt)} → ${dateTime(it.endAt)}${it.note ? ` · ${it.note}` : ''}`} right={<IconButton icon={Trash2} label="Remove block" onPress={() => setRemoving(it.id)} />} chevron={false} last={i === dayItems.length - 1} />
              ))}
            </Panel>
          ) : <T variant="bodySm" tone="subtle" className="px-4">Free all day.</T>}
        </Section>
      ) : <T variant="caption" tone="subtle" className="mx-4 mt-4">Tap a day to see bookings and blocks.</T>}

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Block dates" footer={<Button title="Block these dates" block disabled={!block.startAt || !block.endAt || block.endAt <= block.startAt} loading={add.isPending} onPress={() => add.mutate()} />}>
        <View className="px-5 pb-3">
          <Field label="From" value={block.startAt ? dateTime(block.startAt) : ''} placeholder="Select start" onPress={() => pick(block.startAt || new Date(), new Date(), (d) => setBlock((b) => ({ ...b, startAt: d, endAt: b.endAt && b.endAt > d ? b.endAt : new Date(d.getTime() + 86400000) })))} />
          <Field label="Until" value={block.endAt ? dateTime(block.endAt) : ''} placeholder="Select end" onPress={() => pick(block.endAt || block.startAt || new Date(), block.startAt || new Date(), (d) => setBlock((b) => ({ ...b, endAt: d })))} />
          <View className="mb-3 flex-row">{[['personal', 'Personal use'], ['maintenance', 'Maintenance'], ['other', 'Other']].map(([k, l]) => <Chip key={k} label={l} selected={block.reason === k} onPress={() => setBlock((b) => ({ ...b, reason: k }))} />)}</View>
          <Field label="Note (optional)" value={block.note} onChangeText={(t) => setBlock((b) => ({ ...b, note: t.slice(0, 200) }))} />
          <Notice tone="info">You can’t block dates that already have a booking.</Notice>
        </View>
      </Sheet>
      <Confirm visible={!!removing} title="Remove this block?" message="The car becomes bookable for these dates again." confirmLabel="Remove" onCancel={() => setRemoving(null)} onConfirm={() => del.mutate(removing)} loading={del.isPending} />
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { View, Pressable } from '@/mobile/rn';
import { DateTimePickerAndroid } from '@/mobile/app/datetime';
import { CalendarDays } from 'lucide-react';
import { Sheet, T, Button, Chip } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { dayLabel, timeLabel, duration, nextHalfHour } from '@shared/lib/format';

const QUICK = [
  { label: '6 hrs', hours: 6 }, { label: '12 hrs', hours: 12 }, { label: '1 day', hours: 24 },
  { label: '2 days', hours: 48 }, { label: '3 days', hours: 72 }, { label: '1 week', hours: 168 },
];
const roundHalf = (d) => {
  const step = 30 * 60000;
  return new Date(Math.round(d.getTime() / step) * step);
};

/** Opens the native date dialog, then the time dialog. Resolves a Date or null. */
function pickDateTime(value, minimumDate) {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value, mode: 'date', minimumDate,
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return resolve(null);
        DateTimePickerAndroid.open({
          value: date, mode: 'time', is24Hour: false,
          onChange: (e2, time) => resolve(e2.type === 'set' && time ? roundHalf(time) : null),
        });
      },
    });
  });
}

export function TripTimesSheet({ visible, onClose, startAt, endAt, onApply, minLeadMinutes = 60, minHours = 4 }) {
  const [start, setStart] = useState(startAt);
  const [end, setEnd] = useState(endAt);
  const [error, setError] = useState(null);
  useEffect(() => { if (visible) { setStart(startAt); setEnd(endAt); setError(null); } }, [visible, startAt, endAt]);

  const earliest = nextHalfHour(new Date(), minLeadMinutes);
  const hours = (end - start) / 3600000;

  const choose = async (which) => {
    const d = await pickDateTime(which === 'start' ? start : end, which === 'start' ? earliest : start);
    if (!d) return;
    if (which === 'start') {
      const len = end - start;
      setStart(d);
      setEnd(new Date(d.getTime() + Math.max(len, minHours * 3600000)));
    } else setEnd(d);
    setError(null);
  };

  const apply = () => {
    if (start < earliest) return setError(`Pickup must be at least ${minLeadMinutes} minutes from now.`);
    if (hours < minHours) return setError(`Trips must be at least ${minHours} hours long.`);
    onApply(start, end);
    onClose();
  };

  const Slot = ({ title, value, onPress }) => (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-1 rounded-md border border-ink-200 p-3 active:bg-ink-50">
      <T variant="overline" tone="subtle">{title}</T>
      <T variant="body" className="mt-1 font-bold">{dayLabel(value)}</T>
      <T variant="bodySm" tone="muted">{timeLabel(value)}</T>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="When do you need the car?" footer={<Button title={`Apply · ${duration(start, end)}`} block size="lg" onPress={apply} />}>
      <View className="px-5 pb-2">
        <View className="flex-row">
          <Slot title="Pickup" value={start} onPress={() => choose('start')} />
          <View className="w-3" />
          <Slot title="Return" value={end} onPress={() => choose('end')} />
        </View>
        <T variant="label" tone="muted" className="mb-2 mt-5">Trip length</T>
        <View className="flex-row flex-wrap">
          {QUICK.map((q) => <Chip key={q.label} label={q.label} className="mb-2" selected={Math.round(hours) === q.hours} onPress={() => { setEnd(new Date(start.getTime() + q.hours * 3600000)); setError(null); }} />)}
        </View>
        {error ? <T variant="bodySm" tone="danger" className="mt-2">{error}</T> : (
          <View className="mt-2 flex-row items-center">
            <CalendarDays size={14} color={colors.ink[500]} />
            <T variant="caption" tone="subtle" className="ml-1.5">Times are in 30-minute steps (IST).</T>
          </View>
        )}
      </View>
    </Sheet>
  );
}

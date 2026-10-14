import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { Sheet, T, Button, Chip, Card, CarArt } from '@shared/native';
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

/** A starting point for the pickers when no times are chosen yet: next half hour after the lead time (not before 7 AM), 1 day. */
export function suggestTimes(minLeadMinutes = 60) {
  const start = nextHalfHour(new Date(), minLeadMinutes);
  if (start.getHours() < 7) start.setHours(9, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 24 * 3600000) };
}

/** TripRoute props for the plan's times — placeholders while they're not chosen yet. */
export function tripRoute(startAt, endAt) {
  if (!startAt || !endAt) {
    return {
      start: { overline: 'Pickup', title: 'Select date', subtitle: 'and time' },
      end: { overline: 'Return', title: 'Select date', subtitle: 'and time' },
    };
  }
  return {
    start: { overline: 'Pickup', title: dayLabel(startAt), subtitle: timeLabel(startAt) },
    end: { overline: 'Return', title: dayLabel(endAt), subtitle: timeLabel(endAt) },
    label: duration(startAt, endAt),
  };
}

/** One-line trip summary for headers: "Sat, 14 Oct, 9:00 AM → Sun, 15 Oct, 9:00 AM · 1 day". */
export function tripSummary(startAt, endAt) {
  if (!startAt || !endAt) return 'Add your trip dates';
  return `${dayLabel(startAt)}, ${timeLabel(startAt)} → ${dayLabel(endAt)}, ${timeLabel(endAt)} · ${duration(startAt, endAt)}`;
}

/** Shown instead of results / prices until the renter has picked trip times. */
export function TripTimesPrompt({ title = 'When do you need the car?', message = 'Pick your pickup and return times to see cars that are free.', onPress, className }) {
  return (
    <View className={className} testID="trip-times-prompt">
      <Card className="mx-4 items-center overflow-hidden px-6 pb-6 pt-8">
        <View className="items-center">
          <CarArt still />
          <View className="mt-1 h-1.5 w-44 rounded-full bg-ink-100" />
        </View>
        <View className="absolute right-5 top-5 h-10 w-10 items-center justify-center rounded-full bg-brand-50"><CalendarDays size={20} color={colors.brand[600]} /></View>
        <T variant="headline" className="mt-5 text-center">{title}</T>
        <T variant="bodySm" tone="muted" className="mt-1.5 text-center">{message}</T>
        <View className="mt-5">
          <Button title="Choose dates" icon={CalendarDays} onPress={onPress} testID="choose-dates" />
        </View>
      </Card>
    </View>
  );
}

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
  // No times yet: the pickers start on a suggestion, but nothing is applied until the renter confirms.
  const [start, setStart] = useState(() => startAt || suggestTimes(minLeadMinutes).start);
  const [end, setEnd] = useState(() => endAt || suggestTimes(minLeadMinutes).end);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!visible) return;
    const s = startAt && endAt ? null : suggestTimes(minLeadMinutes);
    setStart(s ? s.start : startAt);
    setEnd(s ? s.end : endAt);
    setError(null);
  }, [visible, startAt, endAt]); // eslint-disable-line react-hooks/exhaustive-deps

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

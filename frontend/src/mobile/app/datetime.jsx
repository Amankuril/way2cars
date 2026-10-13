/**
 * @react-native-community/datetimepicker's imperative Android API for the web:
 *
 *   DateTimePickerAndroid.open({ value, mode: 'date' | 'time', minimumDate, maximumDate, is24Hour, minuteInterval,
 *                                onChange: (event, date) => {} })
 *   event.type === 'set' | 'dismissed'   (exactly like Android)
 *
 * Renders a bottom sheet in the app's look: calendar (tap the month title for a year list) or an
 * hour/minute grid. Chained calls (date → time inside onChange) work as on Android.
 * DatePickerHost is mounted once by MobileFrame.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { View, Pressable, ScrollView } from '../rn';
import { Sheet } from '../ui/Feedback';
import { T } from '../ui/Text';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { colors } from '@shared/theme/tokens';

let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const DateTimePickerAndroid = {
  open(params) {
    current = { ...params, id: Math.random().toString(36).slice(2) };
    emit();
  },
  dismiss() {
    if (!current) return;
    const req = current;
    current = null;
    emit();
    req.onChange?.({ type: 'dismissed', nativeEvent: {} }, undefined);
  },
};

/** Declarative <DateTimePicker> is not used by the apps; render nothing (use DateTimePickerAndroid.open). */
export default function DateTimePicker() {
  return null;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const headerDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Calendar({ value, min, max, onPick }) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const [years, setYears] = useState(false);
  const minDay = min ? startOfDay(min) : null;
  const maxDay = max ? startOfDay(max) : null;
  const today = new Date();
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  }, [view]);
  const prevOk = !minDay || new Date(view.getFullYear(), view.getMonth(), 0) >= minDay;
  const nextOk = !maxDay || new Date(view.getFullYear(), view.getMonth() + 1, 1) <= maxDay;
  const y0 = minDay ? minDay.getFullYear() : today.getFullYear() - 100;
  const y1 = maxDay ? maxDay.getFullYear() : today.getFullYear() + 10;

  if (years) {
    const list = [];
    for (let y = y1; y >= y0; y -= 1) list.push(y);
    return (
      <ScrollView className="max-h-[300px]" contentContainerClassName="flex-row flex-wrap px-3 pb-2">
        {list.map((y) => (
          <Pressable key={y} onPress={() => { setView(new Date(y, view.getMonth(), 1)); setYears(false); }} className="w-1/4 items-center py-1.5" accessibilityRole="button">
            <View className={cn('h-9 w-16 items-center justify-center rounded-full', y === view.getFullYear() ? 'bg-brand-500' : 'active:bg-ink-100')}>
              <T variant="label" tone={y === view.getFullYear() ? 'inverse' : 'default'}>{y}</T>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    );
  }
  return (
    <View className="px-3">
      <View className="mb-1 flex-row items-center justify-between">
        <Pressable onPress={() => setYears(true)} className="h-10 flex-row items-center rounded-md px-2 active:bg-ink-100" accessibilityLabel="Choose year">
          <T variant="label">{MONTHS[view.getMonth()]} {view.getFullYear()}</T>
        </Pressable>
        <View className="flex-row">
          <Pressable disabled={!prevOk} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className={cn('h-10 w-10 items-center justify-center rounded-full active:bg-ink-100', !prevOk && 'opacity-30')} accessibilityLabel="Previous month">
            <ChevronLeft size={20} color={colors.ink[700]} />
          </Pressable>
          <Pressable disabled={!nextOk} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className={cn('h-10 w-10 items-center justify-center rounded-full active:bg-ink-100', !nextOk && 'opacity-30')} accessibilityLabel="Next month">
            <ChevronRight size={20} color={colors.ink[700]} />
          </Pressable>
        </View>
      </View>
      <View className="flex-row">
        {WEEK.map((d, i) => <T key={i} variant="caption" tone="subtle" className="flex-1 py-1 text-center">{d}</T>)}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%` }} className="h-11" />;
          const disabled = (minDay && d < minDay) || (maxDay && d > maxDay);
          const selected = sameDay(d, value);
          const isToday = sameDay(d, today);
          return (
            <Pressable key={d.getDate()} disabled={disabled} onPress={() => onPick(d)} style={{ width: `${100 / 7}%` }} className="h-11 items-center justify-center" accessibilityLabel={d.toDateString()} accessibilityState={{ selected, disabled }}>
              <View className={cn('h-10 w-10 items-center justify-center rounded-full', selected ? 'bg-brand-500' : isToday ? 'border border-brand-500' : !disabled && 'active:bg-ink-100')}>
                <T variant="bodySm" tone={selected ? 'inverse' : disabled ? 'subtle' : isToday ? 'brand' : 'default'} className={cn(selected && 'font-bold', disabled && 'text-ink-300')}>{d.getDate()}</T>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TimeGrid({ value, is24Hour, minuteInterval = 5, onPick }) {
  const h = value.getHours();
  const m = value.getMinutes();
  const set = (hh, mm) => { const d = new Date(value); d.setHours(hh, mm, 0, 0); onPick(d); };
  const pm = h >= 12;
  const hours = is24Hour ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i + 1);
  const step = Math.max(1, Math.min(30, minuteInterval));
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  const cell = (active) => cn('m-1 h-10 items-center justify-center rounded-md border', active ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-surface active:bg-ink-50');
  return (
    <View className="px-4">
      <T variant="overline" tone="subtle" className="mb-1 ml-1">Hour</T>
      <View className="flex-row flex-wrap">
        {hours.map((hr) => {
          const h24 = is24Hour ? hr : (hr % 12) + (pm ? 12 : 0);
          return (
            <Pressable key={hr} onPress={() => set(h24, m)} style={{ width: is24Hour ? 'calc(16.66% - 8px)' : 'calc(25% - 8px)' }} className={cell(h === h24)}>
              <T variant="label" className={h === h24 ? 'text-brand-700' : 'text-ink-700'}>{is24Hour ? String(hr).padStart(2, '0') : hr}</T>
            </Pressable>
          );
        })}
      </View>
      <T variant="overline" tone="subtle" className="mb-1 ml-1 mt-3">Minute</T>
      <View className="flex-row flex-wrap">
        {minutes.map((mm) => {
          const active = m >= mm && m < mm + step;
          return (
            <Pressable key={mm} onPress={() => set(h, mm)} style={{ width: 'calc(16.66% - 8px)' }} className={cell(active)}>
              <T variant="label" className={active ? 'text-brand-700' : 'text-ink-700'}>{String(mm).padStart(2, '0')}</T>
            </Pressable>
          );
        })}
      </View>
      {!is24Hour ? (
        <View className="mt-3 flex-row rounded-md bg-ink-100 p-1">
          {['AM', 'PM'].map((p) => {
            const active = (p === 'PM') === pm;
            return (
              <Pressable key={p} onPress={() => set(p === 'PM' ? (h % 12) + 12 : h % 12, m)} accessibilityRole="tab" accessibilityState={{ selected: active }} className={cn('h-9 flex-1 items-center justify-center rounded-sm', active && 'bg-surface')}>
                <T variant="label" className={active ? 'text-ink-900' : 'text-ink-500'}>{p}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function DatePickerHost() {
  const req = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
    () => current,
  );
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (req) setDraft(new Date(req.value || Date.now()));
  }, [req]);
  const finish = (type) => {
    const r = current;
    if (!r) return;
    current = null;
    emit();
    if (type === 'set') r.onChange?.({ type: 'set', nativeEvent: { timestamp: draft.getTime(), utcOffset: -draft.getTimezoneOffset() } }, new Date(draft));
    else r.onChange?.({ type: 'dismissed', nativeEvent: {} }, undefined);
  };
  const visible = !!req && !!draft;
  const isTime = req?.mode === 'time';
  const clampDate = (d) => {
    let out = d;
    if (req?.minimumDate && out < req.minimumDate && !isTime) out = new Date(Math.max(out.getTime(), startOfDay(req.minimumDate).getTime()));
    return out;
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => finish('dismissed')}
      webLayer={20}
      footer={
        <View className="flex-row justify-end">
          <Button title="Cancel" variant="ghost" size="sm" onPress={() => finish('dismissed')} />
          <Button title="OK" size="sm" className="ml-2 min-w-[88px]" onPress={() => finish('set')} testID="picker-ok" />
        </View>
      }
    >
      {visible ? (
        <View key={req.id} className="pb-2">
          <View className="px-5 pb-3">
            <T variant="overline" tone="subtle">{isTime ? 'Select time' : 'Select date'}</T>
            <T variant="title" className="mt-1">
              {isTime ? draft.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: !req.is24Hour }).toUpperCase() : headerDate(draft)}
            </T>
          </View>
          {isTime ? (
            <TimeGrid value={draft} is24Hour={req.is24Hour} minuteInterval={req.minuteInterval} onPick={setDraft} />
          ) : (
            <Calendar
              value={draft}
              min={req.minimumDate}
              max={req.maximumDate}
              onPick={(d) => { const n = new Date(d); n.setHours(draft.getHours(), draft.getMinutes(), 0, 0); setDraft(clampDate(n)); }}
            />
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

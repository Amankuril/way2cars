import { View, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { T, IconButton, cn } from '@shared/native';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const todayKey = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/**
 * Month calendar (IST dates as YYYY-MM-DD keys). `decorate(dateKey)` returns
 * { tone: 'booked'|'blocked'|'priced'|null, label?: string }.
 */
export function MonthGrid({ month, onMonthChange, decorate, selected = [], onPressDay, disablePast }) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayKey();
  return (
    <View className="mx-4 rounded-lg border border-line bg-surface p-3">
      <View className="mb-2 flex-row items-center justify-between">
        <IconButton icon={ChevronLeft} label="Previous month" onPress={() => onMonthChange(new Date(y, m - 1, 1))} />
        <T variant="headline">{month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</T>
        <IconButton icon={ChevronRight} label="Next month" onPress={() => onMonthChange(new Date(y, m + 1, 1))} />
      </View>
      <View className="flex-row">{WEEK.map((d, i) => <T key={i} variant="caption" tone="subtle" className="flex-1 text-center">{d}</T>)}</View>
      <View className="mt-1 flex-row flex-wrap">
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%` }} className="h-12" />;
          const k = key(y, m, d);
          const deco = decorate?.(k) || {};
          const past = disablePast && k < today;
          const isSel = selected.includes(k);
          return (
            <Pressable key={k} style={{ width: `${100 / 7}%` }} className="h-12 items-center justify-center p-0.5" disabled={past} onPress={() => onPressDay?.(k)} accessibilityLabel={`${d} ${deco.tone || ''}`}>
              <View className={cn('h-full w-full items-center justify-center rounded-md',
                isSel ? 'bg-brand-500' : deco.tone === 'booked' ? 'bg-brand-100' : deco.tone === 'blocked' ? 'bg-ink-200' : deco.tone === 'priced' ? 'bg-accent-50' : '',
                k === today && !isSel && 'border border-brand-400', past && 'opacity-30')}>
                <T variant="label" className={isSel ? 'text-white' : 'text-ink-800'}>{d}</T>
                {deco.label ? <T variant="caption" className={cn('-mt-0.5 text-[9px]', isSel ? 'text-white' : 'text-ink-600')} numberOfLines={1}>{deco.label}</T> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Legend({ items }) {
  return (
    <View className="mx-4 mt-3 flex-row flex-wrap">
      {items.map(([cls, label]) => (
        <View key={label} className="mb-1 mr-4 flex-row items-center"><View className={cn('mr-1.5 h-3 w-3 rounded-sm', cls)} /><T variant="caption" tone="muted">{label}</T></View>
      ))}
    </View>
  );
}

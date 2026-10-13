import { useId } from 'react';
import { cn, istToday, istDateInput } from '@/lib/utils.js';

const PRESETS = [
  { label: 'Today', range: () => ({ from: istToday(), to: istToday() }) },
  { label: '7 days', range: () => ({ from: istToday(-6), to: istToday() }) },
  { label: '30 days', range: () => ({ from: istToday(-29), to: istToday() }) },
  {
    label: 'This month',
    range: () => {
      const today = istToday();
      return { from: `${today.slice(0, 8)}01`, to: today };
    },
  },
  {
    label: '90 days',
    range: () => ({ from: istDateInput(new Date(Date.now() - 89 * 86400000)), to: istToday() }),
  },
];

/**
 * IST calendar-day range. value = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (inclusive days).
 * Convert with istDayStart(from) / istDayEndExclusive(to) for the API.
 */
export function DateRangePicker({ value, onChange, label = 'Date range', presets = true, className, allowClear = true }) {
  const fromId = useId();
  const toId = useId();
  const v = value || {};
  const activePreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === v.from && r.to === v.to;
  });
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-1 block text-caption font-semibold text-ink-500">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <label htmlFor={fromId} className="sr-only">From date</label>
          <input id={fromId} type="date" value={v.from || ''} max={v.to || undefined} onChange={(e) => onChange({ ...v, from: e.target.value })} className="num h-[34px] rounded-l-md bg-transparent px-2.5 text-bodySm text-ink-900 focus:outline-none" />
          <span className="px-1 text-caption text-ink-400" aria-hidden="true">→</span>
          <label htmlFor={toId} className="sr-only">To date</label>
          <input id={toId} type="date" value={v.to || ''} min={v.from || undefined} onChange={(e) => onChange({ ...v, to: e.target.value })} className="num h-[34px] rounded-r-md bg-transparent px-2.5 text-bodySm text-ink-900 focus:outline-none" />
        </div>
        {presets ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Quick ranges">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.range())}
                aria-pressed={activePreset === p}
                className={cn(
                  'h-8 rounded-md border px-2.5 text-caption font-semibold transition-colors',
                  activePreset === p ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-600 hover:bg-ink-50',
                )}
              >
                {p.label}
              </button>
            ))}
            {allowClear && (v.from || v.to) ? (
              <button type="button" onClick={() => onChange({ from: '', to: '' })} className="h-8 rounded-md px-2 text-caption font-semibold text-ink-500 hover:text-ink-800">
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

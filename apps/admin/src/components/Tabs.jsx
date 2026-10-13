import { useRef } from 'react';
import { cn, fmtNumber } from '@/lib/utils.js';

/**
 * Underline tabs (role="tablist") with arrow-key navigation.
 * items: [{ value, label, count }]
 */
export function Tabs({ items, value, onChange, className, label = 'Sections' }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n = items.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    refs.current[next]?.focus();
    onChange(items[next].value);
  };
  return (
    <div role="tablist" aria-label={label} className={cn('scroll-thin -mb-px flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-1 text-label transition-colors',
              active ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null ? (
              <span className={cn('num rounded-full px-1.5 py-px text-caption font-bold', active ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600')}>{fmtNumber(t.count)}</span>
            ) : null}
            <span className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full', active ? 'bg-brand-500' : 'bg-transparent')} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

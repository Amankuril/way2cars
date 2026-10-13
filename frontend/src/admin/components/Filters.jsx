import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Select } from './Form.jsx';

export function FilterBar({ children, className, actions }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end gap-2.5', className)}>
      {children}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Search box that reports changes after the user pauses typing. */
export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search', className, delay = 350 }) {
  const id = useId();
  const [text, setText] = useState(value || '');
  useEffect(() => {
    setText(value || '');
  }, [value]);
  useEffect(() => {
    if ((value || '') === text) return undefined;
    const t = setTimeout(() => onChange(text.trim()), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onChange(text.trim())}
        placeholder={placeholder}
        className="input h-9 pl-8 pr-8"
      />
      {text ? (
        <button type="button" onClick={() => { setText(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-ink-400 hover:text-ink-700" aria-label="Clear search">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Select filter. options: [{ value, label }] or a { value: { label } } status map. */
export function FilterSelect({ label, value, onChange, options, allLabel = 'All', className }) {
  const id = useId();
  const list = Array.isArray(options) ? options : Object.entries(options).map(([v, o]) => ({ value: v, label: typeof o === 'string' ? o : o.label }));
  return (
    <div className={cn('min-w-[150px]', className)}>
      <label htmlFor={id} className="mb-1 block text-caption font-semibold text-ink-500">{label}</label>
      <Select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {allLabel !== false ? <option value="">{allLabel}</option> : null}
        {list.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </div>
  );
}

/** Removable chip for a filter that comes from a link (e.g. "Renter: 64f…"). */
export function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 pl-3 pr-1.5 text-label text-brand-700">
      {label}
      <button type="button" onClick={onClear} className="rounded-sm p-1 hover:bg-brand-100" aria-label={`Remove filter ${label}`}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

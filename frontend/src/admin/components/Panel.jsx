import { cn } from '@/lib/utils.js';

/** White surface panel with optional header (title, description, actions). */
export function Panel({ title, description, actions, children, className, bodyClassName, flush = false, as: Tag = 'section' }) {
  return (
    <Tag className={cn('panel min-w-0', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="text-bodySm font-bold text-ink-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-caption text-ink-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(flush ? '' : 'p-5', bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Definition list of label/value pairs. items: [[label, value], …] or [{ label, value, wide }]. */
export function KeyValue({ items, columns = 2, className }) {
  const rows = items.filter(Boolean).map((it) => (Array.isArray(it) ? { label: it[0], value: it[1] } : it));
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2', className)}>
      {rows.map((r) => (
        <div key={r.label} className={cn('min-w-0', r.wide && 'sm:col-span-2 xl:col-span-3')}>
          <dt className="text-caption font-semibold text-ink-500">{r.label}</dt>
          <dd className="mt-0.5 break-words text-bodySm text-ink-900">{r.value === null || r.value === undefined || r.value === '' ? <span className="text-ink-400">—</span> : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/amount rows for price breakdowns. */
export function AmountRows({ rows, className }) {
  return (
    <dl className={cn('divide-y divide-line', className)}>
      {rows.filter(Boolean).map((r) => (
        <div key={r.label} className={cn('flex items-baseline justify-between gap-4 py-2', r.strong && 'font-bold')}>
          <dt className={cn('text-bodySm', r.strong ? 'text-ink-900' : 'text-ink-600')}>
            {r.label}
            {r.hint ? <span className="ml-1.5 text-caption text-ink-400">{r.hint}</span> : null}
          </dt>
          <dd className={cn('num text-bodySm', r.strong ? 'text-ink-900' : 'text-ink-800', r.tone === 'success' && 'text-success-700', r.tone === 'danger' && 'text-danger-700')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** KPI / stat tile. */
export function StatTile({ label, value, sub, icon: Icon, className }) {
  return (
    <div className={cn('panel p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-semibold text-ink-500">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-ink-400" aria-hidden="true" /> : null}
      </div>
      <p className="num mt-2 text-title text-ink-900">{value}</p>
      {sub ? <p className="mt-1 text-caption text-ink-500">{sub}</p> : null}
    </div>
  );
}

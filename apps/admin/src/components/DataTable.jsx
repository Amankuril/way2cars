import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils.js';
import { Skeleton } from './Skeleton.jsx';
import { EmptyState, ErrorState } from './EmptyState.jsx';

/**
 * Dense data table with sticky header, hover rows, skeleton loading, empty and error states.
 * columns: [{ key, header, cell(row), align: 'left'|'right'|'center', className, headerClassName, width }]
 * rowHref(row): optional — clicking a row navigates there (the cell with `primary: true` also
 * renders a real link so keyboard users can reach it).
 */
export function DataTable({ columns, rows, loading, error, onRetry, rowKey = (r) => r.id, rowHref, empty, skeletonRows = 8, className, maxHeight = 'max-h-[68vh]', footer, dense = false }) {
  const navigate = useNavigate();
  const pad = dense ? 'px-3 py-2' : 'px-4 py-2.5';

  return (
    <div className={cn('panel min-w-0 overflow-hidden', className)}>
      <div className={cn('scroll-thin overflow-auto', maxHeight)}>
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-ink-50 text-overline uppercase tracking-[0.06em] text-ink-500',
                    pad,
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.headerClassName,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={`s${i}`}>
                    {columns.map((c, j) => (
                      <td key={c.key} className={cn('border-b border-line', pad)}>
                        <Skeleton className={cn('h-3.5', j === 0 ? 'w-24' : 'w-full max-w-[140px]', c.align === 'right' && 'ml-auto')} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <tr
                      key={rowKey(row)}
                      onClick={
                        href
                          ? (e) => {
                              if (e.target.closest('a,button,input,select,label,textarea')) return;
                              if (window.getSelection()?.toString()) return;
                              if (e.metaKey || e.ctrlKey) window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}${href}`, '_blank');
                              else navigate(href);
                            }
                          : undefined
                      }
                      className={cn('group transition-colors', href && 'cursor-pointer', 'hover:bg-brand-50/40')}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            'border-b border-line align-middle text-bodySm text-ink-800',
                            pad,
                            c.align === 'right' && 'num text-right',
                            c.align === 'center' && 'text-center',
                            c.className,
                          )}
                        >
                          {c.cell ? c.cell(row) : row[c.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && error ? <ErrorState error={error} onRetry={onRetry} /> : null}
        {!loading && !error && rows && rows.length === 0 ? empty || <EmptyState title="Nothing here yet" description="No records match the current filters." /> : null}
      </div>
      {footer}
    </div>
  );
}

/** Two-line cell: bold primary text + muted secondary line. */
export function CellStack({ primary, secondary, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate font-semibold text-ink-900">{primary || <span className="text-ink-400">—</span>}</div>
      {secondary ? <div className="truncate text-caption text-ink-500">{secondary}</div> : null}
    </div>
  );
}

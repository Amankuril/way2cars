import { cn } from '@/lib/utils.js';

/** Compact table for use inside a Panel (flush). columns: [{ key, header, cell(row), align }] */
export function MiniTable({ columns, rows, empty, rowKey = (r, i) => r.id || i }) {
  if (!rows?.length) return <p className="px-5 py-4 text-bodySm text-ink-500">{empty}</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('whitespace-nowrap border-b border-line bg-ink-50 px-5 py-2 text-overline uppercase tracking-[0.06em] text-ink-500', c.align === 'right' && 'text-right')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="hover:bg-brand-50/30">
              {columns.map((c) => (
                <td key={c.key} className={cn('border-b border-line px-5 py-2.5 align-top text-bodySm text-ink-800', i === rows.length - 1 && 'border-b-0', c.align === 'right' && 'num text-right')}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

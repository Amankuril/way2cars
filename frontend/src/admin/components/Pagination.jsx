import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtNumber } from '@/admin/lib/utils.js';

/** "21–40 of 312" with previous / next. meta = { page, limit, total, pages } from the API. */
export function Pagination({ meta, onPage, className = '' }) {
  if (!meta) return null;
  const { page = 1, limit = 20, total = 0, pages = 0 } = meta;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav className={`flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-2.5 ${className}`} aria-label="Pagination">
      <p className="num text-caption text-ink-600">
        {total === 0 ? 'No results' : (
          <>
            <span className="font-bold text-ink-900">{fmtNumber(from)}–{fmtNumber(to)}</span> of <span className="font-bold text-ink-900">{fmtNumber(total)}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <span className="num mr-2 text-caption text-ink-500">
          Page {page} of {Math.max(pages, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-label text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-label text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

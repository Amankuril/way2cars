import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { api } from '@/admin/lib/api.js';
import { cn } from '@/admin/lib/utils.js';
import { useCatalog } from '@/admin/lib/hooks.js';
import { ButtonLink } from '@/admin/components/Button.jsx';

/**
 * Shared pieces of the review-queue pages (Host requests, Vehicle requests): a full-width list
 * and a dedicated detail page with a sticky decision bar that moves on to the next request.
 */

/** "Today", "1 day ago", "6 days ago" — how long a request has been waiting. */
export function waiting(d) {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d)) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
}

// ---------------------------------------------------------------- hosts

export const hostTitle = (v) => v?.businessName || v?.name || 'Unnamed host';
export const businessType = (t) => (t === 'company' ? 'Company' : t === 'individual' ? 'Individual' : null);

/** City name for a host: catalogue city, else the free-text address city. */
export function useCityName() {
  const cities = useCatalog('cities');
  const cityMap = useMemo(() => new Map((cities.data || []).map((c) => [String(c.id), c.name])), [cities.data]);
  return (v) => (v?.cityId && cityMap.get(String(v.cityId))) || v?.address?.city || null;
}

// ---------------------------------------------------------------- shared UI

/** "N waiting" chip for the page header. */
export function WaitingCount({ total }) {
  return total ? <span className="num rounded-full bg-warning-50 px-2 py-0.5 text-caption font-bold text-warning-700">{total} waiting</span> : null;
}

/** Submitted column: relative age with the exact time underneath. */
export function SubmittedCell({ at, dateTime }) {
  if (!at) return <span className="text-ink-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <div className="font-semibold text-ink-900">{waiting(at)}</div>
      <div className="text-caption text-ink-500">{dateTime(at)}</div>
    </div>
  );
}

const same = (a, b) => String(a) === String(b);
const QUEUE_LIMIT = 100;

/**
 * The pending queue (oldest first) for a detail page: position, previous/next and
 * `goNext(doneId)`, which re-reads the queue after a decision and opens the next request
 * (the one after this in the queue, else the oldest left) or returns to the empty list.
 */
export function useRequestQueue({ queryKey, path, query, base }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Request pages have a sticky decision bar: lift toasts above it so a confirmation never
  // covers the buttons (set for the whole page, so it doesn't jump while the next one loads).
  useEffect(() => {
    document.body.dataset.decisionBar = '';
    return () => {
      delete document.body.dataset.decisionBar;
    };
  }, []);
  const key = [...queryKey, 'queue', query];
  const fetchQueue = () => api.list(path, { ...query, limit: QUEUE_LIMIT });
  const q = useQuery({ queryKey: key, queryFn: fetchQueue, staleTime: 15_000 });
  const rows = q.data?.data || [];

  const position = (id) => {
    const idx = rows.findIndex((r) => same(r.id, id));
    return {
      index: idx,
      total: q.data?.meta?.total ?? rows.length,
      prev: idx > 0 ? rows[idx - 1] : null,
      next: idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null,
    };
  };

  const goNext = async (doneId) => {
    const before = rows;
    const idx = before.findIndex((r) => same(r.id, doneId));
    let fresh;
    try {
      fresh = (await qc.fetchQuery({ queryKey: key, queryFn: fetchQueue, staleTime: 0 }))?.data || [];
    } catch {
      fresh = before;
    }
    fresh = fresh.filter((r) => !same(r.id, doneId));
    const after = idx >= 0 ? before.slice(idx + 1).find((r) => fresh.some((f) => same(f.id, r.id))) : null;
    const next = after || fresh[0];
    navigate(next ? `${base}/${next.id}` : base, { replace: true });
  };

  return { position, goNext, isLoading: q.isLoading };
}

/** "Request 2 of 5" with previous / next links (page header actions). */
export function QueueStepper({ position, base, noun = 'request' }) {
  if (position.index < 0) return null;
  const arrow = 'w-8 !px-0';
  return (
    <div className="flex items-center gap-1.5">
      <span className="num mr-1 text-caption font-semibold text-ink-500">
        {noun[0].toUpperCase() + noun.slice(1)} {position.index + 1} of {position.total}
      </span>
      {position.prev ? (
        <ButtonLink to={`${base}/${position.prev.id}`} size="sm" icon={ChevronLeft} className={arrow} aria-label={`Previous ${noun}`} title={`Previous ${noun}`} />
      ) : (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-300" aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>
      )}
      {position.next ? (
        <ButtonLink to={`${base}/${position.next.id}`} size="sm" icon={ChevronRight} className={arrow} aria-label={`Next ${noun}`} title={`Next ${noun}`} />
      ) : (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-300" aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
      )}
    </div>
  );
}

/** Grey notice shown when a request was already decided (deep link to an old request). */
export function DecidedNotice({ children }) {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-lg border border-line bg-ink-50 p-3 text-bodySm text-ink-700" role="status">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Sticky decision bar at the bottom of a request detail page. */
export function DecisionBar({ note, blocked = false, children }) {
  return (
    <div className="sticky bottom-4 z-10 mt-5 rounded-lg border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className={cn('min-w-0 flex-1 text-caption', blocked ? 'font-semibold text-danger-600' : 'text-ink-500')}>{note}</p>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}

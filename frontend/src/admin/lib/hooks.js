import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { useToast } from '@/admin/components/Toast.jsx';

/**
 * Filter + pagination state kept in the URL so lists are shareable and survive reloads.
 * Changing any filter resets `page` to 1.
 */
export function useSearchState(defaults) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null) out[key] = typeof defaults[key] === 'number' ? Number(v) || defaults[key] : v;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const resetPage = !('page' in patch);
          for (const [k, v] of Object.entries(patch)) {
            if (v === '' || v === null || v === undefined || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );
  return [state, set];
}

/** Value that only updates after `delay` ms without changes (search boxes). */
export function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Paginated list query → { rows, meta, ...query }. */
export function useListQuery(key, path, query, options = {}) {
  const q = useQuery({
    queryKey: [...key, query],
    queryFn: ({ signal }) => api.list(path, query, { signal }),
    placeholderData: (prev) => prev,
    ...options,
  });
  return { ...q, rows: q.data?.data, meta: q.data?.meta };
}

/**
 * Mutation with the app's standard feedback: success toast, error toast (unless the caller
 * handles errors itself with `toastError: false`) and query invalidation.
 */
export function useAction(fn, { success, invalidate = [], onSuccess, toastError = true } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success);
      onSuccess?.(data, vars);
    },
    onError: (err) => {
      if (toastError) toast.error(err);
    },
  });
}

/** Active cities / categories / brands from the public catalogue (for filters & targeting). */
export function useCatalog(kind) {
  return useQuery({
    queryKey: ['public', kind],
    queryFn: () => api.get(`/api/v1/public/${kind}`),
    staleTime: 10 * 60_000,
  });
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · WAY2CARS Admin` : 'WAY2CARS Admin';
  }, [title]);
}

/** Number of renter KYC submissions waiting for review (sidebar badge + dashboard queue). */
export function useRenterKycPending(enabled = true) {
  const q = useQuery({
    queryKey: ['renter-kyc-count'],
    queryFn: () => api.list('/api/v1/admin/kyc', { status: 'pending', subjectType: 'user', limit: 1 }),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return q.data?.meta?.total;
}

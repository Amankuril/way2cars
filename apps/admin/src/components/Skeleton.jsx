import { cn } from '@/lib/utils.js';

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-sm bg-ink-100', className || 'h-4 w-full')} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Placeholder for a detail page: header + two-column panels. */
export function DetailSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="panel p-5"><SkeletonText lines={5} /></div>
          <div className="panel p-5"><SkeletonText lines={4} /></div>
        </div>
        <div className="panel p-5"><SkeletonText lines={6} /></div>
      </div>
    </div>
  );
}

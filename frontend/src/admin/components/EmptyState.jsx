import { Inbox, TriangleAlert } from 'lucide-react';
import { Button } from './Button.jsx';
import { errorMessage } from '@/admin/lib/utils.js';

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={compact ? 'px-6 py-8 text-center' : 'px-6 py-14 text-center'}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-bodySm font-bold text-ink-900">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-caption text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Inline error block with a retry button. */
export function ErrorState({ error, onRetry, title = 'Could not load this data' }) {
  return (
    <div className="px-6 py-12 text-center" role="alert">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <TriangleAlert className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-bodySm font-bold text-ink-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-caption text-ink-500">{errorMessage(error)}</p>
      {onRetry ? (
        <div className="mt-4">
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

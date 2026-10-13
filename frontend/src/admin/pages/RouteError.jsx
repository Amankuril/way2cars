import { useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { TriangleAlert } from 'lucide-react';

/** Last-resort error screen for render errors and failed lazy chunks (e.g. after a deploy). */
export function RouteError() {
  const error = useRouteError();
  const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(error?.message || ''));
  const title = isRouteErrorResponse(error) ? `${error.status} — ${error.statusText}` : chunk ? 'A new version is available' : 'Something went wrong';
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="panel w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-danger-50 text-danger-600">
          <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-headline text-ink-900">{title}</h1>
        <p className="mt-2 text-bodySm text-ink-500">
          {chunk ? 'Reload the page to get the latest admin app.' : 'This screen hit an unexpected error. Reload the page; if it keeps happening, report it with the time it occurred.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 items-center rounded-md bg-brand-500 px-4 text-label text-white hover:bg-brand-600">
            Reload
          </button>
          <Link to="/" className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-4 text-label text-ink-800 hover:bg-ink-50">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { usePageTitle } from './PageTitle.jsx';
import { useDocumentTitle } from '@/admin/lib/hooks.js';

/**
 * Consistent page header: optional back link, title (+ status/meta), description, actions at right.
 * Also publishes the title to the top bar breadcrumb.
 */
export function PageHeader({ title, description, actions, back, meta, crumb }) {
  const setTitle = usePageTitle();
  const plain = typeof title === 'string' ? title : crumb;
  useDocumentTitle(plain);
  useEffect(() => {
    setTitle(crumb || plain || null);
    return () => setTitle(null);
  }, [crumb, plain, setTitle]);

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {back ? (
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-caption font-semibold text-ink-500 hover:text-brand-600">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-title text-ink-900">{title}</h1>
          {meta}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-bodySm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

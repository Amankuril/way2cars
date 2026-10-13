import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';

export const PAGE_NAMES = {
  'privacy-policy': 'Privacy policy',
  'terms-and-conditions': 'Terms and conditions',
  'about-us': 'About us',
  'contact-us': 'Contact us',
  'cancellation-policy': 'Cancellation policy',
  'rental-agreement': 'Rental agreement',
  'host-terms': 'Host terms',
};

export default function CmsPages() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['cms-pages'], queryFn: () => api.get(`${ADMIN}/cms/pages`) });

  const columns = [
    {
      key: 'page',
      header: 'Page',
      cell: (p) => (
        <div>
          <Link to={`/content/pages/${p.slug}`} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{p.title || PAGE_NAMES[p.slug]}</Link>
          <div className="font-mono text-caption text-ink-500">/{p.slug}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (p.version === 0 ? <StatusPill tone="warning">Not created</StatusPill> : p.isPublished ? <StatusPill tone="success">Published</StatusPill> : <StatusPill tone="neutral">Draft</StatusPill>),
    },
    { key: 'blocks', header: 'Blocks', align: 'right', cell: (p) => p.blocks?.length || 0 },
    { key: 'version', header: 'Version', align: 'right', cell: (p) => (p.version ? `v${p.version}` : '—') },
    { key: 'updated', header: 'Last updated', cell: (p) => <span className="whitespace-nowrap text-ink-600">{p.updatedAt ? dateTime(p.updatedAt) : '—'}</span> },
  ];

  return (
    <>
      <PageHeader title="Pages" description="Legal and information pages shown in the apps and website. Every save creates a new version." />
      <DataTable columns={columns} rows={data} loading={isLoading} error={error} onRetry={refetch} rowKey={(p) => p.slug} rowHref={(p) => `/content/pages/${p.slug}`} skeletonRows={7} />
    </>
  );
}

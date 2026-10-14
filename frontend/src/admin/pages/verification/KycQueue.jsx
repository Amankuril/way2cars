import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { ago, dateTime, maskPhone } from '@shared/lib/format.js';
import { KYC_SUBMISSION_STATUS, ID_PROOF } from '@/admin/lib/labels.js';
import { useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';

/** Renter KYC queue. Host KYC is reviewed together with the host request (Hosts → Host requests). */
export default function KycQueue() {
  const [s, set] = useSearchState({ page: 1, status: 'pending' });
  const query = compact({ page: s.page, limit: 25, status: s.status, subjectType: 'user' });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['kyc'], `${ADMIN}/kyc`, query);

  const columns = [
    {
      key: 'subject',
      header: 'Renter',
      cell: (k) => (
        <div className="min-w-0">
          <Link to={`/renter-kyc/${k.id}`} className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">
            {k.subject?.name || 'Name not set'}
          </Link>
          <div className="num text-caption text-ink-500">{maskPhone(k.subject?.phone)}</div>
        </div>
      ),
    },
    {
      key: 'docs',
      header: 'Documents',
      cell: (k) => (
        <CellStack
          primary={[k.licence ? 'Driving licence' : null, k.idProof ? ID_PROOF[k.idProof.type] || k.idProof.type : null, k.pan ? 'PAN' : null].filter(Boolean).join(' · ') || '—'}
          secondary={[k.licence?.numberMasked, k.idProof?.numberMasked].filter(Boolean).join(' · ')}
          className="max-w-[260px]"
        />
      ),
    },
    { key: 'status', header: 'Status', cell: (k) => <StatusPill map={KYC_SUBMISSION_STATUS} value={k.status} /> },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (k) => (
        <div className="whitespace-nowrap">
          <div>{dateTime(k.createdAt)}</div>
          {k.status === 'pending' ? <div className="text-caption text-ink-500">waiting {ago(k.createdAt).replace(' ago', '')}</div> : null}
        </div>
      ),
    },
    {
      key: 'review',
      header: 'Decision',
      cell: (k) => (k.review?.at ? <CellStack primary={dateTime(k.review.at)} secondary={k.review.reason} className="max-w-[240px]" /> : <span className="text-ink-400">—</span>),
    },
  ];

  return (
    <>
      <PageHeader title="Renter KYC" description="Driving licence and identity checks for renters. Oldest pending submissions are shown first. Host KYC is reviewed with each host request." />
      <Tabs
        className="mb-4"
        label="KYC status"
        value={s.status}
        onChange={(v) => set({ status: v })}
        items={[
          { value: 'pending', label: 'Pending', count: s.status === 'pending' ? meta?.total : undefined },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(k) => `/renter-kyc/${k.id}`}
        empty={
          <EmptyState
            icon={ShieldCheck}
            title={s.status === 'pending' ? 'All caught up' : `No ${s.status} submissions`}
            description={s.status === 'pending' ? 'New KYC submissions from renters will appear here for review.' : 'Reviewed submissions are listed here, newest first.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

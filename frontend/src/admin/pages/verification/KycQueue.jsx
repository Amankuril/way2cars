import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { ADMIN } from '@/lib/api.js';
import { ago, dateTime, maskPhone } from '@shared/lib/format.js';
import { KYC_SUBMISSION_STATUS, ID_PROOF } from '@/lib/labels.js';
import { useListQuery, useSearchState } from '@/lib/hooks.js';
import { compact } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/components/DataTable.jsx';
import { Pagination } from '@/components/Pagination.jsx';
import { FilterBar, FilterSelect } from '@/components/Filters.jsx';
import { StatusPill, Tag } from '@/components/StatusPill.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';
import { Tabs } from '@/components/Tabs.jsx';

const SUBJECT = { user: 'Renter', vendor: 'Host' };

export default function KycQueue() {
  const [s, set] = useSearchState({ page: 1, status: 'pending', subjectType: '' });
  const query = compact({ page: s.page, limit: 25, status: s.status, subjectType: s.subjectType });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['kyc'], `${ADMIN}/kyc`, query);

  const columns = [
    {
      key: 'subject',
      header: 'Applicant',
      cell: (k) => (
        <div className="min-w-0">
          <Link to={`/kyc/${k.id}`} className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">
            {k.subject?.name || 'Name not set'}
          </Link>
          <div className="num text-caption text-ink-500">{maskPhone(k.subject?.phone)}</div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (k) => <Tag tone={k.subjectType === 'vendor' ? 'info' : 'neutral'}>{SUBJECT[k.subjectType]}</Tag> },
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
      <PageHeader title="KYC queue" description="Identity checks for renters and hosts. Oldest pending submissions are shown first." />
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
      <FilterBar>
        <FilterSelect label="Applicant type" value={s.subjectType} onChange={(v) => set({ subjectType: v })} options={[{ value: 'user', label: 'Renters' }, { value: 'vendor', label: 'Hosts' }]} allLabel="Renters and hosts" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(k) => `/kyc/${k.id}`}
        empty={
          <EmptyState
            icon={ShieldCheck}
            title={s.status === 'pending' ? 'All caught up' : `No ${s.status} submissions`}
            description={s.status === 'pending' ? 'New KYC submissions from renters and hosts will appear here for review.' : 'Reviewed submissions are listed here, newest first.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

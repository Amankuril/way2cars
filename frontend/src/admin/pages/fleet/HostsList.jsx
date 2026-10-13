import { Link } from 'react-router';
import { Building2, Star } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { dateTime, maskPhone } from '@shared/lib/format.js';
import { VENDOR_STATUS, KYC_STATUS } from '@/admin/lib/labels.js';
import { useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput } from '@/admin/components/Filters.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';

const STEP_LABEL = { profile: 'Profile', business: 'Business details', kyc: 'KYC', bank: 'Bank account', review: 'Awaiting review', resubmit: 'Resubmit' };

export default function HostsList() {
  const [s, set] = useSearchState({ page: 1, status: '', q: '' });
  const query = compact({ page: s.page, limit: 25, status: s.status, q: s.q });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['hosts'], `${ADMIN}/vendors`, query);

  const columns = [
    {
      key: 'host',
      header: 'Host',
      cell: (v) => (
        <div className="min-w-0">
          <Link to={`/hosts/${v.id}`} className="block max-w-[260px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">
            {v.businessName || v.name || 'Unnamed host'}
          </Link>
          <div className="truncate text-caption text-ink-500">
            {v.businessName && v.name ? `${v.name} · ` : ''}
            <span className="num">{maskPhone(v.phone)}</span>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (v) => (v.businessType === 'company' ? 'Company' : v.businessType === 'individual' ? 'Individual' : '—') },
    { key: 'status', header: 'Status', cell: (v) => <StatusPill map={VENDOR_STATUS} value={v.status} /> },
    {
      key: 'checks',
      header: 'KYC · bank',
      cell: (v) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill map={KYC_STATUS} value={v.kyc?.status} dot={false} />
          <span className="text-caption text-ink-500">{v.hasBankAccount ? 'Bank account added' : 'No bank account'}</span>
        </div>
      ),
    },
    {
      key: 'next',
      header: 'Onboarding',
      cell: (v) => <CellStack primary={`${v.completedSteps?.length || 0} steps done`} secondary={v.status === 'onboarding' && v.nextStep ? `Next: ${STEP_LABEL[v.nextStep] || v.nextStep}` : null} />,
    },
    { key: 'cars', header: 'Cars (listed)', align: 'right', cell: (v) => <span className="whitespace-nowrap">{v.vehicles?.total || 0} <span className="text-ink-500">({v.vehicles?.listed || 0})</span></span> },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      cell: (v) => (v.rating?.count ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />{v.rating.avg.toFixed(1)}</span> : <span className="text-ink-400">—</span>),
    },
    {
      key: 'date',
      header: s.status === 'pending_approval' ? 'Submitted' : 'Joined',
      cell: (v) => <span className="whitespace-nowrap text-ink-600">{dateTime(s.status === 'pending_approval' && v.submittedAt ? v.submittedAt : v.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Hosts" description="Car owners and fleet partners. Approve applications once KYC and bank details are verified." />
      <Tabs
        className="mb-4"
        label="Host status"
        value={s.status}
        onChange={(v) => set({ status: v })}
        items={[
          { value: '', label: 'All' },
          { value: 'pending_approval', label: 'Awaiting approval', count: s.status === 'pending_approval' ? meta?.total : undefined },
          { value: 'approved', label: 'Approved' },
          { value: 'onboarding', label: 'Onboarding' },
          { value: 'rejected', label: 'Changes needed' },
          { value: 'suspended', label: 'Suspended' },
        ]}
      />
      <FilterBar>
        <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Name, business, phone or email" label="Search hosts" className="sm:w-72" />
        <FilterSelect label="Status" value={s.status} onChange={(v) => set({ status: v })} options={VENDOR_STATUS} allLabel="Any status" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(v) => `/hosts/${v.id}`}
        empty={
          <EmptyState
            icon={Building2}
            title={s.status || s.q ? 'No hosts match these filters' : 'No hosts yet'}
            description={s.status || s.q ? 'Try another status or search term.' : 'Hosts appear here when they sign up in the host app.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

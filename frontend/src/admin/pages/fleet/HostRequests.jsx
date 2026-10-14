import { Link } from 'react-router';
import { CircleCheck, UserCheck } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { dateTime, maskPhone } from '@shared/lib/format.js';
import { KYC_STATUS } from '@/admin/lib/labels.js';
import { useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, SearchInput } from '@/admin/components/Filters.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { ButtonLink } from '@/admin/components/Button.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { SubmittedCell, WaitingCount, businessType, hostTitle, useCityName } from './requestKit.jsx';

/** Hosts waiting for approval (oldest first). A row opens the full review page. */
export default function HostRequests() {
  const [s, set] = useSearchState({ page: 1, q: '' });
  const query = compact({ status: 'pending_approval', page: s.page, limit: 25, q: s.q });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['hosts', 'requests'], `${ADMIN}/vendors`, query);
  const cityName = useCityName();
  const href = (v) => `/hosts/requests/${v.id}`;

  const columns = [
    {
      key: 'host',
      header: 'Host',
      cell: (v) => (
        <div className="min-w-0">
          <Link to={href(v)} className="block max-w-[260px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">{hostTitle(v)}</Link>
          <div className="max-w-[260px] truncate text-caption text-ink-500">{v.businessName && v.name ? v.name : businessType(v.businessType) || '—'}</div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', cell: (v) => <span className="num whitespace-nowrap">{maskPhone(v.phone)}</span> },
    { key: 'city', header: 'City', cell: (v) => <CellStack primary={cityName(v)} secondary={v.address?.state} className="max-w-[160px]" /> },
    { key: 'type', header: 'Type', cell: (v) => businessType(v.businessType) || <span className="text-ink-400">—</span> },
    {
      key: 'checks',
      header: 'KYC · bank',
      cell: (v) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill map={KYC_STATUS} value={v.kyc?.status} dot={false} />
          <span className={v.hasBankAccount ? 'text-caption text-ink-500' : 'text-caption font-semibold text-danger-600'}>{v.hasBankAccount ? 'Bank account added' : 'No bank account'}</span>
        </div>
      ),
    },
    { key: 'cars', header: 'Cars', align: 'right', cell: (v) => v.vehicles?.total || 0 },
    { key: 'submitted', header: 'Submitted', cell: (v) => <SubmittedCell at={v.submittedAt} dateTime={dateTime} /> },
  ];

  return (
    <>
      <PageHeader
        title="Host requests"
        meta={<WaitingCount total={meta?.total} />}
        description="Hosts waiting for approval, oldest first. Open a request to check their details and documents, then approve, reject or suspend."
        actions={<ButtonLink to="/hosts" size="sm">All hosts</ButtonLink>}
      />
      <FilterBar>
        <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Name, business or phone" label="Search host requests" className="sm:w-72" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={href}
        skeletonRows={5}
        empty={
          s.q ? (
            <EmptyState icon={UserCheck} title="No requests match" description="Try another name, business or phone number." />
          ) : (
            <EmptyState
              icon={CircleCheck}
              title="No host requests waiting"
              description="When a host finishes onboarding in the host app, their request appears here for review."
              action={<ButtonLink to="/hosts" size="sm">View all hosts</ButtonLink>}
            />
          )
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

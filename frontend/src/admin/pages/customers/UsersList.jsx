import { Link } from 'react-router';
import { Users } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong, maskPhone } from '@shared/lib/format.js';
import { USER_STATUS, KYC_STATUS } from '@/admin/lib/labels.js';
import { useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, fmtNumber } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput } from '@/admin/components/Filters.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';

export default function UsersList() {
  const [s, set] = useSearchState({ page: 1, q: '', status: '', kyc: '' });
  const query = compact({ page: s.page, limit: 25, q: s.q, status: s.status, kyc: s.kyc });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['users'], `${ADMIN}/users`, query);
  const filtered = s.q || s.status || s.kyc;

  const columns = [
    {
      key: 'user',
      header: 'Renter',
      cell: (u) => (
        <div className="min-w-0">
          <Link to={`/users/${u.id}`} className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">{u.name || 'Name not set'}</Link>
          <div className="truncate text-caption text-ink-500">
            <span className="num">{maskPhone(u.phone)}</span>
            {u.email ? ` · ${u.email}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Account', cell: (u) => <StatusPill map={USER_STATUS} value={u.status} /> },
    { key: 'kyc', header: 'KYC', cell: (u) => <StatusPill map={KYC_STATUS} value={u.kycStatus || 'not_submitted'} dot={false} /> },
    { key: 'trips', header: 'Trips', align: 'right', cell: (u) => fmtNumber(u.trips) },
    { key: 'wallet', header: 'Wallet', align: 'right', cell: (u) => money(u.walletBalancePaise || 0) },
    { key: 'joined', header: 'Joined', cell: (u) => <span className="whitespace-nowrap text-ink-600">{dateLong(u.createdAt)}</span> },
    { key: 'last', header: 'Last sign-in', cell: (u) => <span className="whitespace-nowrap text-ink-600">{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</span> },
  ];

  return (
    <>
      <PageHeader title="Users" description="Renters on the platform. Search by phone number, name or email." />
      <FilterBar>
        <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Phone, name or email" label="Search users" className="sm:w-72" />
        <FilterSelect label="Account status" value={s.status} onChange={(v) => set({ status: v })} options={USER_STATUS} allLabel="Any status" />
        <FilterSelect label="KYC" value={s.kyc} onChange={(v) => set({ kyc: v })} options={KYC_STATUS} allLabel="Any KYC state" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(u) => `/users/${u.id}`}
        empty={
          <EmptyState
            icon={Users}
            title={filtered ? 'No users match these filters' : 'No renters yet'}
            description={filtered ? 'Check the phone number or clear a filter.' : 'Renters appear here after they sign in to the app for the first time.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

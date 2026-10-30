import { Link } from 'react-router';
import { WalletCards } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, maskPhone } from '@shared/lib/format.js';
import { WALLET_CATEGORY } from '@/admin/lib/labels.js';
import { useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, istDayStart, istDayEndExclusive, istToday } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect } from '@/admin/components/Filters.jsx';
import { DateRangePicker } from '@/admin/components/DateRangePicker.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';

/** Every manual wallet credit and debit made by staff, with reason and who made it. */
export default function WalletTransactions() {
  const [s, set] = useSearchState({ page: 1, direction: '', category: '', from: istToday(-29), to: istToday(0) });
  const query = compact({ page: s.page, limit: 25, direction: s.direction, category: s.category, from: istDayStart(s.from), to: istDayEndExclusive(s.to) });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['wallet-transactions'], `${ADMIN}/wallet/transactions`, query);
  const columns = [
    { key: 'at', header: 'Date', cell: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
    { key: 'user', header: 'Renter', cell: (r) => <div><Link to={`/users/${r.user.id}`} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{r.user.name || 'Unnamed'}</Link><div className="num text-caption text-ink-500">{maskPhone(r.user.phone)}</div></div> },
    { key: 'cat', header: 'Category', cell: (r) => WALLET_CATEGORY[r.category] || 'Adjustment' },
    { key: 'reason', header: 'Reason', cell: (r) => <div className="max-w-[320px]"><div className="text-bodySm text-ink-800">{r.note}</div>{r.bookingRef ? <Link to={`/bookings/${r.bookingId}`} className="num text-caption link">{r.bookingRef}</Link> : null}</div> },
    { key: 'by', header: 'By', cell: (r) => r.createdBy?.name || 'Admin' },
    { key: 'amt', header: 'Amount', align: 'right', cell: (r) => <span className={r.direction === 'credit' ? 'font-semibold text-success-700' : 'font-semibold text-danger-700'}>{money(r.direction === 'credit' ? r.amountPaise : -r.amountPaise, { sign: true })}</span> },
    { key: 'bal', header: 'Balance after', align: 'right', cell: (r) => money(r.balanceAfterPaise) },
  ];
  return (
    <>
      <PageHeader title="Wallet adjustments" description="Credits (refunds, goodwill, corrections) and debits made by staff on renter wallets. Make a new one from the renter’s page." />
      <FilterBar>
        <DateRangePicker label="Date (IST)" value={{ from: s.from, to: s.to }} onChange={(r) => set({ from: r.from, to: r.to })} allowClear={false} />
        <FilterSelect label="Type" value={s.direction} onChange={(v) => set({ direction: v })} options={{ credit: 'Credits', debit: 'Debits' }} allLabel="Credits and debits" />
        <FilterSelect label="Category" value={s.category} onChange={(v) => set({ category: v })} options={WALLET_CATEGORY} allLabel="All categories" />
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={isLoading} error={error} onRetry={refetch}
        empty={<EmptyState icon={WalletCards} title="No wallet adjustments in this period" description="Adjust a renter’s wallet from Customers → Users." />}
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />} />
    </>
  );
}

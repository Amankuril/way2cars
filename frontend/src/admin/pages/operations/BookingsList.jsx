import { Link } from 'react-router';
import { CalendarRange } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, duration } from '@shared/lib/format.js';
import { BOOKING_STATUS, PAYMENT_STATUS } from '@/admin/lib/labels.js';
import { useCatalog, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { istDayStart, istDayEndExclusive, compact, shortId } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput, FilterChip } from '@/admin/components/Filters.jsx';
import { DateRangePicker } from '@/admin/components/DateRangePicker.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';

export default function BookingsList() {
  const [s, set] = useSearchState({ page: 1, status: '', ref: '', from: '', to: '', cityId: '', userId: '', vendorId: '', vehicleId: '' });
  const cities = useCatalog('cities');
  const query = compact({
    page: s.page,
    limit: 25,
    status: s.status,
    ref: s.ref,
    cityId: s.cityId,
    userId: s.userId,
    vendorId: s.vendorId,
    vehicleId: s.vehicleId,
    from: istDayStart(s.from),
    to: istDayEndExclusive(s.to),
  });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['bookings'], `${ADMIN}/bookings`, query);
  const filtered = s.status || s.ref || s.from || s.to || s.cityId || s.userId || s.vendorId || s.vehicleId;

  const columns = [
    {
      key: 'ref',
      header: 'Booking',
      cell: (b) => (
        <div>
          <Link to={`/bookings/${b.id}`} className="num font-bold text-brand-600 hover:underline">{b.ref}</Link>
          <div className="text-caption text-ink-500">{dateTime(b.createdAt)}</div>
        </div>
      ),
    },
    { key: 'car', header: 'Car', cell: (b) => <CellStack primary={b.vehicle?.title} secondary={b.vehicle?.registrationNumber} className="max-w-[220px]" /> },
    { key: 'renter', header: 'Renter', cell: (b) => <CellStack primary={b.renter?.name || 'Unnamed renter'} secondary={b.renter?.phone} className="max-w-[180px]" /> },
    { key: 'host', header: 'Host', cell: (b) => <CellStack primary={b.host?.name} secondary={b.host?.phone} className="max-w-[180px]" /> },
    {
      key: 'trip',
      header: 'Trip (IST)',
      cell: (b) => (
        <div className="whitespace-nowrap">
          <div className="text-ink-900">{dateTime(b.startAt)} → {dateTime(b.endAt)}</div>
          <div className="text-caption text-ink-500">{duration(b.startAt, b.endAt)}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (b) => <StatusPill map={BOOKING_STATUS} value={b.status} /> },
    { key: 'payment', header: 'Payment', cell: (b) => <StatusPill map={PAYMENT_STATUS} value={b.payment?.status} dot={false} /> },
    { key: 'total', header: 'Total', align: 'right', cell: (b) => <span className="font-semibold text-ink-900">{money(b.pricing?.totalPaise)}</span> },
  ];

  return (
    <>
      <PageHeader title="Bookings" description="Every reservation on the marketplace. Open a booking to see payments, inspections, refunds and to take action." />
      <FilterBar>
        <SearchInput value={s.ref} onChange={(v) => set({ ref: v })} placeholder="Booking ref, e.g. W2C…" label="Search by booking reference" className="sm:w-56" />
        <FilterSelect label="Status" value={s.status} onChange={(v) => set({ status: v })} options={BOOKING_STATUS} allLabel="All statuses" />
        <FilterSelect label="City" value={s.cityId} onChange={(v) => set({ cityId: v })} options={(cities.data || []).map((c) => ({ value: c.id, label: c.name }))} allLabel="All cities" />
        <DateRangePicker label="Trip start (IST)" value={{ from: s.from, to: s.to }} onChange={(r) => set({ from: r.from, to: r.to })} />
      </FilterBar>
      {s.userId || s.vendorId || s.vehicleId ? (
        <div className="-mt-1 mb-4 flex flex-wrap gap-2">
          {s.userId ? <FilterChip label={`Renter …${shortId(s.userId)}`} onClear={() => set({ userId: '' })} /> : null}
          {s.vendorId ? <FilterChip label={`Host …${shortId(s.vendorId)}`} onClear={() => set({ vendorId: '' })} /> : null}
          {s.vehicleId ? <FilterChip label={`Car …${shortId(s.vehicleId)}`} onClear={() => set({ vehicleId: '' })} /> : null}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(b) => `/bookings/${b.id}`}
        empty={
          <EmptyState
            icon={CalendarRange}
            title={filtered ? 'No bookings match these filters' : 'No bookings yet'}
            description={filtered ? 'Try a different status, city or date range.' : 'Bookings appear here as soon as renters check out.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

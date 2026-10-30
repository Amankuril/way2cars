import { Link } from 'react-router';
import { CalendarRange, Plus } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, duration } from '@shared/lib/format.js';
import { BOOKING_STATUS, PAYMENT_STATUS, BALANCE_STATUS, OWNERSHIP, BOOKING_SOURCE } from '@/admin/lib/labels.js';
import { ButtonLink } from '@/admin/components/Button.jsx';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
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
  const { can } = useAuth();
  const [s, set] = useSearchState({ page: 1, status: '', ref: '', from: '', to: '', cityId: '', userId: '', vendorId: '', vehicleId: '', source: '', ownership: '', attention: '' });
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
    source: s.source,
    ownership: s.ownership,
    attention: s.attention,
    from: istDayStart(s.from),
    to: istDayEndExclusive(s.to),
  });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['bookings'], `${ADMIN}/bookings`, query);
  const filtered = s.status || s.ref || s.from || s.to || s.cityId || s.userId || s.vendorId || s.vehicleId || s.source || s.ownership || s.attention;

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
    {
      key: 'car',
      header: 'Car',
      cell: (b) => (
        <div className="max-w-[220px]">
          <CellStack primary={b.vehicle?.title} secondary={b.vehicle?.registrationNumber} />
          <div className="mt-1 flex flex-wrap gap-1">
            {b.ownership === 'company' ? <StatusPill map={OWNERSHIP} value="company" dot={false} /> : null}
            {b.source === 'offline' ? <StatusPill map={BOOKING_SOURCE} value="offline" dot={false} /> : null}
          </div>
        </div>
      ),
    },
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
    {
      key: 'payment',
      header: 'Payment',
      cell: (b) => (
        <div className="space-y-1">
          <StatusPill map={PAYMENT_STATUS} value={b.payment?.status} dot={false} />
          {b.balance?.status === 'due' ? <StatusPill map={BALANCE_STATUS} value="due" dot={false} /> : null}
          {b.extensions?.some((e) => e.status === 'pending_approval') ? <StatusPill tone="warning" dot={false}>Extension request</StatusPill> : null}
        </div>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', cell: (b) => <span className="font-semibold text-ink-900">{money(b.pricing?.totalPaise)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every reservation — app and office. Open a booking to see payments, inspections, refunds and to take action."
        actions={can('bookings.manage') ? <ButtonLink to="/bookings/new" variant="primary" icon={Plus}>New office booking</ButtonLink> : null}
      />
      <FilterBar>
        <SearchInput value={s.ref} onChange={(v) => set({ ref: v })} placeholder="Booking ref, e.g. W2C…" label="Search by booking reference" className="sm:w-56" />
        <FilterSelect label="Status" value={s.status} onChange={(v) => set({ status: v })} options={BOOKING_STATUS} allLabel="All statuses" />
        <FilterSelect label="City" value={s.cityId} onChange={(v) => set({ cityId: v })} options={(cities.data || []).map((c) => ({ value: c.id, label: c.name }))} allLabel="All cities" />
        <FilterSelect label="Needs attention" value={s.attention} onChange={(v) => set({ attention: v })} options={[{ value: 'extension_requests', label: 'Extension requests' }, { value: 'balance_due', label: 'Balance due' }, { value: 'deposit_review', label: 'Deposit review (car inspection)' }, { value: 'collateral', label: 'Bike / laptop deposits held' }]} allLabel="Everything" />
        <FilterSelect label="Booked via" value={s.source} onChange={(v) => set({ source: v })} options={[{ value: 'app', label: 'App' }, { value: 'offline', label: 'Office' }]} allLabel="App and office" />
        <FilterSelect label="Car owner" value={s.ownership} onChange={(v) => set({ ownership: v })} options={[{ value: 'company', label: 'WAY2CARS fleet' }, { value: 'host', label: 'Attached hosts' }]} allLabel="All cars" />
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

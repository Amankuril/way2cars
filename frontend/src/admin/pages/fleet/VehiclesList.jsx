import { Link } from 'react-router';
import { Car, Star } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { money, dateTime } from '@shared/lib/format.js';
import { VEHICLE_APPROVAL, VEHICLE_STATUS } from '@/admin/lib/labels.js';
import { useCatalog, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, shortId } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput, FilterChip } from '@/admin/components/Filters.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';

export default function VehiclesList() {
  const [s, set] = useSearchState({ page: 1, approval: '', status: '', cityId: '', q: '', featured: '', vendorId: '' });
  const cities = useCatalog('cities');
  const query = compact({ page: s.page, limit: 25, approval: s.approval, status: s.status, cityId: s.cityId, q: s.q, featured: s.featured, vendorId: s.vendorId });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['vehicles'], `${ADMIN}/vehicles`, query);
  const filtered = s.approval || s.status || s.cityId || s.q || s.featured || s.vendorId;

  const columns = [
    {
      key: 'car',
      header: 'Car',
      cell: (v) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-14 shrink-0 overflow-hidden rounded-sm border border-line bg-ink-50">
            {v.photos?.[0] ? <img src={v.photos[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Car className="m-auto mt-2.5 h-5 w-5 text-ink-300" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <Link to={`/vehicles/${v.id}`} className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">{v.title}</Link>
            <div className="flex items-center gap-1.5 text-caption text-ink-500">
              <span className="num font-semibold text-ink-600">{v.registrationNumber}</span>
              {v.isLuxury ? <Tag tone="warning">Luxury</Tag> : null}
              {v.isFeatured ? <Tag tone="info">Featured</Tag> : null}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'host', header: 'Host', cell: (v) => <CellStack primary={v.vendor?.name} secondary={v.vendor?.phone} className="max-w-[180px]" /> },
    { key: 'city', header: 'City', cell: (v) => <CellStack primary={v.city?.name} secondary={v.location?.area} className="max-w-[160px]" /> },
    {
      key: 'approval',
      header: 'Listing',
      cell: (v) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill map={VEHICLE_APPROVAL} value={v.approval?.status} />
          {v.adminSuspended ? <StatusPill tone="danger" dot={false}>Suspended by admin</StatusPill> : v.approval?.status === 'approved' ? <span className="text-caption text-ink-500">{v.isListed ? 'Bookable' : 'Not bookable'}</span> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Availability', cell: (v) => <StatusPill map={VEHICLE_STATUS} value={v.status} dot={false} /> },
    { key: 'daily', header: 'Per day', align: 'right', cell: (v) => <span className="font-semibold text-ink-900">{money(v.pricing?.dailyPaise)}</span> },
    {
      key: 'rating',
      header: 'Rating · trips',
      align: 'right',
      cell: (v) => (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {v.rating?.count ? <><Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />{v.rating.avg.toFixed(1)}</> : <span className="text-ink-400">—</span>}
          <span className="text-ink-500"> · {v.trips}</span>
        </span>
      ),
    },
    {
      key: 'submitted',
      header: s.approval === 'pending_review' ? 'Submitted' : 'Added',
      cell: (v) => <span className="whitespace-nowrap text-ink-600">{dateTime(s.approval === 'pending_review' && v.approval?.submittedAt ? v.approval.submittedAt : v.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Vehicles" description="Every car listed by hosts. Review new listings, feature cars on the home screen or suspend a listing." />
      <FilterBar>
        <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Registration or model" label="Search by registration number or model" className="sm:w-56" />
        <FilterSelect label="Listing review" value={s.approval} onChange={(v) => set({ approval: v })} options={VEHICLE_APPROVAL} allLabel="Any review state" />
        <FilterSelect label="Availability" value={s.status} onChange={(v) => set({ status: v })} options={VEHICLE_STATUS} allLabel="Any availability" />
        <FilterSelect label="City" value={s.cityId} onChange={(v) => set({ cityId: v })} options={(cities.data || []).map((c) => ({ value: c.id, label: c.name }))} allLabel="All cities" />
        <FilterSelect label="Featured" value={s.featured} onChange={(v) => set({ featured: v })} options={[{ value: 'true', label: 'Featured only' }, { value: 'false', label: 'Not featured' }]} allLabel="All cars" />
      </FilterBar>
      {s.vendorId ? (
        <div className="-mt-1 mb-4 flex flex-wrap gap-2">
          <FilterChip label={`Host …${shortId(s.vendorId)}`} onClear={() => set({ vendorId: '' })} />
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(v) => `/vehicles/${v.id}`}
        empty={
          <EmptyState
            icon={Car}
            title={filtered ? 'No cars match these filters' : 'No cars listed yet'}
            description={filtered ? 'Try another review state, city or search.' : 'Cars appear here once hosts add them from the host app.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

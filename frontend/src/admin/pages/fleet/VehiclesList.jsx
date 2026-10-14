import { Link, Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Car, ClipboardCheck, Star } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateLong, dateTime, maskPhone } from '@shared/lib/format.js';
import { VEHICLE_APPROVAL, VEHICLE_STATUS } from '@/admin/lib/labels.js';
import { useCatalog, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, shortId } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput, FilterChip } from '@/admin/components/Filters.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';

export default function VehiclesList() {
  const [s, set] = useSearchState({ page: 1, approval: '', status: '', cityId: '', q: '', featured: '', vendorId: '' });
  const cities = useCatalog('cities');
  // Cars awaiting review live on the Vehicle requests page.
  const query = compact({ page: s.page, limit: 25, approval: s.approval, notApproval: s.approval ? undefined : 'pending_review', status: s.status, cityId: s.cityId, q: s.q, featured: s.featured, vendorId: s.vendorId });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['vehicles'], `${ADMIN}/vehicles`, query);
  const pendingCount = useQuery({ queryKey: ['vehicles', 'requests', 'count'], queryFn: () => api.list(`${ADMIN}/vehicles`, { approval: 'pending_review', limit: 1 }) }).data?.meta?.total;
  const filtered = s.approval || s.status || s.cityId || s.q || s.featured || s.vendorId;
  const carHref = (v) => (v.approval?.status === 'pending_review' ? `/vehicles/requests/${v.id}` : `/vehicles/${v.id}`);
  if (s.approval === 'pending_review') return <Navigate to="/vehicles/requests" replace />;

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
            <Link to={carHref(v)} className="block max-w-[220px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">{v.title}</Link>
            <div className="flex items-center gap-1.5 text-caption text-ink-500">
              <span className="num font-semibold text-ink-600">{v.registrationNumber}</span>
              {v.isLuxury ? <Tag tone="warning">Luxury</Tag> : null}
              {v.isFeatured ? <Tag tone="info">Featured</Tag> : null}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'host', header: 'Host', cell: (v) => <CellStack primary={v.vendor?.name} secondary={v.vendor?.phone ? maskPhone(v.vendor.phone) : null} className="max-w-[180px]" /> },
    { key: 'city', header: 'City', cell: (v) => <CellStack primary={v.city?.name} secondary={v.location?.area} className="max-w-[160px]" /> },
    {
      key: 'approval',
      header: 'Listing',
      cell: (v) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill map={VEHICLE_APPROVAL} value={v.approval?.status} />
          {v.adminSuspended ? (
            <StatusPill tone="danger" dot={false}>Suspended by admin</StatusPill>
          ) : (
            <span className="whitespace-nowrap text-caption text-ink-500">
              {VEHICLE_STATUS[v.status]?.label || v.status}
              {v.approval?.status === 'approved' ? ` · ${v.isListed ? 'Bookable' : 'Not bookable'}` : ''}
            </span>
          )}
        </div>
      ),
    },
    { key: 'daily', header: 'Per day', align: 'right', cell: (v) => <span className="font-semibold text-ink-900">{money(v.pricing?.dailyPaise)}</span> },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      cell: (v) => (
        <div className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {v.rating?.count ? <><Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />{v.rating.avg.toFixed(1)}</> : <span className="text-ink-400">—</span>}
          </span>
          <div className="text-caption text-ink-500">{v.trips} {v.trips === 1 ? 'trip' : 'trips'}</div>
        </div>
      ),
    },
    { key: 'added', header: 'Added', cell: (v) => <span className="whitespace-nowrap text-ink-600" title={dateTime(v.createdAt)}>{dateLong(v.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader title="Vehicles" description="Cars listed by hosts. Feature cars on the home screen or suspend a listing. New listings are reviewed in Vehicle requests." />
      {pendingCount ? (
        <Link to="/vehicles/requests" className="group mb-4 flex items-center gap-3 rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-bodySm text-warning-700 hover:border-warning-500">
          <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="font-bold">{pendingCount} car {pendingCount === 1 ? 'listing is' : 'listings are'} waiting for review.</span></span>
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold">Review <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        </Link>
      ) : null}
      <Tabs
        className="mb-4"
        label="Listing review"
        value={s.approval}
        onChange={(v) => set({ approval: v })}
        items={[
          { value: '', label: 'All' },
          { value: 'approved', label: 'Approved' },
          { value: 'draft', label: 'Draft' },
          { value: 'rejected', label: 'Changes needed' },
        ]}
      />
      <FilterBar>
        <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Registration or model" label="Search by registration number or model" className="sm:w-56" />
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
        rowHref={carHref}
        empty={
          <EmptyState
            icon={Car}
            title={filtered ? 'No cars match these filters' : 'No cars listed yet'}
            description={filtered ? 'Try another tab, city or search.' : 'Cars appear here once hosts add them from the host app.'}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

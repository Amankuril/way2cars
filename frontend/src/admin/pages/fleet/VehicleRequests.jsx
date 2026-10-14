import { Link } from 'react-router';
import { Car, CircleCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { ADMIN } from '@/admin/lib/api.js';
import { dateTime, maskPhone, money } from '@shared/lib/format.js';
import { useCatalog, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { cn, compact } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput } from '@/admin/components/Filters.jsx';
import { Tag } from '@/admin/components/StatusPill.jsx';
import { ButtonLink } from '@/admin/components/Button.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { SubmittedCell, WaitingCount } from './requestKit.jsx';
import { docCount } from './vehicleParts.jsx';

/** Car listings waiting for review (oldest submitted first). A row opens the review page. */
export default function VehicleRequests() {
  const [s, set] = useSearchState({ page: 1, q: '', cityId: '' });
  const cities = useCatalog('cities');
  const query = compact({ approval: 'pending_review', page: s.page, limit: 25, q: s.q, cityId: s.cityId });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['vehicles', 'requests'], `${ADMIN}/vehicles`, query);
  const href = (v) => `/vehicles/requests/${v.id}`;
  const filtered = s.q || s.cityId;

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
            <Link to={href(v)} className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-brand-600 hover:underline">{v.title}</Link>
            <div className="text-caption text-ink-500">{[v.year, v.category?.name].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      ),
    },
    { key: 'reg', header: 'Registration', cell: (v) => <span className="num whitespace-nowrap font-semibold text-ink-700">{v.registrationNumber}</span> },
    {
      key: 'host',
      header: 'Host',
      cell: (v) => (
        <div className="min-w-0 max-w-[180px]">
          <div className="truncate font-semibold text-ink-900">{v.vendor?.name || <span className="text-ink-400">—</span>}</div>
          <div className="flex items-center gap-1.5 text-caption text-ink-500">
            <span className="num">{maskPhone(v.vendor?.phone)}</span>
            {v.vendor && v.vendor.status !== 'approved' ? <Tag tone="warning">Host not approved</Tag> : null}
          </div>
        </div>
      ),
    },
    { key: 'city', header: 'City', cell: (v) => <CellStack primary={v.city?.name} secondary={v.location?.area} className="max-w-[160px]" /> },
    {
      key: 'files',
      header: 'Photos · docs',
      cell: (v) => {
        const d = docCount(v);
        return (
          <div className="flex items-center gap-3 whitespace-nowrap text-caption font-semibold text-ink-700">
            <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" /><span className="num">{v.photos?.length || 0}</span></span>
            <span className={cn('inline-flex items-center gap-1', d.have < d.need && 'text-danger-600')}><FileText className={cn('h-3.5 w-3.5', d.have < d.need ? 'text-danger-500' : 'text-ink-400')} aria-hidden="true" /><span className="num">{d.have}/{d.need}</span></span>
          </div>
        );
      },
    },
    { key: 'daily', header: 'Per day', align: 'right', cell: (v) => <span className="font-semibold text-ink-900">{money(v.pricing?.dailyPaise)}</span> },
    { key: 'submitted', header: 'Submitted', cell: (v) => <SubmittedCell at={v.approval?.submittedAt} dateTime={dateTime} /> },
  ];

  return (
    <>
      <PageHeader
        title="Vehicle requests"
        meta={<WaitingCount total={meta?.total} />}
        description="New and changed car listings waiting for review, oldest first. Open a request to check photos, documents and pricing, then approve or send it back."
        actions={<ButtonLink to="/vehicles" size="sm">All vehicles</ButtonLink>}
      />
      <FilterBar>
        <SearchInput value={s.q} onChange={(v) => set({ q: v })} placeholder="Registration or model" label="Search vehicle requests" className="sm:w-64" />
        <FilterSelect label="City" value={s.cityId} onChange={(v) => set({ cityId: v })} options={(cities.data || []).map((c) => ({ value: c.id, label: c.name }))} allLabel="All cities" />
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
          filtered ? (
            <EmptyState icon={Car} title="No requests match" description="Try another registration, model or city." />
          ) : (
            <EmptyState
              icon={CircleCheck}
              title="No car listings waiting"
              description="When a host submits a new car, or changes documents on a live one, it appears here for review."
              action={<ButtonLink to="/vehicles" size="sm">View all vehicles</ButtonLink>}
            />
          )
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

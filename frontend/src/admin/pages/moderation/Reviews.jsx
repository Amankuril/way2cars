import { useState } from 'react';
import { Link } from 'react-router';
import { Star, EyeOff, Eye } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime, maskPhone } from '@shared/lib/format.js';
import { REVIEW_STATUS } from '@/admin/lib/labels.js';
import { useAction, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { compact, humanize } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { FilterBar, FilterSelect } from '@/admin/components/Filters.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';

const NEGATIVE = ['late_handover', 'dirty_car', 'mechanical_issue', 'not_as_described'];

function Stars({ value, label }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${label}: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= value ? (value <= 2 ? 'fill-danger-500 text-danger-500' : 'fill-warning-500 text-warning-500') : 'text-ink-200'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

export default function Reviews() {
  const { can } = useAuth();
  const [s, set] = useSearchState({ page: 1, status: '', maxRating: '' });
  const query = compact({ page: s.page, limit: 25, status: s.status, maxRating: s.maxRating });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['reviews'], `${ADMIN}/reviews`, query);
  const [target, setTarget] = useState(null);
  const moderate = useAction(({ id, status, reason }) => api.patch(`${ADMIN}/reviews/${id}`, { status, reason }), {
    success: (_d, v) => (v.status === 'hidden' ? 'Review hidden — ratings recalculated' : 'Review published — ratings recalculated'),
    invalidate: [['reviews']],
    toastError: false,
  });

  const columns = [
    {
      key: 'rating',
      header: 'Ratings',
      cell: (r) => (
        <div className="space-y-1 whitespace-nowrap text-caption text-ink-600">
          <div className="flex items-center gap-2"><Stars value={r.vehicleRating} label="Car" /> Car</div>
          <div className="flex items-center gap-2"><Stars value={r.hostRating} label="Host" /> Host</div>
        </div>
      ),
    },
    {
      key: 'comment',
      header: 'Review',
      cell: (r) => (
        <div className="max-w-[460px]">
          {r.comment ? <p className="whitespace-pre-line text-bodySm text-ink-900">{r.comment}</p> : <p className="text-caption italic text-ink-400">No written comment</p>}
          {r.tags?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {r.tags.map((t) => <Tag key={t} tone={NEGATIVE.includes(t) ? 'danger' : 'neutral'}>{humanize(t)}</Tag>)}
            </div>
          ) : null}
          {r.hostReply?.text ? <p className="mt-1.5 border-l-2 border-line pl-2 text-caption text-ink-600"><span className="font-semibold">Host reply:</span> {r.hostReply.text}</p> : null}
        </div>
      ),
    },
    {
      key: 'who',
      header: 'Renter · car',
      cell: (r) => (
        <div className="min-w-0 text-caption">
          {r.user?._id && can('users.read') ? <Link to={`/users/${r.user._id}`} className="link">{r.user.name || maskPhone(r.user.phone)}</Link> : <span className="font-semibold">{r.user?.name || '—'}</span>}
          <div className="text-ink-600">
            {r.vehicle?._id && can('vehicles.read') ? <Link to={`/vehicles/${r.vehicle._id}`} className="hover:text-brand-600 hover:underline">{r.vehicle.model}</Link> : r.vehicle?.model}
            {r.vehicle?.registrationNumber ? <span className="num"> · {r.vehicle.registrationNumber}</span> : null}
          </div>
          {can('bookings.read') && r.bookingId ? <Link to={`/bookings/${r.bookingId}`} className="text-ink-500 hover:text-brand-600 hover:underline">View booking</Link> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill map={REVIEW_STATUS} value={r.status} /> },
    { key: 'at', header: 'Posted', cell: (r) => <span className="whitespace-nowrap text-ink-600">{dateTime(r.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) =>
        r.status === 'published' ? (
          <Button size="xs" variant="danger-outline" icon={EyeOff} onClick={() => setTarget({ r, status: 'hidden' })}>Hide</Button>
        ) : (
          <Button size="xs" icon={Eye} onClick={() => setTarget({ r, status: 'published' })}>Publish</Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Reviews" description="Renter reviews of cars and hosts. Hidden reviews no longer count towards ratings." />
      <FilterBar>
        <FilterSelect label="Status" value={s.status} onChange={(v) => set({ status: v })} options={REVIEW_STATUS} allLabel="Published and hidden" />
        <FilterSelect
          label="Car rating"
          value={s.maxRating}
          onChange={(v) => set({ maxRating: v })}
          options={[{ value: '1', label: '1 star only' }, { value: '2', label: '2 stars or less' }, { value: '3', label: '3 stars or less' }, { value: '4', label: '4 stars or less' }]}
          allLabel="Any rating"
        />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        empty={<EmptyState icon={Star} title={s.status || s.maxRating ? 'No reviews match these filters' : 'No reviews yet'} description="Renters can review a trip after it is completed." />}
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target?.status === 'hidden' ? 'Hide this review?' : 'Publish this review?'}
        description={target?.status === 'hidden' ? 'It disappears from the car page and stops counting towards the car and host ratings.' : 'It becomes visible again and counts towards ratings.'}
        confirmLabel={target?.status === 'hidden' ? 'Hide review' : 'Publish review'}
        tone={target?.status === 'hidden' ? 'danger' : 'primary'}
        reason={{ label: 'Moderation reason (internal)', minLength: 3 }}
        onConfirm={(reason) => moderate.mutateAsync({ id: target.r.id, status: target.status, reason })}
      />
    </>
  );
}

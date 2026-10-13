import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Star, TriangleAlert, Ban, RotateCcw, CalendarRange } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong, maskPhone } from '@shared/lib/format.js';
import { VEHICLE_APPROVAL, VEHICLE_STATUS, VENDOR_STATUS, BOOKING_STATUS, FUEL, TRANSMISSION, FEATURES, INSURANCE } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { humanize, fmtNumber } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';
import { Checkbox, Field, Input, Switch } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { SecureFileLink } from '@/admin/components/SecureImage.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';

const DOCS = [
  { key: 'rc', label: 'Registration certificate (RC)' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'puc', label: 'Pollution certificate (PUC)' },
  { key: 'fitness', label: 'Fitness certificate' },
];

function Photos({ urls, title }) {
  const [active, setActive] = useState(0);
  if (!urls?.length) return <p className="text-bodySm text-ink-500">No photos uploaded.</p>;
  return (
    <div className="space-y-2">
      <div className="aspect-[16/9] overflow-hidden rounded-md border border-line bg-ink-50">
        <img src={urls[active]} alt={`${title} — photo ${active + 1}`} className="h-full w-full object-cover" />
      </div>
      <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-pressed={i === active}
            className={`h-14 w-20 shrink-0 overflow-hidden rounded-sm border-2 ${i === active ? 'border-brand-500' : 'border-transparent opacity-80 hover:opacity-100'}`}
          >
            <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

function FlagsPanel({ v }) {
  const [rank, setRank] = useState(String(v.featuredRank ?? 0));
  const [suspend, setSuspend] = useState(null);
  const flags = useAction((body) => api.patch(`${ADMIN}/vehicles/${v.id}/flags`, body), {
    success: 'Listing flags updated',
    invalidate: [['vehicle', v.id], ['vehicles']],
  });
  const rankNum = Number(rank);
  const rankValid = Number.isInteger(rankNum) && rankNum >= 0 && rankNum <= 1000;
  return (
    <Panel title="Listing controls" description="Changes apply immediately to search and the home screen.">
      <div className="space-y-4">
        <Switch label="Luxury car" description="Shown in the luxury collection." checked={v.isLuxury} disabled={flags.isPending} onChange={(on) => flags.mutate({ isLuxury: on })} />
        <Switch label="Featured" description="Promoted on the renter home screen." checked={v.isFeatured} disabled={flags.isPending} onChange={(on) => flags.mutate({ isFeatured: on })} />
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (rankValid) flags.mutate({ featuredRank: rankNum });
          }}
        >
          <Field label="Featured rank" htmlFor="rank" hint="Lower numbers show first (0–1000)." error={!rankValid ? 'Enter a whole number from 0 to 1000.' : null} className="flex-1">
            <Input id="rank" type="number" min={0} max={1000} value={rank} onChange={(e) => setRank(e.target.value)} className="num" />
          </Field>
          <Button type="submit" size="md" disabled={!rankValid || rankNum === v.featuredRank} loading={flags.isPending && flags.variables?.featuredRank !== undefined} className="mb-[22px]">
            Save
          </Button>
        </form>
        <div className="border-t border-line pt-4">
          {v.adminSuspended ? (
            <Button variant="secondary" icon={RotateCcw} onClick={() => setSuspend('lift')}>Lift suspension</Button>
          ) : (
            <Button variant="danger-outline" icon={Ban} onClick={() => setSuspend('apply')}>Suspend listing…</Button>
          )}
          <p className="mt-2 text-caption text-ink-500">A suspended car is hidden from search; existing bookings are not cancelled.</p>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(suspend)}
        onClose={() => setSuspend(null)}
        title={suspend === 'apply' ? 'Suspend this listing?' : 'Lift the suspension?'}
        description={suspend === 'apply' ? 'The car disappears from search immediately. Handle upcoming bookings separately.' : 'The car becomes bookable again if the host and listing are otherwise eligible.'}
        confirmLabel={suspend === 'apply' ? 'Suspend listing' : 'Lift suspension'}
        tone={suspend === 'apply' ? 'danger' : 'primary'}
        reason={{ label: 'Reason (recorded in the audit log)', minLength: 3 }}
        onConfirm={(reason) => flags.mutateAsync({ adminSuspended: suspend === 'apply', reason })}
      />
    </Panel>
  );
}

function CalendarPanel({ id }) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 60 * 86400000);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vehicle-calendar', id],
    queryFn: () => api.get(`${ADMIN}/vehicles/${id}/calendar`, { from: from.toISOString(), to: to.toISOString() }),
  });
  return (
    <Panel title="Calendar · next 60 days" description="Host blocks and special prices." flush actions={<CalendarRange className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
      {isLoading ? (
        <p className="px-5 py-4 text-caption text-ink-500">Loading calendar…</p>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <MiniTable
            columns={[
              { key: 'when', header: 'Blocked (IST)', cell: (b) => <span className="whitespace-nowrap">{dateTime(b.startAt)} → {dateTime(b.endAt)}</span> },
              { key: 'reason', header: 'Reason', cell: (b) => [humanize(b.reason), b.note].filter(Boolean).join(' · ') || '—' },
            ]}
            rows={data.blocks}
            empty="No blocked periods."
          />
          {data.priceOverrides?.length ? (
            <div className="border-t border-line">
              <MiniTable
                columns={[
                  { key: 'date', header: 'Special price', cell: (o) => dateLong(`${o.date}T00:00:00+05:30`) },
                  { key: 'day', header: 'Per day', align: 'right', cell: (o) => money(o.dailyPaise) },
                  { key: 'hour', header: 'Per hour', align: 'right', cell: (o) => money(o.hourlyPaise) },
                ]}
                rows={data.priceOverrides}
                rowKey={(o) => o.date}
              />
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

export default function VehicleDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [decision, setDecision] = useState(null);
  const [luxury, setLuxury] = useState(false);
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`${ADMIN}/vehicles/${id}`) });

  const review = useAction((body) => api.post(`${ADMIN}/vehicles/${id}/review`, body), {
    success: (_d, b) => (b.decision === 'approve' ? 'Listing approved — the host has been notified' : 'Listing sent back to the host'),
    invalidate: [['vehicle', id], ['vehicles'], ['dashboard']],
    toastError: false,
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this car" /></div>;

  const p = v.pricing || {};
  const host = v.vendor || {};
  const pending = v.approval?.status === 'pending_review';
  const gaps = v.submissionGaps || [];
  const isEv = v.fuelType === 'electric';

  return (
    <>
      <PageHeader
        back={{ to: '/vehicles', label: 'Vehicles' }}
        title={v.title}
        meta={
          <>
            <StatusPill map={VEHICLE_APPROVAL} value={v.approval?.status} />
            <StatusPill map={VEHICLE_STATUS} value={v.status} dot={false} />
            {v.adminSuspended ? <StatusPill tone="danger" dot={false}>Suspended by admin</StatusPill> : null}
            {v.isLuxury ? <Tag tone="warning">Luxury</Tag> : null}
            {v.isFeatured ? <Tag tone="info">Featured</Tag> : null}
          </>
        }
        description={
          <>
            <span className="num font-semibold text-ink-700">{v.registrationNumber}</span> · {v.city?.name} · {v.isListed ? 'Bookable now' : 'Not bookable'}
          </>
        }
        actions={
          pending && can('vehicles.review') ? (
            <>
              <Button variant="danger-outline" icon={CircleX} onClick={() => setDecision('reject')}>Send back…</Button>
              <Button variant="success" icon={CircleCheck} onClick={() => { setLuxury(Boolean(v.isLuxury)); setDecision('approve'); }}>Approve listing</Button>
            </>
          ) : null
        }
      />

      {pending && gaps.length ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning-100 bg-warning-50 p-4" role="status">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
          <div>
            <p className="text-bodySm font-bold text-ink-900">This listing is incomplete and cannot be approved yet</p>
            <ul className="mt-1 list-disc pl-5 text-caption text-ink-700">
              {gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
      {v.approval?.status === 'rejected' && v.approval.reason ? (
        <div className="mb-5 rounded-lg border border-danger-100 bg-danger-50 p-4 text-bodySm text-danger-700">
          <span className="font-bold">Sent back {v.approval.reviewedAt ? dateTime(v.approval.reviewedAt) : ''}:</span> {v.approval.reason}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Photos" description={`${v.photos?.length || 0} uploaded`}>
            <Photos urls={v.photos} title={v.title} />
          </Panel>

          <Panel title="Specifications">
            <KeyValue
              columns={3}
              items={[
                ['Brand', v.brand?.name],
                ['Model', [v.model, v.variant].filter(Boolean).join(' ')],
                ['Year', v.year],
                ['Category', v.category?.name],
                ['Fuel', FUEL[v.fuelType]],
                ['Transmission', TRANSMISSION[v.transmission]],
                ['Seats', v.seats],
                ['Luggage', v.luggageBags !== undefined ? `${v.luggageBags} bags` : null],
                isEv ? ['Range per charge', v.rangeKm ? `${v.rangeKm} km` : null] : ['Colour', v.color],
                ['Odometer (last)', v.lastOdometerKm ? `${fmtNumber(v.lastOdometerKm)} km` : null],
                ['Instant booking', v.instantBooking ? 'Yes' : 'No — host approves'],
                ['Doorstep delivery', v.delivery?.enabled ? `Up to ${v.delivery.maxKm} km` : 'No'],
                { label: 'Features', value: v.features?.length ? v.features.map((f) => FEATURES[f] || humanize(f)).join(', ') : null, wide: true },
                { label: 'Description', value: v.description, wide: true },
                { label: 'Pickup address', value: [v.location?.address, v.location?.area, v.location?.pincode].filter(Boolean).join(', '), wide: true },
              ]}
            />
          </Panel>

          <Panel title="Documents" description="Private files — opened through a secure link and audited." flush>
            <MiniTable
              columns={[
                { key: 'doc', header: 'Document', cell: (d) => <span className="font-semibold text-ink-900">{d.label}</span> },
                { key: 'num', header: 'Number / details', cell: (d) => [d.data?.number, d.key === 'insurance' && d.data?.type ? INSURANCE[d.data.type] : null, d.data?.provider].filter(Boolean).join(' · ') || '—' },
                {
                  key: 'exp',
                  header: 'Valid until',
                  cell: (d) => {
                    if (!d.data?.expiry) return '—';
                    const expired = new Date(d.data.expiry) < new Date();
                    return <span className={expired ? 'font-semibold text-danger-700' : ''}>{dateLong(d.data.expiry)}{expired ? ' · expired' : ''}</span>;
                  },
                },
                { key: 'file', header: 'File', cell: (d) => (d.data?.fileId ? <SecureFileLink fileId={d.data.fileId}>Open</SecureFileLink> : <span className="text-ink-400">{d.key === 'puc' && isEv ? 'Not needed (EV)' : 'Not uploaded'}</span>) },
              ]}
              rows={DOCS.map((d) => ({ ...d, id: d.key, data: v.documents?.[d.key] }))}
            />
          </Panel>

          <Panel title="Upcoming bookings" flush>
            <MiniTable
              columns={[
                { key: 'ref', header: 'Booking', cell: (b) => (can('bookings.read') ? <Link to={`/bookings/${b._id}`} className="num link">{b.ref}</Link> : <span className="num">{b.ref}</span>) },
                { key: 'when', header: 'Trip (IST)', cell: (b) => <span className="whitespace-nowrap">{dateTime(b.startAt)} → {dateTime(b.endAt)}</span> },
                { key: 'status', header: 'Status', cell: (b) => <StatusPill map={BOOKING_STATUS} value={b.status} /> },
              ]}
              rows={v.upcomingBookings}
              rowKey={(b) => b._id}
              empty="No upcoming or active bookings."
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Pricing">
            <AmountRows
              rows={[
                { label: 'Per hour', value: money(p.hourlyPaise) },
                { label: 'Per day', value: money(p.dailyPaise), strong: true },
                { label: 'Weekend per day', value: p.weekendDailyPaise ? money(p.weekendDailyPaise) : 'Same as weekday' },
                { label: 'Security deposit', value: money(p.securityDepositPaise) },
                { label: 'Included distance', value: `${p.includedKmPerDay ?? '—'} km/day` },
                { label: 'Extra distance', value: `${money(p.extraKmChargePaise)}/km` },
              ]}
            />
          </Panel>

          <Panel title="Host">
            <div className="space-y-3">
              <div>
                {can('vendors.read') && host._id ? <Link to={`/hosts/${host._id}`} className="link">{host.businessName || host.name || 'Unnamed host'}</Link> : <p className="font-semibold">{host.businessName || host.name}</p>}
                <p className="num text-caption text-ink-500">{maskPhone(host.phone)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill map={VENDOR_STATUS} value={host.status} />
                {host.rating?.count ? <span className="inline-flex items-center gap-1 text-caption text-ink-600"><Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />{host.rating.avg.toFixed(1)} ({host.rating.count})</span> : null}
              </div>
            </div>
          </Panel>

          <Panel title="Performance">
            <KeyValue
              items={[
                ['Completed trips', fmtNumber(v.stats?.trips || 0)],
                ['Host earnings', money(v.stats?.earningsPaise || 0)],
                ['Rating', v.rating?.count ? `${v.rating.avg.toFixed(1)} from ${v.rating.count} reviews` : 'No reviews yet'],
                ['Listed since', dateLong(v.createdAt)],
                ['Submitted for review', v.approval?.submittedAt ? dateTime(v.approval.submittedAt) : null],
                ['Last reviewed', v.approval?.reviewedAt ? dateTime(v.approval.reviewedAt) : null],
              ]}
            />
          </Panel>

          {can('vehicles.manage') ? <FlagsPanel v={v} /> : null}
          <CalendarPanel id={v.id} />
        </div>
      </div>

      <ConfirmDialog
        open={decision === 'approve'}
        onClose={() => setDecision(null)}
        title="Approve this listing?"
        description="The car becomes bookable as soon as the host is approved and the car is active."
        confirmLabel="Approve listing"
        tone="success"
        onConfirm={() => review.mutateAsync({ decision: 'approve', isLuxury: luxury })}
      >
        <Checkbox label="Mark as a luxury car" description="Adds it to the luxury collection." checked={luxury} onChange={(e) => setLuxury(e.target.checked)} />
      </ConfirmDialog>
      <ConfirmDialog
        open={decision === 'reject'}
        onClose={() => setDecision(null)}
        title="Send the listing back to the host?"
        description="The host sees your note and can fix the listing and resubmit."
        confirmLabel="Send back"
        tone="danger"
        reason={{ label: 'What should the host fix?', placeholder: 'e.g. Upload a clear photo of the RC and a valid insurance certificate.', minLength: 5, maxLength: 500 }}
        onConfirm={(reason) => review.mutateAsync({ decision: 'reject', reason })}
      />
    </>
  );
}

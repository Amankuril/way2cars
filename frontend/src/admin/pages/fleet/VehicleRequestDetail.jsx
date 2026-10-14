import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, ExternalLink, MapPin, Star, TriangleAlert } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, maskPhone } from '@shared/lib/format.js';
import { VEHICLE_APPROVAL, VENDOR_STATUS, FUEL, TRANSMISSION, FEATURES } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { humanize, fmtNumber } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button, ButtonLink } from '@/admin/components/Button.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';
import { Checkbox } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { DecidedNotice, DecisionBar, QueueStepper, useRequestQueue, waiting } from './requestKit.jsx';
import { DocumentsTable, Photos } from './vehicleParts.jsx';

const BASE = '/vehicles/requests';

export default function VehicleRequestDetail() {
  const { id } = useParams();
  return <RequestDetail key={id} id={id} />;
}

function RequestDetail({ id }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [luxury, setLuxury] = useState(false);
  const queue = useRequestQueue({ queryKey: ['vehicles', 'requests'], path: `${ADMIN}/vehicles`, query: { approval: 'pending_review' }, base: BASE });
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`${ADMIN}/vehicles/${id}`) });

  // The car itself is refreshed after moving on, so the page doesn't flash its "decided" state.
  const invalidate = [['vehicles'], ['dashboard']];
  const done = async () => {
    await queue.goNext(id);
    qc.invalidateQueries({ queryKey: ['vehicle', id] });
  };
  const refreshOnConflict = (e) => {
    if (e?.code === 'NOT_PENDING') [...invalidate, ['vehicle', id]].forEach((k) => qc.invalidateQueries({ queryKey: k }));
    throw e;
  };
  const review = useAction((body) => api.post(`${ADMIN}/vehicles/${id}/review`, body), {
    success: (_d, b) => (b.decision === 'approve' ? `${v.title} approved — the host has been notified` : `${v.title} sent back to the host`),
    invalidate,
    toastError: false,
    onSuccess: done,
  });

  const back = { to: BASE, label: 'Vehicle requests' };
  if (isLoading) return <DetailSkeleton />;
  if (error) {
    return (
      <>
        <PageHeader back={back} title="Vehicle request" />
        <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this car" /></div>
      </>
    );
  }

  const p = v.pricing || {};
  const host = v.vendor || {};
  const hostName = host.businessName || host.name || 'Unnamed host';
  const pending = v.approval?.status === 'pending_review';
  const gaps = v.submissionGaps || [];
  const isEv = v.fuelType === 'electric';
  const canReview = can('vehicles.review');
  const point = v.location?.point;
  const submittedAt = v.approval?.submittedAt;
  const hostApproved = host.status === 'approved';
  const resubmitted = Boolean(v.approval?.reviewedAt); // reviewed before → a changed or fixed listing

  return (
    <>
      <PageHeader
        back={back}
        title={v.title}
        meta={
          <>
            <StatusPill map={VEHICLE_APPROVAL} value={v.approval?.status} />
            {resubmitted && pending ? <Tag tone="info">Resubmitted</Tag> : null}
          </>
        }
        description={
          <>
            <span className="num font-semibold text-ink-700">{v.registrationNumber}</span>
            {[v.city?.name, v.location?.area].filter(Boolean).length ? ` · ${[v.location?.area, v.city?.name].filter(Boolean).join(', ')}` : ''}
            {submittedAt ? <> · Submitted {dateTime(submittedAt)} <span className="text-ink-400">({waiting(submittedAt).toLowerCase()})</span></> : null}
          </>
        }
        actions={pending ? <QueueStepper position={queue.position(id)} base={BASE} /> : null}
      />

      {!pending ? (
        <DecidedNotice>
          This car is no longer waiting for review ({VEHICLE_APPROVAL[v.approval?.status]?.label.toLowerCase() || v.approval?.status}). Manage it from the <Link to={`/vehicles/${v.id}`} className="link">vehicle page</Link>.
        </DecidedNotice>
      ) : null}

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
      {v.approval?.reason ? (
        <div className="mb-5 rounded-lg border border-warning-100 bg-warning-50 p-3 text-bodySm text-warning-700">
          <span className="font-bold">{pending ? 'Earlier feedback:' : `Sent back${v.approval.reviewedAt ? ` ${dateTime(v.approval.reviewedAt)}` : ''}:`}</span> {v.approval.reason}
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Photos" description={`${v.photos?.length || 0} uploaded · click to enlarge`}>
            <Photos urls={v.photos} title={v.title} aspect="aspect-[2/1]" />
          </Panel>

          <Panel title="Documents" description="Private files — opened through a secure link and audited." flush>
            <DocumentsTable v={v} />
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
              ]}
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
                {can('vendors.read') && host._id ? (
                  <Link to={host.status === 'pending_approval' ? `/hosts/requests/${host._id}` : `/hosts/${host._id}`} className="link">{hostName}</Link>
                ) : (
                  <p className="font-semibold">{hostName}</p>
                )}
                <p className="num text-caption text-ink-500">{maskPhone(host.phone)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill map={VENDOR_STATUS} value={host.status} />
                {host.rating?.count ? <span className="inline-flex items-center gap-1 text-caption text-ink-600"><Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" aria-hidden="true" />{host.rating.avg.toFixed(1)} ({host.rating.count})</span> : null}
              </div>
              {!hostApproved ? <p className="text-caption text-warning-700">The host isn’t approved yet — the car becomes bookable only once they are.</p> : null}
              {can('vehicles.read') && host._id ? <Link to={`/vehicles?vendorId=${host._id}`} className="link inline-block text-caption">Other cars by this host</Link> : null}
            </div>
          </Panel>

          <Panel title="Pickup location" actions={<MapPin className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
            <KeyValue
              columns={1}
              items={[
                ['Address', v.location?.address],
                ['Area', [v.location?.area, v.location?.pincode].filter(Boolean).join(' · ')],
                ['City', v.city?.name],
              ]}
            />
            {point ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`} target="_blank" rel="noreferrer" className="link mt-4 inline-flex items-center gap-1 text-label">
                Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </Panel>

          <Panel title="Review history">
            <KeyValue
              columns={1}
              items={[
                ['Added', dateTime(v.createdAt)],
                ['Submitted for review', submittedAt ? dateTime(submittedAt) : null],
                ['Last reviewed', v.approval?.reviewedAt ? dateTime(v.approval.reviewedAt) : 'Never — new listing'],
              ]}
            />
          </Panel>
        </div>
      </div>

      {pending && canReview ? (
        <DecisionBar
          blocked={gaps.length > 0}
          note={gaps.length ? `Can’t approve: ${gaps.length} ${gaps.length === 1 ? 'item is' : 'items are'} missing. Send it back so the host can fix ${gaps.length === 1 ? 'it' : 'them'}.` : 'Approving makes the car bookable once the host is approved and the car is active.'}
        >
          <Button variant="danger-outline" icon={CircleX} onClick={() => setDialog('reject')}>Reject…</Button>
          <Button
            variant="success"
            icon={CircleCheck}
            disabled={gaps.length > 0}
            onClick={() => {
              setLuxury(Boolean(v.isLuxury));
              setDialog('approve');
            }}
          >
            Approve car
          </Button>
        </DecisionBar>
      ) : null}

      <ConfirmDialog
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={`Approve ${v.title}?`}
        description="The host is notified and the car goes live once the host is approved and the car is active."
        confirmLabel="Approve car"
        tone="success"
        onConfirm={() => review.mutateAsync({ decision: 'approve', isLuxury: luxury }).catch(refreshOnConflict)}
      >
        <Checkbox label="Mark as a luxury car" description="Adds it to the luxury collection." checked={luxury} onChange={(e) => setLuxury(e.target.checked)} />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title={`Reject ${v.title}?`}
        description="The host sees your note in the app and can fix the listing and submit it again."
        confirmLabel="Reject listing"
        tone="danger"
        reason={{ label: 'What should the host fix?', placeholder: 'e.g. Upload a clear photo of the RC and a valid insurance certificate.', minLength: 5, maxLength: 500 }}
        onConfirm={(reason) => review.mutateAsync({ decision: 'reject', reason }).catch(refreshOnConflict)}
      />
    </>
  );
}

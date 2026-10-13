import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Ban, Download, FileText, CircleSlash, Satellite, ExternalLink } from 'lucide-react';
import { api, ADMIN, downloadFile } from '@/admin/lib/api.js';
import { money, dateTime, duration, dateLong } from '@shared/lib/format.js';
import {
  BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS, KYC_STATUS, CLAIM_STATUS, SETTLEMENT_OUTSTANDING, PAYMENT_PURPOSE, REFUND_REASON,
  REALM_LABEL, CHECKLIST, PHOTO_ANGLE, FUEL, TRANSMISSION, fuelLabel, statusInfo,
} from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { cn, toPaise, toRupeesInput, humanize, errorMessage } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, MoneyInput, Textarea } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState, EmptyState } from '@/admin/components/EmptyState.jsx';
import { SecureImage } from '@/admin/components/SecureImage.jsx';
import { useToast } from '@/admin/components/Toast.jsx';

const CANCELLABLE = ['pending_payment', 'pending_vendor_approval', 'confirmed'];

function MiniTable({ columns, rows, empty }) {
  if (!rows?.length) return <p className="px-5 py-4 text-bodySm text-ink-500">{empty}</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('whitespace-nowrap border-b border-line bg-ink-50 px-5 py-2 text-overline uppercase tracking-[0.06em] text-ink-500', c.align === 'right' && 'text-right')}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map((c) => (
                <td key={c.key} className={cn('border-b border-line px-5 py-2.5 align-top text-bodySm text-ink-800 last:border-b-0', c.align === 'right' && 'num text-right')}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function priceLine(l) {
  if (l.kind === 'day') return { label: `Day rate · ${l.date}`, hint: l.source === 'override' ? 'special price' : l.source === 'weekend' ? 'weekend rate' : undefined, value: money(l.amountPaise) };
  return { label: `${l.hours} hr${l.hours > 1 ? 's' : ''} · ${l.date}`, hint: l.capped ? 'capped at day rate' : `${money(l.ratePaise)}/hr`, value: money(l.amountPaise) };
}

function Inspection({ title, data, canSeePhotos, isEv }) {
  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-line p-5 text-center">
        <p className="text-label text-ink-700">{title}</p>
        <p className="mt-1 text-caption text-ink-500">Not submitted yet.</p>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-label text-ink-900">{title}</h3>
        <span className="text-caption text-ink-500">{dateTime(data.createdAt)}</span>
      </div>
      <KeyValue
        items={[
          ['Odometer', `${data.odometerKm?.toLocaleString('en-IN')} km`],
          isEv ? ['Battery', data.batteryPercent !== undefined ? `${data.batteryPercent}%` : '—'] : ['Fuel', data.fuelEighths !== undefined ? fuelLabel(data.fuelEighths) : '—'],
        ]}
      />
      {canSeePhotos ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.photos.map((p) => (
            <SecureImage key={p.fileId} fileId={p.fileId} caption={PHOTO_ANGLE[p.angle] || humanize(p.angle)} alt={`${title} — ${PHOTO_ANGLE[p.angle] || p.angle}`} />
          ))}
        </div>
      ) : (
        <p className="text-caption text-ink-500">{data.photos.length} photos · viewing inspection photos requires the trips permission.</p>
      )}
      {data.checklist?.length ? (
        <ul className="space-y-1">
          {data.checklist.map((c) => (
            <li key={c.item} className="flex items-start gap-2 text-caption">
              <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', c.ok ? 'bg-success-500' : 'bg-danger-500')} aria-hidden="true" />
              <span className={c.ok ? 'text-ink-700' : 'font-semibold text-danger-700'}>
                {CHECKLIST[c.item] || humanize(c.item)} — {c.ok ? 'OK' : 'Issue'}
                {c.note ? <span className="font-normal text-ink-500"> · {c.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.damages?.length ? (
        <div className="rounded-md border border-warning-100 bg-warning-50 p-3">
          <p className="text-caption font-bold text-warning-700">Reported damage</p>
          <ul className="mt-1 space-y-1 text-caption text-ink-700">
            {data.damages.map((d, i) => (
              <li key={i}>
                <span className="font-semibold">{d.area}</span> ({d.severity}) — {d.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.notes ? <p className="text-caption text-ink-600"><span className="font-semibold">Notes:</span> {data.notes}</p> : null}
    </div>
  );
}

function TrackingPanel({ bookingId }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tracking', bookingId],
    queryFn: () => api.get(`${ADMIN}/tracking/bookings/${bookingId}`),
    refetchInterval: (q) => (q.state.data?.trackingAvailable ? 30_000 : false),
  });
  return (
    <Panel title="Live tracking" actions={<Satellite className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
      {isLoading ? (
        <p className="text-caption text-ink-500">Checking GPS data…</p>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} title="Tracking unavailable" />
      ) : !data.trackingAvailable ? (
        <div className="flex items-start gap-2.5">
          <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
          <p className="text-caption text-ink-600">{data.reason || 'No GPS tracking provider is configured.'} Positions are never estimated or simulated.</p>
        </div>
      ) : !data.latest ? (
        <p className="text-caption text-ink-600">The tracking provider has not reported any position for this trip yet.</p>
      ) : (
        <div className="space-y-3">
          <KeyValue
            columns={1}
            items={[
              ['Last position', `${data.latest.lat.toFixed(5)}, ${data.latest.lng.toFixed(5)}`],
              ['Reported', dateTime(data.latest.recordedAt)],
              ['Speed', data.latest.speedKmh !== undefined ? `${Math.round(data.latest.speedKmh)} km/h` : '—'],
              ['Service area', data.latest.insideServiceArea === false ? <StatusPill tone="danger">Outside</StatusPill> : data.latest.insideServiceArea ? <StatusPill tone="success">Inside</StatusPill> : '—'],
              ['Route points', `${data.route.length} · ${data.geofenceExits} outside the service area`],
            ]}
          />
          <a className="link inline-flex items-center gap-1 text-caption" href={`https://www.google.com/maps?q=${data.latest.lat},${data.latest.lng}`} target="_blank" rel="noreferrer noopener">
            Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
    </Panel>
  );
}

function DamageDecision({ booking, claim }) {
  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState(toRupeesInput(claim.amountPaise));
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const action = useAction((body) => api.post(`${ADMIN}/bookings/${booking.id}/damage-claim`, body), {
    success: (_d, v) => (v.decision === 'approve' ? 'Damage claim approved and trip settled' : 'Damage claim rejected and trip settled'),
    invalidate: [['booking', booking.id], ['bookings'], ['dashboard']],
    toastError: false,
    onSuccess: () => setMode(null),
  });
  const submit = () => {
    setErr(null);
    const body = { decision: mode, note: note.trim() || undefined };
    if (mode === 'approve') {
      const p = toPaise(amount);
      if (!p || p < 100 || p > claim.amountPaise) {
        setErr(`Enter an amount between ₹1 and ${money(claim.amountPaise)}.`);
        return;
      }
      body.approvedPaise = p;
    }
    action.mutate(body, { onError: (e) => setErr(errorMessage(e)) });
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" size="sm" onClick={() => { setMode('approve'); setErr(null); }}>Approve claim…</Button>
        <Button variant="danger-outline" size="sm" onClick={() => { setMode('reject'); setErr(null); }}>Reject claim…</Button>
      </div>
      <Modal
        open={Boolean(mode)}
        onClose={() => !action.isPending && setMode(null)}
        title={mode === 'approve' ? 'Approve damage claim' : 'Reject damage claim'}
        description="This settles the trip: deductions are taken from the deposit, the balance is refunded and host earnings are credited."
        footer={
          <>
            <Button onClick={() => setMode(null)} disabled={action.isPending}>Cancel</Button>
            <Button variant={mode === 'approve' ? 'success' : 'danger'} loading={action.isPending} onClick={submit}>
              {mode === 'approve' ? 'Approve and settle' : 'Reject and settle'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {mode === 'approve' ? (
            <Field label="Approved amount" htmlFor="claim-amt" hint={`Host claimed ${money(claim.amountPaise)}. You can approve less.`}>
              <MoneyInput id="claim-amt" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
            </Field>
          ) : null}
          <Field label="Note for the record" htmlFor="claim-note" hint="Shown in the settlement and audit log.">
            <Textarea id="claim-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
          </Field>
          {err ? <p className="text-caption font-semibold text-danger-600" role="alert">{err}</p> : null}
        </div>
      </Modal>
    </>
  );
}

export default function BookingDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const { data: b, isLoading, error, refetch } = useQuery({ queryKey: ['booking', id], queryFn: () => api.get(`${ADMIN}/bookings/${id}`) });

  const invalidate = [['booking', id], ['bookings'], ['dashboard']];
  const cancel = useAction((reason) => api.post(`${ADMIN}/bookings/${id}/cancel`, { reason }), { success: 'Booking cancelled — full refund initiated', invalidate, toastError: false });
  const waive = useAction((reason) => api.post(`${ADMIN}/bookings/${id}/waive-outstanding`, { reason }), { success: 'Outstanding amount waived', invalidate, toastError: false });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this booking" /></div>;

  const p = b.pricing || {};
  const insp = b.inspections || {};
  const claim = insp.damageClaim;
  const settlement = b.settlement || b.settlementPreview;
  const isEv = b.vehicle?.fuelType === 'electric';
  const history = [...(b.statusHistory || [])].reverse();

  const getInvoice = async (inv) => {
    setDownloading(inv.id);
    try {
      await downloadFile(`${ADMIN}/bookings/${b.id}/invoices/${inv.id}.pdf`, { fallbackName: `${inv.number}.pdf` });
    } catch (e) {
      toast.error(e);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: '/bookings', label: 'Bookings' }}
        title={<span className="num">{b.ref}</span>}
        crumb={b.ref}
        meta={
          <>
            <StatusPill map={BOOKING_STATUS} value={b.status} />
            <StatusPill map={PAYMENT_STATUS} value={b.payment?.status} dot={false} />
            {b.instantBooking ? <Tag tone="info">Instant</Tag> : null}
          </>
        }
        description={`Created ${dateTime(b.createdAt)} IST`}
        actions={
          can('bookings.manage') && CANCELLABLE.includes(b.status) ? (
            <Button variant="danger-outline" icon={Ban} onClick={() => setConfirm('cancel')}>
              Cancel booking
            </Button>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Trip">
            <div className="flex flex-col gap-5 sm:flex-row">
              {b.vehicle?.photoUrl ? <img src={b.vehicle.photoUrl} alt="" className="h-28 w-44 shrink-0 rounded-md border border-line object-cover" /> : null}
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <p className="text-headline text-ink-900">
                    {b.vehicleId ? <Link to={`/vehicles/${b.vehicleId}`} className="hover:text-brand-600 hover:underline">{b.vehicle?.title}</Link> : b.vehicle?.title}
                  </p>
                  <p className="text-caption text-ink-500">
                    <span className="num font-semibold text-ink-700">{b.vehicle?.registrationNumber}</span>
                    {[FUEL[b.vehicle?.fuelType], TRANSMISSION[b.vehicle?.transmission], b.vehicle?.seats ? `${b.vehicle.seats} seats` : null].filter(Boolean).map((x) => ` · ${x}`)}
                  </p>
                </div>
                <KeyValue
                  items={[
                    ['Start (IST)', dateTime(b.startAt)],
                    ['End (IST)', dateTime(b.endAt)],
                    ['Duration', duration(b.startAt, b.endAt)],
                    b.originalEndAt && String(b.originalEndAt) !== String(b.endAt) ? ['Originally ending', dateTime(b.originalEndAt)] : null,
                    ['Pickup', b.pickup?.type === 'doorstep' ? `Doorstep delivery${b.pickup.distanceKm ? ` · ${b.pickup.distanceKm} km` : ''}` : 'Host location'],
                    { label: 'Address', value: b.pickup?.address, wide: true },
                    b.holdExpiresAt ? ['Payment hold expires', dateTime(b.holdExpiresAt)] : null,
                    b.vendorDecisionDueAt ? ['Host must respond by', dateTime(b.vendorDecisionDueAt)] : null,
                    b.trip?.startedAt ? ['Trip started', dateTime(b.trip.startedAt)] : null,
                    b.trip?.returnSubmittedAt ? ['Returned', dateTime(b.trip.returnSubmittedAt)] : null,
                    b.trip?.returnReviewDueAt && b.status === 'return_pending' ? ['Host review due', dateTime(b.trip.returnReviewDueAt)] : null,
                    b.trip?.endedAt ? ['Trip closed', dateTime(b.trip.endedAt)] : null,
                  ]}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Price breakdown" description={p.couponCode ? `Coupon ${p.couponCode} applied` : undefined}>
            <AmountRows
              rows={[
                ...(p.lines || []).map(priceLine),
                { label: 'Rental', value: money(p.rentalPaise), strong: true },
                p.discountPaise ? { label: `Discount${p.couponCode ? ` (${p.couponCode})` : ''}`, value: `−${money(p.discountPaise)}`, tone: 'success' } : null,
                p.deliveryFeePaise ? { label: 'Doorstep delivery', value: money(p.deliveryFeePaise) } : null,
                { label: 'Convenience fee', value: money(p.convenienceFeePaise) },
                { label: `GST (${(p.gstBps || 0) / 100}%)`, value: money(p.gstPaise) },
                { label: 'Trip charges', value: money(p.chargesPaise), strong: true },
                { label: 'Refundable deposit', value: money(p.depositPaise) },
                { label: 'Total', value: money(p.totalPaise), strong: true },
                p.walletAppliedPaise ? { label: 'Paid from wallet', value: `−${money(p.walletAppliedPaise)}` } : null,
                { label: 'Payable via gateway', value: money(p.payablePaise) },
                { label: 'Included distance', value: `${p.includedKm ?? '—'} km · then ${money(p.extraKmChargePaise)}/km` },
                { label: 'Platform commission', value: `${(p.commissionBps || 0) / 100}%` },
              ]}
            />
          </Panel>

          {b.extensions?.length ? (
            <Panel title="Extensions" flush>
              <MiniTable
                rows={b.extensions}
                columns={[
                  { key: 'from', header: 'From → to', cell: (e) => `${dateTime(e.previousEndAt)} → ${dateTime(e.requestedEndAt)}` },
                  { key: 'hours', header: 'Hours', cell: (e) => e.pricing?.hours },
                  { key: 'status', header: 'Status', cell: (e) => humanize(e.status) },
                  { key: 'amt', header: 'Amount', align: 'right', cell: (e) => money(e.pricing?.totalPaise) },
                ]}
              />
            </Panel>
          ) : null}

          <Panel title="Inspections" description="Pickup and return evidence side by side.">
            <div className="grid gap-6 md:grid-cols-2">
              <Inspection title="Pickup" data={insp.pickup} canSeePhotos={can('trips.manage')} isEv={isEv} />
              <Inspection title="Return" data={insp.return} canSeePhotos={can('trips.manage')} isEv={isEv} />
            </div>
          </Panel>

          {claim ? (
            <Panel title="Damage claim" actions={<StatusPill map={CLAIM_STATUS} value={claim.status} />}>
              <div className="space-y-4">
                <KeyValue
                  items={[
                    ['Claimed by host', money(claim.amountPaise)],
                    claim.status === 'approved' ? ['Approved', money(claim.approvedPaise)] : null,
                    { label: 'Host description', value: claim.description, wide: true },
                    claim.reviewNote ? { label: 'Review note', value: claim.reviewNote, wide: true } : null,
                  ]}
                />
                {claim.photoFileIds?.length && can('trips.manage') ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {claim.photoFileIds.map((f, i) => <SecureImage key={f} fileId={f} alt={`Damage photo ${i + 1}`} />)}
                  </div>
                ) : null}
                {claim.status === 'pending' && can('trips.manage') && b.status === 'return_pending' ? <DamageDecision booking={b} claim={claim} /> : null}
              </div>
            </Panel>
          ) : null}

          {settlement ? (
            <Panel
              title={b.settlement ? 'Settlement' : 'Settlement preview'}
              description={b.settlement ? `Settled ${dateTime(b.settlement.settledAt)}` : 'Estimated from the return inspection; final after the host review or damage decision.'}
              actions={b.settlement?.outstandingStatus ? <StatusPill map={SETTLEMENT_OUTSTANDING} value={b.settlement.outstandingStatus} /> : null}
            >
              <AmountRows
                rows={[
                  { label: 'Distance driven', value: `${settlement.kmDriven ?? 0} km (${settlement.extraKm ?? 0} km extra)` },
                  { label: 'Extra km charge', value: money(settlement.extraKmPaise) },
                  !isEv ? { label: `Fuel shortfall (${settlement.fuelShortEighths ?? 0}/8)`, value: money(settlement.fuelPaise) } : null,
                  { label: `Late return (${settlement.lateHours ?? 0} h)`, value: money(settlement.lateFeePaise) },
                  { label: 'Damage', value: money(settlement.damagePaise) },
                  { label: 'Total deductions', value: money(settlement.totalDeductionsPaise), strong: true },
                  { label: 'Deposit refund to renter', value: money(settlement.depositRefundPaise), tone: 'success' },
                  { label: 'Outstanding from renter', value: money(settlement.outstandingPaise), tone: settlement.outstandingPaise ? 'danger' : undefined },
                ]}
              />
              {b.settlement?.outstandingStatus === 'due' && can('refunds.manage') ? (
                <div className="mt-4">
                  <Button variant="secondary" size="sm" onClick={() => setConfirm('waive')}>Waive outstanding amount…</Button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Payments" flush>
            <MiniTable
              rows={b.payments}
              empty="No payment attempts yet."
              columns={[
                { key: 'when', header: 'Created', cell: (x) => <span className="whitespace-nowrap">{dateTime(x.createdAt)}</span> },
                { key: 'purpose', header: 'Purpose', cell: (x) => PAYMENT_PURPOSE[x.purpose] || humanize(x.purpose) },
                { key: 'status', header: 'Status', cell: (x) => <StatusPill map={PAYMENT_STATUS} value={x.status} /> },
                {
                  key: 'ref',
                  header: 'Gateway reference',
                  cell: (x) => (
                    <div className="num text-caption">
                      <div>{x.razorpayPaymentId || '—'}</div>
                      <div className="text-ink-500">{x.razorpayOrderId}</div>
                      {x.method ? <div className="text-ink-500">{humanize(x.method)}{x.verifiedVia ? ` · via ${x.verifiedVia}` : ''}</div> : null}
                      {x.failureReason ? <div className="text-danger-600">{x.failureReason}</div> : null}
                    </div>
                  ),
                },
                { key: 'amt', header: 'Amount', align: 'right', cell: (x) => <div><div>{money(x.amountPaise)}</div>{x.refundedPaise ? <div className="text-caption text-ink-500">{money(x.refundedPaise)} refunded</div> : null}</div> },
              ]}
            />
          </Panel>

          <Panel title="Refunds" flush>
            <MiniTable
              rows={b.refunds}
              empty="No refunds on this booking."
              columns={[
                { key: 'when', header: 'Created', cell: (x) => <span className="whitespace-nowrap">{dateTime(x.createdAt)}</span> },
                { key: 'reason', header: 'Reason', cell: (x) => REFUND_REASON[x.reason] || humanize(x.reason) },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (x) => (
                    <div>
                      <StatusPill map={REFUND_STATUS} value={x.status} />
                      {x.status === 'failed' && x.lastError ? <p className="mt-1 max-w-[260px] text-caption text-danger-600">{x.lastError} · {x.attempts} attempts</p> : null}
                      {x.razorpayRefundId ? <p className="num mt-1 text-caption text-ink-500">{x.razorpayRefundId}</p> : null}
                    </div>
                  ),
                },
                { key: 'amt', header: 'Amount', align: 'right', cell: (x) => money(x.amountPaise) },
              ]}
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="People">
            <div className="space-y-4">
              <div>
                <p className="overline mb-1">Renter</p>
                {b.renter ? (
                  <>
                    {can('users.read') ? <Link to={`/users/${b.renter.id}`} className="link">{b.renter.name || 'Unnamed renter'}</Link> : <p className="font-semibold">{b.renter.name}</p>}
                    <p className="num text-caption text-ink-600">{b.renter.phone}</p>
                    <div className="mt-1"><StatusPill map={KYC_STATUS} value={b.renter.kycStatus} /></div>
                  </>
                ) : <p className="text-ink-400">—</p>}
              </div>
              <div>
                <p className="overline mb-1">Host</p>
                {b.host ? (
                  <>
                    {can('vendors.read') ? <Link to={`/hosts/${b.host.id}`} className="link">{b.host.name || 'Unnamed host'}</Link> : <p className="font-semibold">{b.host.name}</p>}
                    <p className="num text-caption text-ink-600">{b.host.phone}</p>
                  </>
                ) : <p className="text-ink-400">—</p>}
              </div>
            </div>
          </Panel>

          {b.cancellation ? (
            <Panel title="Cancellation">
              <KeyValue
                columns={1}
                items={[
                  ['Cancelled by', REALM_LABEL[b.cancellation.by?.realm] || humanize(b.cancellation.by?.realm)],
                  ['When', dateTime(b.cancellation.at)],
                  ['Reason', b.cancellation.reason],
                  b.cancellation.hoursBeforeStart !== undefined ? ['Notice', `${Math.round(b.cancellation.hoursBeforeStart)} h before start`] : null,
                  ['Refund', `${money(b.cancellation.refundPaise)}${b.cancellation.refundBps !== undefined ? ` (${b.cancellation.refundBps / 100}% of charges)` : ''}`],
                  b.cancellation.walletRefundPaise ? ['Returned to wallet', money(b.cancellation.walletRefundPaise)] : null,
                ]}
              />
            </Panel>
          ) : null}

          <Panel title="Timeline" flush>
            {history.length ? (
              <ol className="px-5 py-4">
                {history.map((h, i) => (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < history.length - 1 ? <span className="absolute left-[5px] top-4 bottom-0 w-px bg-line" aria-hidden="true" /> : null}
                    <span className={cn('mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2', i === 0 ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-surface')} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-label text-ink-900">{statusInfo(BOOKING_STATUS, h.status).label}</p>
                      <p className="text-caption text-ink-500">
                        {dateTime(h.at)} · {REALM_LABEL[h.by?.realm] || 'System'}
                      </p>
                      {h.note ? <p className="mt-0.5 text-caption text-ink-600">{h.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact title="No status changes recorded" />
            )}
          </Panel>

          <Panel title="Rental agreement">
            {insp.agreement ? (
              <KeyValue columns={1} items={[['Document', `${insp.agreement.title || 'Rental agreement'} · v${insp.agreement.version}`], ['Accepted as', insp.agreement.name], ['Accepted at', dateTime(insp.agreement.at)]]} />
            ) : (
              <p className="text-caption text-ink-500">Accepted by the renter at pickup. Not accepted yet.</p>
            )}
          </Panel>

          <Panel title="Invoices" flush>
            {b.invoices?.length ? (
              <ul className="divide-y divide-line">
                {b.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                    <FileText className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="num truncate text-label text-ink-900">{inv.number}</p>
                      <p className="text-caption text-ink-500">{humanize(inv.type)} · {dateLong(inv.issuedAt)} · {money(inv.totalPaise)}</p>
                    </div>
                    {can('payments.read') ? (
                      <Button size="xs" icon={Download} loading={downloading === inv.id} onClick={() => getInvoice(inv)} aria-label={`Download invoice ${inv.number}`}>
                        PDF
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-caption text-ink-500">Invoices are issued once payment is captured.</p>
            )}
          </Panel>

          {can('trips.manage') ? <TrackingPanel bookingId={b.id} /> : null}

          <Panel title="Booking meta">
            <KeyValue
              columns={1}
              items={[
                ['Paid', b.payment?.paidAt ? dateTime(b.payment.paidAt) : '—'],
                ['Collected via gateway', money(b.payment?.paidPaise)],
                ['Refunded', money(b.payment?.refundedPaise)],
                ['Odometer', b.trip?.startOdometerKm !== undefined ? `${b.trip.startOdometerKm} → ${b.trip.endOdometerKm ?? '…'} km` : '—'],
                ['Reviewed by renter', b.reviewed?.byUser ? 'Yes' : 'No'],
              ]}
            />
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        title={`Cancel booking ${b.ref}?`}
        description="The renter gets a full refund of everything paid (including the deposit), the car is released and both parties are notified. This cannot be undone."
        confirmLabel="Cancel booking"
        tone="danger"
        reason={{ label: 'Reason (shared with renter and host)', minLength: 5, placeholder: 'e.g. Car unavailable due to breakdown' }}
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
      <ConfirmDialog
        open={confirm === 'waive'}
        onClose={() => setConfirm(null)}
        title="Waive outstanding amount?"
        description={`The renter will no longer owe ${money(b.settlement?.outstandingPaise)} for this trip. The decision is audited.`}
        confirmLabel="Waive amount"
        reason={{ label: 'Reason', minLength: 5 }}
        onConfirm={(reason) => waive.mutateAsync(reason)}
      />
    </>
  );
}


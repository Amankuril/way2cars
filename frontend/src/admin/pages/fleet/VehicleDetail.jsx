import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Star, Ban, RotateCcw, CalendarRange, Pencil, Rocket, Trash2, Plus } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong, maskPhone } from '@shared/lib/format.js';
import { VEHICLE_APPROVAL, VEHICLE_STATUS, VENDOR_STATUS, BOOKING_STATUS, FUEL, TRANSMISSION, FEATURES, OWNERSHIP } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { humanize, fmtNumber, errorMessage, istDateTimeInput, fromIstDateTime } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button, ButtonLink, IconButton } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Select, Switch } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';
import { DocumentsTable, Photos } from './vehicleParts.jsx';

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

function BlockDialog({ id, open, onClose }) {
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [reason, setReason] = useState('maintenance');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const add = useAction((body) => api.post(`${ADMIN}/vehicles/${id}/blocks`, body), { success: 'Dates blocked', invalidate: [['vehicle-calendar', id], ['vehicle', id]], toastError: false, onSuccess: onClose });
  const submit = () => {
    setErr(null);
    if (!startAt || !endAt || endAt <= startAt) return setErr('The end must be after the start.');
    add.mutate({ startAt: fromIstDateTime(startAt), endAt: fromIstDateTime(endAt), reason, note: note.trim() || undefined }, {
      onError: (e) => setErr(e?.details?.bookings?.length ? `${errorMessage(e)} (${e.details.bookings.map((b) => b.ref).join(', ')})` : errorMessage(e)),
    });
  };
  return (
    <Modal
      open={open}
      onClose={() => !add.isPending && onClose()}
      title="Block dates"
      description="The car cannot be booked (in the app or at the office) during this time."
      footer={<><Button onClick={onClose} disabled={add.isPending}>Cancel</Button><Button variant="primary" loading={add.isPending} onClick={submit}>Block dates</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From (IST)" htmlFor="blk-from"><Input id="blk-from" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} min={istDateTimeInput(new Date())} className="num" /></Field>
        <Field label="Until (IST)" htmlFor="blk-to"><Input id="blk-to" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="num" /></Field>
        <Field label="Reason" htmlFor="blk-reason">
          <Select id="blk-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="maintenance">Maintenance</option>
            <option value="personal">Owner use</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Note" htmlFor="blk-note"><Input id="blk-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
        {err ? <p className="text-caption font-semibold text-danger-600 sm:col-span-2" role="alert">{err}</p> : null}
      </div>
    </Modal>
  );
}

function StatusControl({ v }) {
  const change = useAction((status) => api.patch(`${ADMIN}/vehicles/${v.id}/status`, { status }), {
    success: (d) => (d.upcomingBookings ? `Availability updated — ${d.upcomingBookings} upcoming bookings still need handling` : 'Availability updated'),
    invalidate: [['vehicle', v.id], ['vehicles']],
  });
  return (
    <Field label="Availability" htmlFor="veh-status" hint="Offline or in maintenance hides the car from search. Existing bookings are kept.">
      <Select id="veh-status" value={v.status} disabled={change.isPending} onChange={(e) => change.mutate(e.target.value)}>
        {Object.entries(VEHICLE_STATUS).map(([k, o]) => <option key={k} value={k}>{o.label || o}</option>)}
      </Select>
    </Field>
  );
}

function CalendarPanel({ id }) {
  const { can } = useAuth();
  const [blocking, setBlocking] = useState(false);
  const remove = useAction((blockId) => api.del(`${ADMIN}/vehicles/${id}/blocks/${blockId}`), { success: 'Blocked period removed', invalidate: [['vehicle-calendar', id]] });
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 60 * 86400000);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vehicle-calendar', id],
    queryFn: () => api.get(`${ADMIN}/vehicles/${id}/calendar`, { from: from.toISOString(), to: to.toISOString() }),
  });
  return (
    <Panel title="Calendar · next 60 days" description="Blocked periods and special prices." flush actions={can('vehicles.manage') ? <Button size="sm" icon={Plus} onClick={() => setBlocking(true)}>Block dates</Button> : <CalendarRange className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
      <BlockDialog id={id} open={blocking} onClose={() => setBlocking(false)} />
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
              { key: 'x', header: '', align: 'right', cell: (b) => (can('vehicles.manage') ? <IconButton icon={Trash2} size="sm" label="Remove blocked period" disabled={remove.isPending} onClick={() => remove.mutate(b.id)} /> : null) },
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

/** Money settings of the car: commission on an attached car, or the investor share on a fleet car. */
function CommercialsPanel({ v, canEdit }) {
  const company = v.ownership === 'company';
  const hostRate = v.vendor?.commissionBps;
  const [editing, setEditing] = useState(false);
  const [commission, setCommission] = useState(v.commissionBps != null ? String(v.commissionBps / 100) : '');
  const [investorId, setInvestorId] = useState(v.investor?.id ? String(v.investor.id) : '');
  const [share, setShare] = useState(v.investor?.shareBps ? String(v.investor.shareBps / 100) : '');
  const [error, setError] = useState(null);
  const investors = useQuery({ queryKey: ['investors', 'active'], queryFn: () => api.get(`${ADMIN}/investors`, { active: 'true', limit: 100 }), enabled: company && editing });
  const save = useAction((body) => api.patch(`${ADMIN}/vehicles/${v.id}/commercials`, body), { success: 'Car commercials saved', invalidate: [['vehicle', v.id]], toastError: false, onSuccess: () => setEditing(false) });
  const submit = () => {
    setError(null);
    if (company) {
      if (!investorId) return save.mutate({ investor: null }, { onError: (e) => setError(errorMessage(e)) });
      const pct = Number(share);
      if (!(pct > 0 && pct <= 100)) return setError('Investor share must be between 0.01% and 100%.');
      return save.mutate({ investor: { investorId, shareBps: Math.round(pct * 100) } }, { onError: (e) => setError(errorMessage(e)) });
    }
    if (commission === '') return save.mutate({ commissionBps: null }, { onError: (e) => setError(errorMessage(e)) });
    const pct = Number(commission);
    if (!(pct >= 0 && pct <= 90)) return setError('Commission must be 0–90%.');
    return save.mutate({ commissionBps: Math.round(pct * 100) }, { onError: (e) => setError(errorMessage(e)) });
  };
  return (
    <Panel title={company ? 'Revenue split' : 'Commission'} description={company ? 'Fleet cars earn 100% for WAY2CARS unless an investor funds the car.' : 'Way2Cars’ share of this car’s rentals; the host gets the rest.'}
      actions={canEdit && !editing ? <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>Change</Button> : null}>
      {!editing ? (
        company ? (
          v.investor ? (
            <AmountRows rows={[
              { label: 'Investor', value: <Link to={`/investors/${v.investor.id}`} className="link">{v.investor.name}</Link> },
              { label: 'Investor share', value: `${v.investor.shareBps / 100}%` },
              { label: 'WAY2CARS share', value: `${(10000 - v.investor.shareBps) / 100}%`, strong: true },
            ]} />
          ) : <p className="text-bodySm text-ink-800">No investor — 100% of this car’s revenue goes to WAY2CARS.</p>
        ) : (
          <AmountRows rows={[
            { label: 'WAY2CARS commission', value: `${(v.commissionBps ?? hostRate ?? 3000) / 100}%`, hint: v.commissionBps != null ? 'set for this car' : hostRate != null ? 'host rate' : 'platform default' },
            { label: 'Host earns', value: `${(10000 - (v.commissionBps ?? hostRate ?? 3000)) / 100}%`, strong: true },
          ]} />
        )
      ) : (
        <div className="space-y-3">
          {company ? (
            <>
              <Field label="Investor" htmlFor="cm-inv">
                <Select id="cm-inv" value={investorId} onChange={(e) => setInvestorId(e.target.value)}>
                  <option value="">No investor (100% WAY2CARS)</option>
                  {(investors.data || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              </Field>
              {investorId ? <Field label="Investor share of the car’s earnings" htmlFor="cm-share" hint="Of rent, extra-km, fuel and late charges (excl. GST and fees)."><Input id="cm-share" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} className="num" placeholder="e.g. 60" /></Field> : null}
              <p className="text-caption text-ink-500">Add investors in Finance → Investors. Applies to new bookings.</p>
            </>
          ) : (
            <Field label="Commission for this car (%)" htmlFor="cm-comm" hint={`Blank = host rate (${((hostRate ?? 3000) / 100)}%). Applies to new bookings.`}>
              <Input id="cm-comm" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} className="num" />
            </Field>
          )}
          {error ? <p className="text-caption font-semibold text-danger-600" role="alert">{error}</p> : null}
          <div className="flex gap-2"><Button onClick={() => setEditing(false)} disabled={save.isPending}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button></div>
        </div>
      )}
    </Panel>
  );
}

function PublishButton({ v }) {
  const [open, setOpen] = useState(false);
  const publish = useAction(() => api.post(`${ADMIN}/vehicles/${v.id}/publish`), { success: 'Car published — it is now bookable', invalidate: [['vehicle', v.id], ['vehicles']], toastError: false });
  const gaps = v.submissionGaps || [];
  return (
    <>
      <Button variant="primary" icon={Rocket} onClick={() => setOpen(true)}>Publish…</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={gaps.length ? 'This car is not ready yet' : 'Publish this car?'}
        description={gaps.length ? `Add: ${gaps.join(', ')}.` : v.ownership === 'company' ? 'It appears in search and can be booked in the app and at the office.' : 'This approves the listing for the host — it goes live in search and the host is notified.'}
        confirmLabel="Publish"
        onConfirm={() => publish.mutateAsync()}
      />
    </>
  );
}

export default function VehicleDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`${ADMIN}/vehicles/${id}`) });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this car" /></div>;
  // Cars awaiting review are approved or sent back on the Vehicle requests page.
  if (v.approval?.status === 'pending_review') return <Navigate to={`/vehicles/requests/${v.id}`} replace />;

  const p = v.pricing || {};
  const host = v.vendor || {};
  const company = v.ownership === 'company';
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
            <StatusPill map={OWNERSHIP} value={v.ownership} dot={false} />
          </>
        }
        actions={can('vehicles.manage') ? (
          <>
            <ButtonLink icon={Pencil} to={`/vehicles/${v.id}/edit`}>Edit car</ButtonLink>
            {v.approval?.status !== 'approved' && (company || v.vendor?.status === 'approved') ? <PublishButton v={v} /> : null}
          </>
        ) : null}
        description={
          <>
            <span className="num font-semibold text-ink-700">{v.registrationNumber}</span> · {v.city?.name} · {v.isListed ? 'Bookable now' : 'Not bookable'}
          </>
        }
      />

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
            <DocumentsTable v={v} />
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
                { label: 'Unlimited km add-on', value: p.unlimitedKmDailyPaise != null ? `${money(p.unlimitedKmDailyPaise)}/day` : 'Not offered' },
              ]}
            />
          </Panel>

          <CommercialsPanel v={v} canEdit={can('payouts.manage')} />

          {company ? (
            <Panel title="Owner"><p className="text-bodySm text-ink-800">WAY2CARS fleet — managed by operations.</p></Panel>
          ) : <Panel title="Host">
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
          </Panel>}

          <Panel title="Performance">
            <KeyValue
              items={[
                ['Completed trips', fmtNumber(v.stats?.trips || 0)],
                company ? null : ['Host earnings', money(v.stats?.earningsPaise || 0)],
                ['Rating', v.rating?.count ? `${v.rating.avg.toFixed(1)} from ${v.rating.count} reviews` : 'No reviews yet'],
                ['Listed since', dateLong(v.createdAt)],
                ['Submitted for review', v.approval?.submittedAt ? dateTime(v.approval.submittedAt) : null],
                ['Last reviewed', v.approval?.reviewedAt ? dateTime(v.approval.reviewedAt) : null],
              ]}
            />
          </Panel>

          {can('vehicles.manage') ? <Panel title="Availability"><StatusControl v={v} /></Panel> : null}
          {can('vehicles.manage') ? <FlagsPanel v={v} /> : null}
          <CalendarPanel id={v.id} />
        </div>
      </div>

    </>
  );
}

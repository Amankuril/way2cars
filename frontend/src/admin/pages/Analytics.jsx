import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, Download, Users, PhoneCall, MousePointerClick, MessageSquarePlus } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, maskPhone } from '@shared/lib/format.js';
import { FOLLOW_UP } from '@/admin/lib/labels.js';
import { useAction, useSearchState, useDocumentTitle } from '@/admin/lib/hooks.js';
import { compact, errorMessage, fmtNumber, istDayStart, istDayEndExclusive, istToday } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, StatTile } from '@/admin/components/Panel.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';
import { FilterBar, FilterSelect } from '@/admin/components/Filters.jsx';
import { DateRangePicker } from '@/admin/components/DateRangePicker.jsx';
import { DailyChart, fillDays } from '@/admin/components/Charts.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState, ErrorState } from '@/admin/components/EmptyState.jsx';
import { Button, classes as buttonClasses } from '@/admin/components/Button.jsx';
import { Modal } from '@/admin/components/Modal.jsx';
import { Field, Select, Textarea } from '@/admin/components/Form.jsx';

/**
 * Renter-app analytics: installs (first opens), activity, the booking funnel and bounce rate, the most
 * viewed cars, and a call list of signed-in renters who dropped off before paying.
 */

const SERIES = {
  installs: { label: 'Installs', key: 'installs' },
  opens: { label: 'App opens', key: 'opens' },
  vehicleViews: { label: 'Car views', key: 'vehicleViews' },
  checkouts: { label: 'Checkouts started', key: 'checkouts' },
  payments: { label: 'Payments', key: 'payments' },
};
const STAGE_FILTER = { 1: 'Viewed a car or later', 2: 'Started checkout or later', 3: 'Started payment or later', 4: 'Payment failed' };

function Funnel({ steps }) {
  const top = Math.max(1, ...steps.map((s) => s.users ?? 0), ...steps.map((s) => s.devices ?? 0));
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const value = s.devices ?? s.users ?? 0;
        const prev = i ? (steps[i - 1].devices ?? steps[i - 1].users ?? 0) : null;
        return (
          <li key={s.step}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-bodySm">
              <span className="font-semibold text-ink-800">{s.step}</span>
              <span className="num text-ink-600">
                {fmtNumber(value)} {s.devices != null ? 'devices' : 'renters'}
                {s.devices != null && s.users ? <span className="text-ink-400"> · {fmtNumber(s.users)} signed in</span> : null}
                {prev ? <span className="ml-2 text-caption text-ink-400">{Math.round((value / prev) * 100)}% of previous</span> : null}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (value / top) * 100)}%` }} /></div>
          </li>
        );
      })}
    </ol>
  );
}

function FollowUpForm({ row, onClose }) {
  const [status, setStatus] = useState('contacted');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const save = useAction((body) => api.post(`${ADMIN}/analytics/follow-ups`, body), { success: 'Follow-up saved', invalidate: [['analytics', 'drop-offs']], toastError: false, onSuccess: onClose });
  const activity = useQuery({ queryKey: ['analytics', 'activity', row.userId], queryFn: () => api.get(`${ADMIN}/analytics/users/${row.userId}/activity`) });
  return (
    <Modal open onClose={() => !save.isPending && onClose()} title={`Follow up with ${row.name || 'renter'}`} description={row.phone ? `Call ${maskPhone(row.phone)} — last step: ${row.stage}${row.vehicle ? ` (${row.vehicle.title})` : ''}.` : row.stage} size="lg"
      footer={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(compact({ userId: row.userId, status, note: note.trim() || undefined }), { onError: (e) => setError(errorMessage(e)) })}>Save follow-up</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Outcome" htmlFor="fu-status"><Select id="fu-status" value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(FOLLOW_UP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          {row.phone ? <div className="flex items-end"><a href={`tel:+91${row.phone}`} className={buttonClasses({})}><PhoneCall className="h-4 w-4" aria-hidden="true" />Call {maskPhone(row.phone)}</a></div> : null}
        </div>
        <Field label="Note" htmlFor="fu-note"><Textarea id="fu-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did they say? e.g. price too high, will book next weekend" /></Field>
        {error ? <p className="text-caption font-semibold text-danger-600" role="alert">{error}</p> : null}
        <div>
          <h3 className="mb-2 text-label text-ink-800">Recent activity</h3>
          {activity.data ? (
            <div className="max-h-56 overflow-y-auto rounded-md border border-line">
              <MiniTable rows={activity.data.events.slice(0, 30)} empty="No activity recorded." columns={[
                { key: 'at', header: 'When', cell: (e) => dateTime(e.at) },
                { key: 'event', header: 'Event', cell: (e) => e.event.replace(/_/g, ' ') },
                { key: 'detail', header: 'Detail', cell: (e) => e.props?.screen || e.props?.reason || (e.props?.amountPaise ? money(e.props.amountPaise) : '—') },
              ]} />
            </div>
          ) : <p className="text-caption text-ink-500">Loading…</p>}
          {activity.data?.followUps?.length ? (
            <ul className="mt-3 space-y-1 text-caption text-ink-600">
              {activity.data.followUps.map((f, i) => <li key={i}><span className="font-semibold">{FOLLOW_UP[f.status]?.label}</span> · {dateTime(f.at)}{f.by ? ` · ${f.by}` : ''}{f.note ? ` — ${f.note}` : ''}</li>)}
            </ul>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

export default function Analytics() {
  useDocumentTitle('Analytics');
  const [s, set] = useSearchState({ from: istToday(-29), to: istToday(0), series: 'installs', minStage: '2' });
  const range = compact({ from: istDayStart(s.from), to: istDayEndExclusive(s.to) });
  const overview = useQuery({ queryKey: ['analytics', 'overview', range], queryFn: () => api.get(`${ADMIN}/analytics/overview`, range) });
  const drops = useQuery({ queryKey: ['analytics', 'drop-offs', range, s.minStage], queryFn: () => api.get(`${ADMIN}/analytics/drop-offs`, { ...range, minStage: s.minStage }) });
  const [calling, setCalling] = useState(null);
  const o = overview.data;
  const series = SERIES[s.series] || SERIES.installs;

  const exportCsv = () => {
    const rows = drops.data || [];
    const head = ['Name', 'Phone', 'Email', 'Last step', 'Car', 'Last activity (IST)', 'Follow-up', 'Note'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head, ...rows.map((r) => [r.name, r.phone, r.email, r.stage, r.vehicle?.title, dateTime(r.lastActivityAt), r.followUp ? FOLLOW_UP[r.followUp.status]?.label : '', r.followUp?.note])].map((r) => r.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `drop-offs-${s.from}-to-${s.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const dropColumns = [
    { key: 'who', header: 'Renter', cell: (r) => <div><Link to={`/users/${r.userId}`} className="font-semibold text-ink-900 hover:text-brand-600 hover:underline">{r.name || 'No name yet'}</Link><div className="num text-caption text-ink-500">{r.phone ? maskPhone(r.phone) : '—'}</div></div> },
    { key: 'stage', header: 'Dropped at', cell: (r) => <StatusPill tone={r.stageLevel >= 3 ? 'danger' : r.stageLevel === 2 ? 'warning' : 'neutral'} dot={false}>{r.stage}</StatusPill> },
    { key: 'car', header: 'Car', cell: (r) => (r.vehicle ? <Link to={`/vehicles/${r.vehicle.id}`} className="link">{r.vehicle.title}</Link> : '—') },
    { key: 'last', header: 'Last activity', cell: (r) => <span className="whitespace-nowrap">{dateTime(r.lastActivityAt)}</span> },
    { key: 'fu', header: 'Follow-up', cell: (r) => (r.followUp ? <div><StatusPill map={FOLLOW_UP} value={r.followUp.status} dot={false} /><div className="mt-0.5 max-w-[220px] truncate text-caption text-ink-500" title={r.followUp.note}>{r.followUp.note || dateTime(r.followUp.at)}</div></div> : <span className="text-caption text-ink-400">Not contacted</span>) },
    { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', cell: (r) => <Button size="xs" icon={MessageSquarePlus} onClick={() => setCalling(r)}>Follow up</Button> },
  ];

  return (
    <>
      <PageHeader title="Analytics" description="How renters use the app: installs (first opens), activity, where they drop off before booking, and who to call. Counts come from the renter app (v1.2 and later) and the web app." />
      <FilterBar>
        <DateRangePicker label="Period (IST)" value={{ from: s.from, to: s.to }} onChange={(r) => set({ from: r.from, to: r.to })} allowClear={false} />
      </FilterBar>
      {overview.error ? <div className="panel mb-4"><ErrorState error={overview.error} onRetry={overview.refetch} /></div> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Download} label="Installs" value={o ? fmtNumber(o.installs) : '…'} sub="Devices opening the app for the first time" />
        <StatTile icon={Activity} label="Active devices" value={o ? fmtNumber(o.activeDevices) : '…'} sub={o ? `${fmtNumber(o.activeUsers)} signed-in renters` : undefined} />
        <StatTile icon={MousePointerClick} label="Bounce rate" value={o ? `${o.bounceRatePct}%` : '…'} sub={o ? `Of ${fmtNumber(o.sessions)} sessions: left without viewing a car` : undefined} />
        <StatTile icon={Users} label="View → booking" value={o ? `${o.conversionPct}%` : '…'} sub="Renters who viewed a car and paid" />
        <StatTile label="Paid bookings (app)" value={o ? fmtNumber(o.payments.bookingsPaid) : '…'} sub={o ? `${money(o.payments.revenuePaise)} collected · ${o.payments.failed} payment failures` : undefined} />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Daily" actions={<Tabs label="Metric" value={s.series} onChange={(v) => set({ series: v })} items={Object.entries(SERIES).map(([k, v]) => ({ value: k, label: v.label }))} />}>
          {o ? <DailyChart data={fillDays(o.daily, s.from, s.to, Object.keys(SERIES))} dataKey={series.key} name={series.label.toLowerCase()} format={fmtNumber} /> : <div className="h-60" />}
        </Panel>
        <Panel title="Booking funnel" description="Unique devices at each step (paid bookings counted from the booking records).">
          {o ? <Funnel steps={o.funnel} /> : null}
        </Panel>
      </div>
      <Panel title="Most viewed cars" className="mb-4" flush>
        <MiniTable rows={o?.topViewed} rowKey={(r) => r.vehicleId} empty="No car views in this period." columns={[
          { key: 'car', header: 'Car', cell: (r) => <Link to={`/vehicles/${r.vehicleId}`} className="link">{r.title}</Link> },
          { key: 'reg', header: 'Reg. no.', cell: (r) => <span className="num">{r.registrationNumber || '—'}</span> },
          { key: 'views', header: 'Views', align: 'right', cell: (r) => fmtNumber(r.views) },
          { key: 'viewers', header: 'Devices', align: 'right', cell: (r) => fmtNumber(r.viewers) },
          { key: 'bookings', header: 'Paid bookings', align: 'right', cell: (r) => fmtNumber(r.bookings) },
          { key: 'conv', header: 'Conversion', align: 'right', cell: (r) => (r.viewers ? `${Math.round((r.bookings / r.viewers) * 100)}%` : '—') },
        ]} />
      </Panel>
      <Panel title="Drop-offs to call" description="Signed-in renters who reached a step but have not paid for a booking since. Call them, then log the outcome." flush
        actions={<><FilterSelect label="Reached" value={s.minStage} onChange={(v) => set({ minStage: v || '1' })} options={STAGE_FILTER} allLabel={STAGE_FILTER[1]} /><Button size="sm" icon={Download} disabled={!drops.data?.length} onClick={exportCsv}>Export CSV</Button></>}>
        <DataTable columns={dropColumns} rows={drops.data} rowKey={(r) => r.userId} loading={drops.isLoading} error={drops.error} onRetry={drops.refetch}
          empty={<EmptyState icon={PhoneCall} title="No drop-offs in this period" description="Renters who view cars or start checkout without paying will appear here." />} />
      </Panel>
      {calling ? <FollowUpForm row={calling} onClose={() => setCalling(null)} /> : null}
    </>
  );
}

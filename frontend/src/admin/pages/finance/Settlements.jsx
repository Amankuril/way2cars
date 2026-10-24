import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download, Scale } from 'lucide-react';
import { api, ADMIN, downloadFile } from '@/admin/lib/api.js';
import { money, dateTime, maskPhone } from '@shared/lib/format.js';
import { BOOKING_STATUS, BANK_STATUS, OWNERSHIP, OWNER_PAYOUT, BOOKING_SOURCE } from '@/admin/lib/labels.js';
import { useSearchState, useDocumentTitle } from '@/admin/lib/hooks.js';
import { compact, istDayStart, istDayEndExclusive, istToday, shortId } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { useToast } from '@/admin/components/Toast.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/admin/components/DataTable.jsx';
import { FilterBar, FilterSelect, FilterChip } from '@/admin/components/Filters.jsx';
import { DateRangePicker } from '@/admin/components/DateRangePicker.jsx';
import { StatTile } from '@/admin/components/Panel.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';
import { Button } from '@/admin/components/Button.jsx';

/**
 * Where every rupee goes: booking-wise split between WAY2CARS and car owners, and each host's
 * balance (on hold / available / requested / paid out). Settling a host happens on the host page.
 */
export default function Settlements() {
  useDocumentTitle('Settlements');
  const { can } = useAuth();
  const toast = useToast();
  const [s, set] = useSearchState({ tab: 'bookings', from: istToday(-29), to: istToday(14), ownership: '', vendorId: '' });
  const [exporting, setExporting] = useState(false);
  const range = compact({ from: istDayStart(s.from), to: istDayEndExclusive(s.to), ownership: s.ownership, vendorId: s.vendorId });
  const bookings = useQuery({ queryKey: ['settlements', range], queryFn: () => api.get(`${ADMIN}/reports/settlements`, range), enabled: s.tab === 'bookings' });
  const hosts = useQuery({ queryKey: ['host-balances'], queryFn: () => api.get(`${ADMIN}/reports/host-balances`), enabled: s.tab === 'hosts' });

  const exportCsv = async () => {
    setExporting(true);
    try {
      if (s.tab === 'bookings') await downloadFile(`${ADMIN}/reports/settlements`, { query: { ...range, format: 'csv' }, fallbackName: `settlements-${s.from}-to-${s.to}.csv` });
      else await downloadFile(`${ADMIN}/reports/host-balances`, { query: { format: 'csv' }, fallbackName: 'host-balances.csv' });
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(false);
    }
  };

  const t = bookings.data?.totals;
  const h = hosts.data?.totals;
  const bookingColumns = [
    {
      key: 'ref',
      header: 'Booking',
      cell: (r) => (
        <div>
          <Link to={`/bookings/${r.bookingId}`} className="num font-bold text-brand-600 hover:underline">{r.ref}</Link>
          <div className="text-caption text-ink-500">{dateTime(r.startAt)}</div>
        </div>
      ),
    },
    {
      key: 'car',
      header: 'Car / owner',
      cell: (r) => (
        <div className="max-w-[220px]">
          <CellStack primary={r.vehicle} secondary={r.ownership === 'company' ? 'WAY2CARS fleet' : r.host} />
          {r.source === 'offline' ? <StatusPill map={BOOKING_SOURCE} value="offline" dot={false} className="mt-1" /> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Booking', cell: (r) => <StatusPill map={BOOKING_STATUS} value={r.status} /> },
    { key: 'collected', header: 'Collected', align: 'right', cell: (r) => <div><div className="font-semibold text-ink-900">{money(r.collectedPaise)}</div>{r.balanceDuePaise ? <div className="text-caption text-warning-700">{money(r.balanceDuePaise)} due</div> : null}</div> },
    { key: 'gst', header: 'GST', align: 'right', cell: (r) => money(r.gstPaise) },
    { key: 'commission', header: 'Comm.', align: 'right', cell: (r) => `${(r.commissionBps || 0) / 100}%` },
    { key: 'owner', header: 'Owner share', align: 'right', cell: (r) => (r.ownership === 'company' ? '—' : money(r.ownerSharePaise)) },
    { key: 'platform', header: 'WAY2CARS', align: 'right', cell: (r) => <span className="font-semibold text-ink-900">{money(r.platformSharePaise)}</span> },
    { key: 'payout', header: 'Owner payout', cell: (r) => <StatusPill map={OWNER_PAYOUT} value={r.ownerPayout} dot={false} /> },
  ];
  const hostColumns = [
    { key: 'host', header: 'Host', cell: (r) => <div><Link to={`/hosts/${r.vendorId}`} className="link">{r.host || 'Unnamed host'}</Link><div className="num text-caption text-ink-500">{maskPhone(r.phone)}</div></div> },
    { key: 'comm', header: 'Commission', cell: (r) => (r.commissionBps === null ? <span className="text-ink-500">Default</span> : `${r.commissionBps / 100}%`) },
    { key: 'bank', header: 'Bank', cell: (r) => <div><div className="num text-caption">{r.bank || '—'}</div>{r.bankStatus === 'missing' ? <StatusPill tone="danger" dot={false}>No bank account</StatusPill> : <StatusPill map={BANK_STATUS} value={r.bankStatus} dot={false} />}</div> },
    { key: 'hold', header: 'On hold', align: 'right', cell: (r) => money(r.onHoldPaise) },
    { key: 'avail', header: 'Available', align: 'right', cell: (r) => <span className="font-semibold text-ink-900">{money(r.availablePaise)}</span> },
    { key: 'req', header: 'Requested', align: 'right', cell: (r) => money(r.requestedPaise) },
    { key: 'paid', header: 'Paid out', align: 'right', cell: (r) => money(r.paidOutPaise) },
    { key: 'act', header: '', align: 'right', cell: (r) => (r.availablePaise >= 100 && can('payouts.manage') ? <Link to={`/hosts/${r.vendorId}`} className="link text-caption">Settle</Link> : null) },
  ];

  return (
    <>
      <PageHeader
        title="Settlements"
        description="Each booking's money split between WAY2CARS and the car owner, and what every host is owed. Owner shares are credited after the trip, held for the payout hold period, then settled to the host's bank account."
        actions={<Button icon={Download} loading={exporting} onClick={exportCsv}>Export CSV</Button>}
      />
      <Tabs className="mb-4" value={s.tab} onChange={(tab) => set({ tab })} items={[{ value: 'bookings', label: 'Booking-wise split' }, { value: 'hosts', label: 'Host balances' }]} />

      {s.tab === 'bookings' ? (
        <>
          <FilterBar>
            <DateRangePicker label="Trip start (IST)" value={{ from: s.from, to: s.to }} onChange={(r) => set({ from: r.from, to: r.to })} allowClear={false} />
            <FilterSelect label="Car owner" value={s.ownership} onChange={(v) => set({ ownership: v })} options={OWNERSHIP} allLabel="All cars" />
          </FilterBar>
          {s.vendorId ? <div className="-mt-1 mb-4"><FilterChip label={`Host …${shortId(s.vendorId)}`} onClear={() => set({ vendorId: '' })} /></div> : null}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile label="Collected" value={t ? money(t.collectedPaise) : '…'} sub={t ? `${t.bookings} bookings` : undefined} />
            <StatTile label="WAY2CARS share" value={t ? money(t.platformSharePaise) : '…'} sub="Excl. GST · expected for trips not yet settled" />
            <StatTile label="Owner share" value={t ? money(t.ownerSharePaise) : '…'} />
            <StatTile label="GST to remit" value={t ? money(t.gstPaise) : '…'} />
            <StatTile label="Deposits held" value={t ? money(t.depositHeldPaise) : '…'} sub={t?.balanceDuePaise ? `${money(t.balanceDuePaise)} balances due` : undefined} />
          </div>
          <DataTable
            columns={bookingColumns}
            rows={bookings.data?.rows}
            rowKey={(r) => r.bookingId}
            loading={bookings.isLoading}
            error={bookings.error}
            onRetry={bookings.refetch}
            empty={<EmptyState icon={Scale} title="No paid bookings in this range" description="Bookings appear once money has been collected." />}
          />
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="On hold" value={h ? money(h.onHoldPaise) : '…'} sub="Inside the payout hold period" />
            <StatTile label="Available to settle" value={h ? money(h.availablePaise) : '…'} />
            <StatTile label="Withdrawals requested" value={h ? money(h.requestedPaise) : '…'} />
            <StatTile label="Paid out (lifetime)" value={h ? money(h.paidOutPaise) : '…'} />
          </div>
          <DataTable
            columns={hostColumns}
            rows={hosts.data?.rows}
            rowKey={(r) => r.vendorId}
            loading={hosts.isLoading}
            error={hosts.error}
            onRetry={hosts.refetch}
            empty={<EmptyState icon={Scale} title="No host balances yet" />}
          />
        </>
      )}
    </>
  );
}

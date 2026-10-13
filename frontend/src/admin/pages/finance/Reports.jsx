import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3 } from 'lucide-react';
import { api, ADMIN, downloadFile } from '@/admin/lib/api.js';
import { money, dateTime } from '@shared/lib/format.js';
import { BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_PURPOSE } from '@/admin/lib/labels.js';
import { useCatalog, useSearchState } from '@/admin/lib/hooks.js';
import { compact, fmtNumber, istDayStart, istDayEndExclusive, istToday } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { DataTable } from '@/admin/components/DataTable.jsx';
import { FilterBar, FilterSelect } from '@/admin/components/Filters.jsx';
import { DateRangePicker } from '@/admin/components/DateRangePicker.jsx';
import { Panel, StatTile } from '@/admin/components/Panel.jsx';
import { Tabs } from '@/admin/components/Tabs.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { EmptyState } from '@/admin/components/EmptyState.jsx';
import { DailyChart, fillDays, compactRupees } from '@/admin/components/Charts.jsx';
import { useToast } from '@/admin/components/Toast.jsx';

const sum = (rows, key) => (rows || []).reduce((a, r) => a + (r[key] || 0), 0);
const m = (key) => (r) => money(r[key] || 0);
const dateCell = (r) => <span className="num whitespace-nowrap">{r.date}</span>;

const STATUS_COLUMNS = Object.keys(BOOKING_STATUS);

const REPORTS = {
  revenue: {
    label: 'Revenue',
    city: true,
    description: 'Paid bookings by payment day (IST). GBV = trip charges excluding the refundable deposit.',
    chart: { key: 'gbvPaise', name: 'GBV', format: (v) => money(v), axis: compactRupees },
    tiles: (rows) => [
      ['Paid bookings', fmtNumber(sum(rows, 'bookings'))],
      ['Gross booking value', money(sum(rows, 'gbvPaise'))],
      ['Discounts', money(sum(rows, 'discountPaise'))],
      ['Platform revenue', money(sum(rows, 'commissionPaise') + sum(rows, 'convenienceFeePaise')), 'Commission + convenience fees'],
    ],
    columns: [
      { key: 'date', header: 'Date', cell: dateCell },
      { key: 'bookings', header: 'Bookings', align: 'right', cell: (r) => fmtNumber(r.bookings) },
      { key: 'rentalPaise', header: 'Rental', align: 'right', cell: m('rentalPaise') },
      { key: 'discountPaise', header: 'Discount', align: 'right', cell: m('discountPaise') },
      { key: 'convenienceFeePaise', header: 'Conv. fee', align: 'right', cell: m('convenienceFeePaise') },
      { key: 'deliveryFeePaise', header: 'Delivery', align: 'right', cell: m('deliveryFeePaise') },
      { key: 'gstPaise', header: 'GST', align: 'right', cell: m('gstPaise') },
      { key: 'gbvPaise', header: 'GBV', align: 'right', cell: (r) => <span className="font-semibold text-ink-900">{money(r.gbvPaise)}</span> },
      { key: 'commissionPaise', header: 'Commission', align: 'right', cell: m('commissionPaise') },
    ],
  },
  bookings: {
    label: 'Bookings',
    city: true,
    description: 'Bookings created per day (IST) and their current status.',
    chart: { key: 'total', name: 'bookings', format: (v) => fmtNumber(v) },
    tiles: (rows) => [
      ['Bookings created', fmtNumber(sum(rows, 'total'))],
      ['Completed', fmtNumber(sum(rows, 'completed'))],
      ['Cancelled', fmtNumber(sum(rows, 'cancelled'))],
      ['Payment not completed', fmtNumber(sum(rows, 'expired'))],
    ],
    columns: [
      { key: 'date', header: 'Date', cell: dateCell },
      { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="font-semibold text-ink-900">{fmtNumber(r.total)}</span> },
      ...STATUS_COLUMNS.map((st) => ({ key: st, header: BOOKING_STATUS[st].label, align: 'right', cell: (r) => (r[st] ? fmtNumber(r[st]) : <span className="text-ink-300">0</span>) })),
    ],
  },
  'vehicle-performance': {
    label: 'Vehicle performance',
    city: true,
    description: 'Completed trips settled in the period, by car. Utilisation = booked hours ÷ hours in the period.',
    tiles: (rows) => [
      ['Cars with trips', fmtNumber(rows?.length || 0)],
      ['Trips', fmtNumber(sum(rows, 'trips'))],
      ['Rental value', money(sum(rows, 'rentalPaise'))],
      ['Host earnings', money(sum(rows, 'hostEarningsPaise'))],
    ],
    rowKey: (r) => r.vehicleId,
    columns: [
      { key: 'vehicle', header: 'Car', cell: (r) => <div><Link to={`/vehicles/${r.vehicleId}`} className="link">{r.vehicle}</Link><div className="num text-caption text-ink-500">{r.registration}</div></div> },
      { key: 'trips', header: 'Trips', align: 'right', cell: (r) => fmtNumber(r.trips) },
      { key: 'bookedHours', header: 'Booked hrs', align: 'right', cell: (r) => fmtNumber(r.bookedHours) },
      { key: 'utilisationPct', header: 'Utilisation', align: 'right', cell: (r) => `${r.utilisationPct}%` },
      { key: 'kmDriven', header: 'Km driven', align: 'right', cell: (r) => fmtNumber(r.kmDriven) },
      { key: 'rentalPaise', header: 'Rental', align: 'right', cell: m('rentalPaise') },
      { key: 'hostEarningsPaise', header: 'Host earnings', align: 'right', cell: m('hostEarningsPaise') },
      { key: 'rating', header: 'Rating', align: 'right', cell: (r) => (r.rating ? r.rating.toFixed(1) : '—') },
    ],
  },
  'user-growth': {
    label: 'User growth',
    city: false,
    description: 'New renter and host sign-ups per day (IST).',
    chart: { key: 'newUsers', name: 'new renters', format: (v) => fmtNumber(v) },
    tiles: (rows) => [
      ['New renters', fmtNumber(sum(rows, 'newUsers'))],
      ['New hosts', fmtNumber(sum(rows, 'newHosts'))],
    ],
    columns: [
      { key: 'date', header: 'Date', cell: dateCell },
      { key: 'newUsers', header: 'New renters', align: 'right', cell: (r) => fmtNumber(r.newUsers) },
      { key: 'newHosts', header: 'New hosts', align: 'right', cell: (r) => fmtNumber(r.newHosts) },
    ],
  },
  'host-earnings': {
    label: 'Host earnings',
    city: false,
    description: 'Trip earnings credited and payouts made in the period, by host. Balances are current.',
    tiles: (rows) => [
      ['Hosts', fmtNumber(rows?.length || 0)],
      ['Earned', money(sum(rows, 'earnedPaise'))],
      ['Paid out', money(sum(rows, 'paidOutPaise'))],
      ['Available now', money(sum(rows, 'availablePaise'))],
    ],
    rowKey: (r) => r.vendorId,
    columns: [
      { key: 'host', header: 'Host', cell: (r) => <div><Link to={`/hosts/${r.vendorId}`} className="link">{r.host || 'Unnamed host'}</Link><div className="num text-caption text-ink-500">{r.phone}</div></div> },
      { key: 'trips', header: 'Trips', align: 'right', cell: (r) => fmtNumber(r.trips) },
      { key: 'earnedPaise', header: 'Earned', align: 'right', cell: m('earnedPaise') },
      { key: 'paidOutPaise', header: 'Paid out', align: 'right', cell: m('paidOutPaise') },
      { key: 'pendingPaise', header: 'In hold', align: 'right', cell: m('pendingPaise') },
      { key: 'availablePaise', header: 'Available', align: 'right', cell: m('availablePaise') },
    ],
  },
  payments: {
    label: 'Payments',
    city: false,
    perm: 'payments.read',
    description: 'Gateway payments created in the period (latest 5,000).',
    tiles: (rows) => [
      ['Payments', fmtNumber(rows?.length || 0)],
      ['Captured', money(sum((rows || []).filter((r) => r.status === 'paid'), 'amountPaise'))],
      ['Refunded', money(sum(rows, 'refundedPaise'))],
      ['Failed', fmtNumber((rows || []).filter((r) => r.status === 'failed').length)],
    ],
    rowKey: (r) => r.razorpayOrderId || r.createdAt,
    columns: [
      { key: 'createdAt', header: 'Created', cell: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
      { key: 'booking', header: 'Booking', cell: (r) => <span className="num">{r.booking || '—'}</span> },
      { key: 'purpose', header: 'Purpose', cell: (r) => PAYMENT_PURPOSE[r.purpose] || r.purpose },
      { key: 'status', header: 'Status', cell: (r) => <StatusPill map={PAYMENT_STATUS} value={r.status} dot={false} /> },
      { key: 'method', header: 'Method', cell: (r) => r.method || '—' },
      { key: 'ids', header: 'Gateway IDs', cell: (r) => <div className="num font-mono text-caption text-ink-600"><div>{r.razorpayOrderId}</div><div>{r.razorpayPaymentId}</div></div> },
      { key: 'amountPaise', header: 'Amount', align: 'right', cell: m('amountPaise') },
      { key: 'refundedPaise', header: 'Refunded', align: 'right', cell: m('refundedPaise') },
    ],
  },
};

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const cities = useCatalog('cities');
  const [s, set] = useSearchState({ report: 'revenue', from: istToday(-29), to: istToday(), cityId: '' });
  const [downloading, setDownloading] = useState(false);
  const available = Object.entries(REPORTS).filter(([, r]) => !r.perm || can(r.perm));
  const key = REPORTS[s.report] && available.some(([k]) => k === s.report) ? s.report : 'revenue';
  const report = REPORTS[key];
  const range = compact({ from: istDayStart(s.from), to: istDayEndExclusive(s.to), cityId: report.city ? s.cityId : '' });
  const valid = s.from && s.to && s.from <= s.to;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['report', key, range],
    queryFn: () => api.get(`${ADMIN}/reports/${key}`, range),
    enabled: Boolean(valid),
  });
  const rows = data?.rows;

  const exportCsv = async () => {
    setDownloading(true);
    try {
      await downloadFile(`${ADMIN}/reports/${key}`, { query: { ...range, format: 'csv' }, fallbackName: `${key}-${s.from}-to-${s.to}.csv` });
    } catch (e) {
      toast.error(e);
    } finally {
      setDownloading(false);
    }
  };

  const chartData = report.chart && rows ? fillDays(rows, s.from, s.to, [report.chart.key]) : null;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Business metrics by IST day. Money is shown in rupees; CSV exports contain paise."
        actions={<Button icon={Download} onClick={exportCsv} loading={downloading} disabled={!valid}>Export CSV</Button>}
      />
      <Tabs className="mb-4" label="Report" value={key} onChange={(v) => set({ report: v })} items={available.map(([k, r]) => ({ value: k, label: r.label }))} />
      <FilterBar actions={isFetching && !isLoading ? <span className="text-caption text-ink-400">Updating…</span> : null}>
        <DateRangePicker value={{ from: s.from, to: s.to }} onChange={(r) => set({ from: r.from, to: r.to })} allowClear={false} />
        {report.city ? (
          <FilterSelect label="City" value={s.cityId} onChange={(v) => set({ cityId: v })} options={(cities.data || []).map((c) => ({ value: c.id, label: c.name }))} allLabel="All cities" />
        ) : null}
      </FilterBar>
      <p className="-mt-1 mb-4 text-caption text-ink-500">{report.description}</p>

      {!valid ? (
        <div className="panel"><EmptyState icon={BarChart3} title="Choose a date range" description="Pick a start and end date (up to about 13 months)." /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {report.tiles(rows).map(([label, value, sub]) => (
              <StatTile key={label} label={label} value={isLoading ? '…' : value} sub={sub} />
            ))}
          </div>
          {report.chart ? (
            <Panel title={`${report.label} per day`}>
              {chartData && !chartData.some((d) => d[report.chart.key]) ? (
                <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-line text-caption text-ink-500">No activity in this period.</div>
              ) : chartData ? (
                <DailyChart data={chartData} dataKey={report.chart.key} name={report.chart.name} format={report.chart.format} axisFormat={report.chart.axis} kind={chartData.length > 45 ? 'line' : 'bar'} />
              ) : (
                <div className="h-[240px] animate-pulse rounded-md bg-ink-50" />
              )}
            </Panel>
          ) : null}
          <DataTable
            columns={report.columns}
            rows={rows}
            loading={isLoading}
            error={error}
            onRetry={refetch}
            rowKey={report.rowKey || ((r) => r.date)}
            empty={<EmptyState icon={BarChart3} title="No data for this period" description="Try a wider date range or another city." />}
          />
        </div>
      )}
    </>
  );
}

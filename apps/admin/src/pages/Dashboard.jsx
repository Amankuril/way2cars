import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Building2, Car, CalendarRange, IndianRupee, ShieldCheck, LifeBuoy, Siren, Wallet, Hammer, Undo2, ChevronRight, RefreshCw,
} from 'lucide-react';
import { api, ADMIN } from '@/lib/api.js';
import { money } from '@shared/lib/format.js';
import { BOOKING_STATUS, VENDOR_STATUS, statusInfo } from '@/lib/labels.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { Panel, StatTile } from '@/components/Panel.jsx';
import { Skeleton } from '@/components/Skeleton.jsx';
import { ErrorState } from '@/components/EmptyState.jsx';
import { Button } from '@/components/Button.jsx';
import { Tabs } from '@/components/Tabs.jsx';
import { DailyChart, fillDays, compactRupees } from '@/components/Charts.jsx';
import { useAuth } from '@/auth/AuthContext.jsx';
import { cn, fmtNumber, istToday } from '@/lib/utils.js';

const ACTIVE = ['confirmed', 'ongoing', 'return_pending'];

function QueueRow({ icon: Icon, label, hint, count, to, urgent }) {
  const content = (
    <>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', count && urgent ? 'bg-danger-50 text-danger-600' : count ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400')}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label text-ink-900">{label}</span>
        <span className="block truncate text-caption text-ink-500">{hint}</span>
      </span>
      <span className={cn('num text-headline', count ? 'text-ink-900' : 'text-ink-300')}>{fmtNumber(count)}</span>
      {to ? <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-brand-500" aria-hidden="true" /> : <span className="w-4" />}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50">{content}</Link>
      ) : (
        <div className="flex items-center gap-3 px-5 py-3">{content}</div>
      )}
    </li>
  );
}

export default function Dashboard() {
  const { can, admin } = useAuth();
  const [metric, setMetric] = useState('gbvPaise');
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get(`${ADMIN}/reports/dashboard`),
    refetchInterval: 60_000,
  });

  const t = data?.totals;
  const vendors = t?.vendors || {};
  const bookings = t?.bookings || {};
  const totalBookings = Object.values(bookings).reduce((s, n) => s + n, 0);
  const activeBookings = ACTIVE.reduce((s, k) => s + (bookings[k] || 0), 0);
  const trend = data ? fillDays(data.trend, istToday(-13), istToday(), ['bookings', 'gbvPaise']) : [];
  const q = data?.queues || {};
  const link = (perm, to) => (can(perm) ? to : null);

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${admin?.name?.split(' ')[0] || 'there'}`}
        crumb="Dashboard"
        description="Live marketplace health and the work waiting for your team."
        actions={
          <Button size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="panel space-y-3 p-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-32" /></div>
              ))
            ) : (
              <>
                <StatTile label="Renters" icon={Users} value={fmtNumber(t.users)} sub="Registered accounts (excl. deleted)" />
                <StatTile
                  label="Approved hosts"
                  icon={Building2}
                  value={fmtNumber(vendors.approved || 0)}
                  sub={`${fmtNumber(vendors.pending_approval || 0)} in review · ${fmtNumber(vendors.onboarding || 0)} onboarding · ${fmtNumber(vendors.suspended || 0)} suspended`}
                />
                <StatTile label="Listed cars" icon={Car} value={fmtNumber(t.vehicles.listed)} sub={`${fmtNumber(t.vehicles.total)} total · ${fmtNumber(t.vehicles.pending)} awaiting review`} />
                <StatTile label="Active bookings" icon={CalendarRange} value={fmtNumber(activeBookings)} sub={`${fmtNumber(totalBookings)} bookings all-time`} />
                <StatTile label="Paid bookings today" icon={CalendarRange} value={fmtNumber(data.today.paidBookings)} sub="Since 00:00 IST" />
                <StatTile label="GBV today" icon={IndianRupee} value={money(data.today.gbvPaise)} sub="Rental charges, excl. deposits" />
                <StatTile label="Collected · 30 days" icon={IndianRupee} value={money(data.last30Days.collectedPaise)} sub={`${money(data.last30Days.refundedPaise)} refunded`} />
                <StatTile label="Commission · 30 days" icon={IndianRupee} value={money(data.last30Days.commissionPaise)} sub="On trips settled in the period" />
              </>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Last 14 days"
              description="Paid bookings by payment date (IST)."
              actions={
                <Tabs
                  label="Chart metric"
                  value={metric}
                  onChange={setMetric}
                  className="border-b-0"
                  items={[
                    { value: 'gbvPaise', label: 'GBV' },
                    { value: 'bookings', label: 'Bookings' },
                  ]}
                />
              }
            >
              {isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : (
                <DailyChart
                  data={trend}
                  dataKey={metric}
                  name={metric === 'gbvPaise' ? 'GBV' : 'bookings'}
                  format={metric === 'gbvPaise' ? (v) => money(v) : (v) => fmtNumber(v)}
                  axisFormat={metric === 'gbvPaise' ? compactRupees : (v) => fmtNumber(v)}
                />
              )}
              {!isLoading && !data.trend.length ? <p className="mt-2 text-center text-caption text-ink-500">No paid bookings in the last 14 days yet.</p> : null}
            </Panel>

            <Panel title="Action queues" description="Items waiting on an admin." flush>
              {isLoading ? (
                <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
              ) : (
                <ul className="divide-y divide-line">
                  <QueueRow icon={ShieldCheck} label="KYC to review" hint="Renter & host identity checks" count={q.kyc} to={link('kyc.review', '/kyc?status=pending')} />
                  <QueueRow icon={Building2} label="Host approvals" hint="Applications awaiting a decision" count={q.vendorApprovals} to={link('vendors.read', '/hosts?status=pending_approval')} />
                  <QueueRow icon={Car} label="Car listings to review" hint="New or changed listings" count={q.vehicleReviews} to={link('vehicles.read', '/vehicles?approval=pending_review')} />
                  <QueueRow icon={LifeBuoy} label="Open tickets" hint="Open or in progress" count={q.openTickets} to={link('support.manage', '/support')} />
                  <QueueRow icon={Siren} label="Active roadside requests" hint="Not yet resolved" count={q.roadside} urgent to={link('support.manage', '/support?category=roadside')} />
                  <QueueRow icon={Wallet} label="Payouts to process" hint="Requested or approved, not yet paid" count={q.payouts} to={link('payouts.manage', '/payouts')} />
                  <QueueRow icon={Hammer} label="Damage claims" hint="Returns under review with a host claim" count={q.damageClaims} urgent to={link('bookings.read', '/bookings?status=return_pending')} />
                  <QueueRow icon={Undo2} label="Failed refunds" hint="Retried automatically; check booking payments" count={q.failedRefunds} urgent to={null} />
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Bookings by status" description="All-time count per lifecycle stage." >
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : totalBookings === 0 ? (
              <p className="text-bodySm text-ink-500">No bookings yet. Bookings appear here as soon as renters start checking out.</p>
            ) : (
              <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.keys(BOOKING_STATUS).map((s) => {
                  const n = bookings[s] || 0;
                  const pct = totalBookings ? (n / totalBookings) * 100 : 0;
                  const body = (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-label text-ink-700">{statusInfo(BOOKING_STATUS, s).label}</span>
                        <span className="num text-label text-ink-900">{fmtNumber(n)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(pct, n ? 2 : 0)}%` }} />
                      </div>
                    </>
                  );
                  return (
                    <li key={s}>
                      {can('bookings.read') ? <Link to={`/bookings?status=${s}`} className="block rounded-md p-1 -m-1 hover:bg-ink-50">{body}</Link> : body}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          {dataUpdatedAt ? <p className="text-right text-caption text-ink-400">Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })} IST · refreshes every minute</p> : null}
        </div>
      )}
      {/* Vendors map kept for screen readers that want the full breakdown */}
      <span className="sr-only">{Object.entries(vendors).map(([k, n]) => `${statusInfo(VENDOR_STATUS, k).label}: ${n}`).join(', ')}</span>
    </>
  );
}

import { Link } from 'react-router';
import { Plus, TicketPercent } from 'lucide-react';
import { ADMIN } from '@/lib/api.js';
import { money, dateTime } from '@shared/lib/format.js';
import { CAMPAIGN } from '@/lib/labels.js';
import { useListQuery, useSearchState } from '@/lib/hooks.js';
import { compact, fmtNumber } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { DataTable, CellStack } from '@/components/DataTable.jsx';
import { Pagination } from '@/components/Pagination.jsx';
import { FilterBar, FilterSelect } from '@/components/Filters.jsx';
import { StatusPill, Tag } from '@/components/StatusPill.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';
import { ButtonLink } from '@/components/Button.jsx';

export function couponValue(c) {
  if (c.type === 'percent') return `${(c.valueBps || 0) / 100}% off${c.maxDiscountPaise ? ` · up to ${money(c.maxDiscountPaise)}` : ''}`;
  return `${money(c.valuePaise)} off`;
}

export function couponState(c) {
  const now = Date.now();
  if (!c.isActive) return { label: 'Inactive', tone: 'neutral' };
  if (new Date(c.startsAt) > now) return { label: 'Scheduled', tone: 'info' };
  if (new Date(c.endsAt) < now) return { label: 'Expired', tone: 'neutral' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { label: 'Used up', tone: 'warning' };
  return { label: 'Live', tone: 'success' };
}

export default function CouponsList() {
  const [s, set] = useSearchState({ page: 1, campaign: '', active: '' });
  const query = compact({ page: s.page, limit: 25, campaign: s.campaign, active: s.active });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['coupons'], `${ADMIN}/coupons`, query);

  const columns = [
    {
      key: 'code',
      header: 'Coupon',
      cell: (c) => (
        <div className="min-w-0">
          <Link to={`/coupons/${c.id}`} className="num font-mono font-bold tracking-wide text-brand-600 hover:underline">{c.code}</Link>
          <div className="max-w-[260px] truncate text-caption text-ink-500">{c.title}</div>
        </div>
      ),
    },
    { key: 'campaign', header: 'Campaign', cell: (c) => CAMPAIGN[c.campaign] || c.campaign },
    { key: 'value', header: 'Discount', cell: (c) => <CellStack primary={couponValue(c)} secondary={c.minRentalPaise ? `Min rental ${money(c.minRentalPaise)}` : null} /> },
    {
      key: 'state',
      header: 'Status',
      cell: (c) => {
        const st = couponState(c);
        return (
          <div className="flex flex-wrap items-center gap-1">
            <StatusPill tone={st.tone}>{st.label}</StatusPill>
            {!c.isPublic ? <Tag>Hidden</Tag> : null}
            {c.firstBookingOnly ? <Tag tone="info">1st booking</Tag> : null}
          </div>
        );
      },
    },
    { key: 'valid', header: 'Valid (IST)', cell: (c) => <span className="whitespace-nowrap text-ink-700">{dateTime(c.startsAt)} → {dateTime(c.endsAt)}</span> },
    { key: 'used', header: 'Used', align: 'right', cell: (c) => <span>{fmtNumber(c.usedCount || 0)}<span className="text-ink-400"> / {c.usageLimit ? fmtNumber(c.usageLimit) : '∞'}</span></span> },
    { key: 'target', header: 'Targeting', cell: (c) => <span className="text-caption text-ink-600">{[c.cityIds?.length ? `${c.cityIds.length} cities` : 'All cities', c.categoryIds?.length ? `${c.categoryIds.length} categories` : null, c.userIds?.length ? `${c.userIds.length} users` : null].filter(Boolean).join(' · ')}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discount codes renters apply at checkout. Public coupons are also listed under Offers in the app."
        actions={<ButtonLink to="/coupons/new" variant="primary" icon={Plus}>New coupon</ButtonLink>}
      />
      <FilterBar>
        <FilterSelect label="Campaign" value={s.campaign} onChange={(v) => set({ campaign: v })} options={CAMPAIGN} allLabel="All campaigns" />
        <FilterSelect label="Active" value={s.active} onChange={(v) => set({ active: v })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} allLabel="Active and inactive" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(c) => `/coupons/${c.id}`}
        empty={
          <EmptyState
            icon={TicketPercent}
            title={s.campaign || s.active ? 'No coupons match these filters' : 'No coupons yet'}
            description="Create a coupon to run a discount, festival or first-ride campaign."
            action={<ButtonLink to="/coupons/new" variant="primary" size="sm" icon={Plus}>New coupon</ButtonLink>}
          />
        }
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

import { Link } from 'react-router';
import { LifeBuoy, Siren } from 'lucide-react';
import { ADMIN } from '@/lib/api.js';
import { ago, dateTime } from '@shared/lib/format.js';
import { ADMIN_TICKET_STATUS, PRIORITY, TICKET_CATEGORY, ROADSIDE_STAGE, REALM_LABEL } from '@/lib/labels.js';
import { useListQuery, useSearchState } from '@/lib/hooks.js';
import { compact } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { DataTable } from '@/components/DataTable.jsx';
import { Pagination } from '@/components/Pagination.jsx';
import { FilterBar, FilterSelect } from '@/components/Filters.jsx';
import { StatusPill } from '@/components/StatusPill.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';
import { Checkbox } from '@/components/Form.jsx';

export default function TicketsList() {
  const [s, set] = useSearchState({ page: 1, status: '', category: '', priority: '', mine: '' });
  const query = compact({ page: s.page, limit: 25, status: s.status, category: s.category, priority: s.priority, mine: s.mine ? 'true' : '' });
  const { rows, meta, isLoading, error, refetch, dataUpdatedAt } = useListQuery(['tickets'], `${ADMIN}/support/tickets`, query, { refetchInterval: 15_000 });

  const columns = [
    {
      key: 'subject',
      header: 'Ticket',
      cell: (t) => (
        <div className="flex min-w-0 items-start gap-2">
          {t.unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" title="Unread customer message" aria-label="Unread" /> : <span className="w-2 shrink-0" />}
          <div className="min-w-0">
            <Link to={`/support/${t.id}`} className={`block max-w-[380px] truncate hover:text-brand-600 hover:underline ${t.unread ? 'font-bold text-ink-900' : 'font-semibold text-ink-800'}`}>
              {t.category === 'roadside' ? <Siren className="mr-1 inline h-3.5 w-3.5 text-danger-600" aria-label="Roadside" /> : null}
              {t.subject}
            </Link>
            <div className="num text-caption text-ink-500">{t.ref} · {REALM_LABEL[t.raisedBy?.realm] || 'Customer'}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (t) => TICKET_CATEGORY[t.category] || t.category },
    { key: 'priority', header: 'Priority', cell: (t) => <StatusPill map={PRIORITY} value={t.priority} dot={false} /> },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill map={ADMIN_TICKET_STATUS} value={t.status} />
          {t.roadside ? <span className="text-caption text-ink-500">Roadside: {ROADSIDE_STAGE[t.roadside.stage]?.label || t.roadside.stage}</span> : null}
        </div>
      ),
    },
    { key: 'last', header: 'Last activity', cell: (t) => <span title={t.lastMessageAt ? dateTime(t.lastMessageAt) : ''} className="whitespace-nowrap">{t.lastMessageAt ? ago(t.lastMessageAt) : '—'}</span> },
    { key: 'created', header: 'Opened', cell: (t) => <span className="whitespace-nowrap text-ink-600">{dateTime(t.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Support"
        description="Customer and host tickets, including roadside assistance. The queue refreshes every 15 seconds."
      />
      <FilterBar
        actions={dataUpdatedAt ? <span className="text-caption text-ink-400">Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span> : null}
      >
        <FilterSelect label="Status" value={s.status} onChange={(v) => set({ status: v })} options={ADMIN_TICKET_STATUS} allLabel="All except closed" />
        <FilterSelect label="Category" value={s.category} onChange={(v) => set({ category: v })} options={TICKET_CATEGORY} allLabel="All categories" />
        <FilterSelect label="Priority" value={s.priority} onChange={(v) => set({ priority: v })} options={PRIORITY} allLabel="Any priority" />
        <Checkbox className="h-9 items-center" label="Assigned to me" checked={Boolean(s.mine)} onChange={(e) => set({ mine: e.target.checked ? '1' : '' })} />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowHref={(t) => `/support/${t.id}`}
        empty={<EmptyState icon={LifeBuoy} title="No tickets in this view" description={s.status || s.category || s.priority || s.mine ? 'Clear a filter to see more tickets.' : 'New customer and host tickets appear here automatically.'} />}
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
    </>
  );
}

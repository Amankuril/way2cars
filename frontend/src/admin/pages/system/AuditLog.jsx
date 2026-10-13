import { useState } from 'react';
import { ScrollText, ChevronRight } from 'lucide-react';
import { ADMIN } from '@/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { REALM_LABEL } from '@/lib/labels.js';
import { useListQuery, useSearchState } from '@/lib/hooks.js';
import { compact, humanize, shortId } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { DataTable } from '@/components/DataTable.jsx';
import { Pagination } from '@/components/Pagination.jsx';
import { FilterBar, FilterSelect, SearchInput, FilterChip } from '@/components/Filters.jsx';
import { EmptyState } from '@/components/EmptyState.jsx';
import { Tag } from '@/components/StatusPill.jsx';
import { Modal } from '@/components/Modal.jsx';
import { KeyValue } from '@/components/Panel.jsx';

const OID = /^[a-f0-9]{24}$/;
const AREAS = ['admin', 'booking', 'broadcast', 'catalog', 'cms', 'coupon', 'kyc', 'payout', 'review', 'settings', 'support', 'user', 'vehicle', 'vendor'];

export default function AuditLog() {
  const [s, set] = useSearchState({ page: 1, action: '', realm: '', entityId: '', actorId: '' });
  const query = compact({ page: s.page, limit: 50, action: s.action, realm: s.realm, entityId: OID.test(s.entityId) ? s.entityId : '', actorId: OID.test(s.actorId) ? s.actorId : '' });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['audit'], `${ADMIN}/audit-logs`, query);
  const [open, setOpen] = useState(null);
  const [idText, setIdText] = useState('');

  const columns = [
    { key: 'at', header: 'When (IST)', cell: (r) => <span className="num whitespace-nowrap">{dateTime(r.createdAt)}</span> },
    {
      key: 'action',
      header: 'Action',
      cell: (r) => (
        <button type="button" onClick={() => setOpen(r)} className="group inline-flex items-center gap-1 text-left">
          <span className="font-mono text-caption font-semibold text-ink-900 group-hover:text-brand-600">{r.action}</span>
          <ChevronRight className="h-3.5 w-3.5 text-ink-300 group-hover:text-brand-500" aria-hidden="true" />
        </button>
      ),
    },
    {
      key: 'actor',
      header: 'By',
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <Tag tone={r.actor?.realm === 'admin' ? 'info' : 'neutral'}>{REALM_LABEL[r.actor?.realm] || r.actor?.realm}</Tag>
          <button type="button" className="max-w-[220px] truncate text-caption text-ink-700 hover:text-brand-600 hover:underline disabled:no-underline" disabled={!r.actor?.id} onClick={() => set({ actorId: r.actor.id })} title="Show only this actor">
            {r.actor?.label || (r.actor?.id ? `…${shortId(r.actor.id)}` : '—')}
          </button>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Record',
      cell: (r) =>
        r.entity?.type ? (
          <button type="button" className="whitespace-nowrap text-caption text-ink-700 hover:text-brand-600 hover:underline" disabled={!r.entity.id} onClick={() => set({ entityId: r.entity.id })} title="Show only this record">
            {humanize(r.entity.type)} {r.entity.id ? <span className="num font-mono text-ink-500">…{shortId(r.entity.id)}</span> : null}
          </button>
        ) : '—',
    },
    { key: 'reason', header: 'Reason', cell: (r) => (r.reason ? <span className="block max-w-[280px] truncate text-caption text-ink-600" title={r.reason}>{r.reason}</span> : <span className="text-ink-300">—</span>) },
    { key: 'ip', header: 'IP', cell: (r) => <span className="num font-mono text-caption text-ink-500">{r.ip || '—'}</span> },
  ];

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sensitive actions: logins, approvals, refunds, payouts, settings and data views." />
      <FilterBar>
        <FilterSelect label="Area" value={s.action} onChange={(v) => set({ action: v })} options={AREAS.map((a) => ({ value: a, label: humanize(a) }))} allLabel="All actions" />
        <SearchInput value={s.action} onChange={(v) => set({ action: v })} placeholder="Action prefix, e.g. kyc.approved" label="Filter by action prefix" className="sm:w-60" />
        <FilterSelect label="Actor type" value={s.realm} onChange={(v) => set({ realm: v })} options={REALM_LABEL} allLabel="Anyone" />
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (OID.test(idText.trim())) {
              set({ entityId: idText.trim() });
              setIdText('');
            }
          }}
        >
          <div>
            <label htmlFor="audit-entity" className="mb-1 block text-caption font-semibold text-ink-500">Record ID</label>
            <input id="audit-entity" value={idText} onChange={(e) => setIdText(e.target.value)} placeholder="24-character ID" className="input num h-9 w-52 font-mono text-caption" />
          </div>
        </form>
      </FilterBar>
      {s.entityId || s.actorId ? (
        <div className="-mt-1 mb-4 flex flex-wrap gap-2">
          {s.entityId ? <FilterChip label={`Record …${shortId(s.entityId)}`} onClear={() => set({ entityId: '' })} /> : null}
          {s.actorId ? <FilterChip label={`Actor …${shortId(s.actorId)}`} onClear={() => set({ actorId: '' })} /> : null}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r._id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        dense
        empty={<EmptyState icon={ScrollText} title="No audit entries match" description="Try a broader action prefix or clear the record filter." />}
        footer={<Pagination meta={meta} onPage={(p) => set({ page: p })} />}
      />
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.action} description={open ? `${dateTime(open.createdAt)} IST` : undefined} size="lg">
        {open ? (
          <div className="space-y-4">
            <KeyValue
              items={[
                ['Actor', `${REALM_LABEL[open.actor?.realm] || open.actor?.realm}${open.actor?.label ? ` · ${open.actor.label}` : ''}`],
                ['Actor ID', open.actor?.id ? <span className="num font-mono text-caption">{open.actor.id}</span> : null],
                ['Record', open.entity?.type ? humanize(open.entity.type) : null],
                ['Record ID', open.entity?.id ? <span className="num font-mono text-caption">{open.entity.id}</span> : null],
                ['IP address', open.ip],
                ['Request ID', open.requestId ? <span className="font-mono text-caption">{open.requestId}</span> : null],
                { label: 'Reason', value: open.reason, wide: true },
                { label: 'User agent', value: open.userAgent ? <span className="text-caption">{open.userAgent}</span> : null, wide: true },
              ]}
            />
            <div>
              <p className="mb-1 text-caption font-semibold text-ink-500">Changes</p>
              {open.changes ? (
                <pre className="scroll-thin max-h-72 overflow-auto rounded-md border border-line bg-ink-50 p-3 font-mono text-caption text-ink-800">{JSON.stringify(open.changes, null, 2)}</pre>
              ) : (
                <p className="text-bodySm text-ink-500">No field changes recorded.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

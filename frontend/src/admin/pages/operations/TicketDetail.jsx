import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, StickyNote, Lock, UserCheck, MapPin, ExternalLink, Paperclip } from 'lucide-react';
import { api, ADMIN } from '@/lib/api.js';
import { dateTime, ago } from '@shared/lib/format.js';
import { ADMIN_TICKET_STATUS, PRIORITY, ROADSIDE_STAGE, TICKET_CATEGORY, ROADSIDE, REALM_LABEL } from '@/lib/labels.js';
import { useAction } from '@/lib/hooks.js';
import { cn, errorMessage } from '@/lib/utils.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { PageHeader } from '@/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/components/Panel.jsx';
import { StatusPill } from '@/components/StatusPill.jsx';
import { Button } from '@/components/Button.jsx';
import { Field, Select, Textarea } from '@/components/Form.jsx';
import { DetailSkeleton } from '@/components/Skeleton.jsx';
import { ErrorState } from '@/components/EmptyState.jsx';
import { SecureFileLink } from '@/components/SecureImage.jsx';
import { initials } from '@shared/lib/format.js';

function Message({ m }) {
  const staff = m.from?.realm === 'admin';
  return (
    <li className={cn('flex gap-3', staff && 'flex-row-reverse')}>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caption font-bold', staff ? 'bg-ink-900 text-white' : 'bg-brand-50 text-brand-700')} aria-hidden="true">
        {initials(m.from?.name || REALM_LABEL[m.from?.realm] || '?')}
      </span>
      <div className={cn('min-w-0 max-w-[82%]', staff && 'text-right')}>
        <div className={cn('mb-1 flex flex-wrap items-baseline gap-x-2 text-caption', staff && 'justify-end')}>
          <span className="font-bold text-ink-800">{m.from?.name || REALM_LABEL[m.from?.realm]}</span>
          <span className="text-ink-400">{REALM_LABEL[m.from?.realm]}</span>
          <span className="text-ink-400" title={dateTime(m.createdAt)}>{dateTime(m.createdAt)}</span>
        </div>
        <div
          className={cn(
            'inline-block whitespace-pre-wrap break-words rounded-lg px-3.5 py-2.5 text-left text-bodySm',
            m.internal ? 'border border-dashed border-warning-500 bg-warning-50 text-ink-900' : staff ? 'bg-brand-500 text-white' : 'border border-line bg-surface text-ink-900',
          )}
        >
          {m.internal ? (
            <span className="mb-1 flex items-center gap-1 text-overline uppercase tracking-wider text-warning-700">
              <Lock className="h-3 w-3" aria-hidden="true" /> Internal note — not visible to the customer
            </span>
          ) : null}
          {m.body}
        </div>
        {m.attachmentFileIds?.length ? (
          <div className={cn('mt-1.5 flex flex-wrap gap-3 text-caption', staff && 'justify-end')}>
            {m.attachmentFileIds.map((f, i) => (
              <SecureFileLink key={f} fileId={f}>
                <Paperclip className="h-3 w-3" aria-hidden="true" /> Attachment {i + 1}
              </SecureFileLink>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const bottom = useRef(null);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [replyError, setReplyError] = useState(null);

  const { data: t, isLoading, error, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api.get(`${ADMIN}/support/tickets/${id}`),
    refetchInterval: 15_000,
  });
  const count = t?.messages?.length;
  useEffect(() => {
    if (count) bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);

  const sync = (data) => {
    qc.setQueryData(['ticket', id], data);
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const reply = useAction((payload) => api.post(`${ADMIN}/support/tickets/${id}/messages`, payload), {
    success: (_d, v) => (v.internal ? 'Internal note added' : 'Reply sent to the customer'),
    toastError: false,
    onSuccess: (data) => {
      sync(data);
      setBody('');
      setNextStatus('');
      setReplyError(null);
    },
  });
  const update = useAction((patch) => api.patch(`${ADMIN}/support/tickets/${id}`, patch), {
    success: 'Ticket updated',
    onSuccess: sync,
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this ticket" /></div>;

  const send = (e) => {
    e.preventDefault();
    if (!body.trim()) {
      setReplyError('Write a message first.');
      return;
    }
    reply.mutate({ body: body.trim(), internal, ...(nextStatus ? { status: nextStatus } : {}) }, { onError: (err) => setReplyError(errorMessage(err)) });
  };
  const requesterLink = t.raisedBy?.realm === 'user' ? (can('users.read') ? `/users/${t.raisedBy.id}` : null) : can('vendors.read') ? `/hosts/${t.raisedBy?.id}` : null;

  return (
    <>
      <PageHeader
        back={{ to: '/support', label: 'Support' }}
        title={t.subject}
        crumb={t.ref}
        meta={<StatusPill map={ADMIN_TICKET_STATUS} value={t.status} />}
        description={`${t.ref} · ${TICKET_CATEGORY[t.category] || t.category} · opened ${dateTime(t.createdAt)} IST`}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Panel title="Conversation" description={t.lastMessageAt ? `Last customer-visible message ${ago(t.lastMessageAt)}` : undefined} flush>
            <ol className="scroll-thin max-h-[56vh] space-y-5 overflow-y-auto bg-ink-50/60 px-5 py-5" aria-live="polite">
              {t.messages.map((m) => <Message key={m.id} m={m} />)}
              <li ref={bottom} aria-hidden="true" />
            </ol>
            <form onSubmit={send} className="space-y-3 border-t border-line p-4">
              <div className="flex gap-1 rounded-md bg-ink-100 p-1" role="radiogroup" aria-label="Message type">
                {[
                  { v: false, label: 'Reply to customer', icon: Send },
                  { v: true, label: 'Internal note', icon: StickyNote },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={internal === o.v}
                    onClick={() => setInternal(o.v)}
                    className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1.5 text-label transition-colors', internal === o.v ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}
                  >
                    <o.icon className="h-3.5 w-3.5" aria-hidden="true" /> {o.label}
                  </button>
                ))}
              </div>
              <label htmlFor="reply" className="sr-only">{internal ? 'Internal note' : 'Reply'}</label>
              <Textarea
                id="reply"
                rows={4}
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={internal ? 'Visible to admins only…' : 'Write a reply — the customer is notified…'}
                className={internal ? 'border-warning-500 bg-warning-50/40' : ''}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send(e)}
              />
              {replyError ? <p className="text-caption font-semibold text-danger-600" role="alert">{replyError}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="after-status" className="text-caption font-semibold text-ink-500">Then set status</label>
                  <Select id="after-status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="h-8 w-auto py-0 text-caption">
                    <option value="">Keep ({ADMIN_TICKET_STATUS[t.status]?.label})</option>
                    <option value="in_progress">In progress</option>
                    <option value="awaiting_customer">Awaiting customer</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-caption text-ink-400 sm:inline">Ctrl + Enter</span>
                  <Button type="submit" variant={internal ? 'secondary' : 'primary'} icon={internal ? StickyNote : Send} loading={reply.isPending}>
                    {internal ? 'Add note' : 'Send reply'}
                  </Button>
                </div>
              </div>
            </form>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Ticket">
            <div className="space-y-4">
              <Field label="Status" htmlFor="t-status">
                <Select id="t-status" value={t.status} disabled={update.isPending} onChange={(e) => update.mutate({ status: e.target.value })}>
                  {Object.entries(ADMIN_TICKET_STATUS).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="t-priority">
                <Select id="t-priority" value={t.priority} disabled={update.isPending} onChange={(e) => update.mutate({ priority: e.target.value })}>
                  {Object.entries(PRIORITY).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
                </Select>
              </Field>
              {t.roadside ? (
                <Field label="Roadside stage" htmlFor="t-stage">
                  <Select id="t-stage" value={t.roadside.stage || 'requested'} disabled={update.isPending} onChange={(e) => update.mutate({ roadsideStage: e.target.value })}>
                    {Object.entries(ROADSIDE_STAGE).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
                  </Select>
                </Field>
              ) : null}
              <Button size="sm" icon={UserCheck} onClick={() => update.mutate({ assignToMe: true })} loading={update.isPending && update.variables?.assignToMe}>
                Assign to me
              </Button>
              {t.assignedTo ? <p className="text-caption text-ink-500">Assigned to an admin (…{String(t.assignedTo).slice(-6)})</p> : <p className="text-caption text-ink-500">Unassigned — replying assigns it to you.</p>}
            </div>
          </Panel>

          <Panel title="Details">
            <KeyValue
              columns={1}
              items={[
                ['Raised by', requesterLink ? <Link to={requesterLink} className="link">{REALM_LABEL[t.raisedBy?.realm]} profile</Link> : REALM_LABEL[t.raisedBy?.realm]],
                ['Category', TICKET_CATEGORY[t.category] || t.category],
                t.bookingId ? ['Booking', can('bookings.read') ? <Link to={`/bookings/${t.bookingId}`} className="link">Open booking</Link> : '—'] : null,
                t.resolvedAt ? ['Resolved', dateTime(t.resolvedAt)] : null,
              ]}
            />
          </Panel>

          {t.roadside ? (
            <Panel title="Roadside request" actions={<StatusPill map={ROADSIDE_STAGE} value={t.roadside.stage} />}>
              <KeyValue
                columns={1}
                items={[
                  ['Issue', ROADSIDE[t.roadside.type] || t.roadside.type],
                  ['Address', t.roadside.address],
                  ['Coordinates', t.roadside.location ? `${t.roadside.location.lat.toFixed(5)}, ${t.roadside.location.lng.toFixed(5)}` : 'Not shared'],
                ]}
              />
              {t.roadside.location ? (
                <a className="link mt-3 inline-flex items-center gap-1 text-caption" href={`https://www.google.com/maps?q=${t.roadside.location.lat},${t.roadside.location.lng}`} target="_blank" rel="noreferrer noopener">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Open location in Google Maps <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}

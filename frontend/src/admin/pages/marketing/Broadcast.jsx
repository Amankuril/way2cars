import { useState } from 'react';
import { Send, CircleCheck, Smartphone } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { useAction, useCatalog, useListQuery } from '@/admin/lib/hooks.js';
import { errorMessage, fieldErrorMap, fmtNumber } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel } from '@/admin/components/Panel.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';
import { Field, Input, Textarea, Select } from '@/admin/components/Form.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';

const EMPTY = { title: '', body: '', link: '', cityId: '' };

function History({ cityName }) {
  const { rows, isLoading } = useListQuery(['audit', 'broadcasts'], `${ADMIN}/audit-logs`, { action: 'broadcast.sent', limit: 10 });
  return (
    <Panel title="Recent broadcasts" description="From the audit log" flush>
      {isLoading ? <p className="px-5 py-4 text-caption text-ink-500">Loading…</p> : (
        <MiniTable
          columns={[
            { key: 'at', header: 'Sent', cell: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
            { key: 'msg', header: 'Message', cell: (r) => <div className="max-w-[320px]"><div className="truncate font-semibold text-ink-900">{r.changes?.title}</div><div className="truncate text-caption text-ink-500">{r.changes?.body}</div></div> },
            { key: 'city', header: 'Audience', cell: (r) => (r.changes?.cityId ? cityName(r.changes.cityId) : 'All renters') },
            { key: 'n', header: 'Recipients', align: 'right', cell: (r) => fmtNumber(r.changes?.recipients ?? 0) },
            { key: 'by', header: 'By', cell: (r) => <span className="text-caption text-ink-600">{r.actor?.label}</span> },
          ]}
          rows={rows}
          rowKey={(r) => r._id}
          empty="No broadcasts sent yet."
        />
      )}
    </Panel>
  );
}

export default function Broadcast() {
  const { can } = useAuth();
  const cities = useCatalog('cities');
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const cityName = (id) => (cities.data || []).find((c) => c.id === id)?.name || 'Selected city';
  const send = useAction((body) => api.post(`${ADMIN}/broadcasts`, body), { invalidate: [['audit']], toastError: false });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const check = () => {
    const next = {};
    if (f.title.trim().length < 3) next.title = 'Enter a title of 3–60 characters.';
    if (f.body.trim().length < 5) next.body = 'Enter a message of 5–200 characters.';
    if (f.link && !/^\/[\w\-/?=&.%]*$/.test(f.link.trim())) next.link = 'Use an in-app path that starts with /, e.g. /offers';
    setErrors(next);
    if (!Object.keys(next).length) setConfirming(true);
  };

  const doSend = async () => {
    const body = { title: f.title.trim(), body: f.body.trim() };
    if (f.link.trim()) body.link = f.link.trim();
    if (f.cityId) body.cityId = f.cityId;
    try {
      const r = await send.mutateAsync(body);
      setResult({ ...body, recipients: r.recipients });
      setF(EMPTY);
    } catch (err) {
      const fe = fieldErrorMap(err);
      if (Object.keys(fe).length) {
        setErrors(fe);
        return;
      }
      throw err;
    }
  };

  return (
    <>
      <PageHeader title="Promotional broadcast" description="Send a push notification to renters who have promotional notifications switched on." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {result ? (
            <div className="flex items-start gap-3 rounded-lg border border-success-100 bg-success-50 p-4" role="status">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-bodySm font-bold text-ink-900">Broadcast queued for {fmtNumber(result.recipients)} {result.recipients === 1 ? 'renter' : 'renters'}</p>
                <p className="mt-0.5 text-caption text-ink-600">“{result.title}” is being delivered in the background{result.cityId ? ` to renters in ${cityName(result.cityId)}` : ''}. Renters who opted out of promotions are excluded.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Dismiss</Button>
            </div>
          ) : null}
          <Panel title="Message">
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); check(); }} noValidate>
              <Field label="Title" htmlFor="bc-title" required error={errors.title} aside={<span className="num text-caption text-ink-400">{f.title.length}/60</span>}>
                <Input id="bc-title" value={f.title} onChange={set('title')} maxLength={60} invalid={Boolean(errors.title)} placeholder="e.g. Weekend getaway? 20% off SUVs" />
              </Field>
              <Field label="Message" htmlFor="bc-body" required error={errors.body} aside={<span className="num text-caption text-ink-400">{f.body.length}/200</span>}>
                <Textarea id="bc-body" rows={3} value={f.body} onChange={set('body')} maxLength={200} invalid={Boolean(errors.body)} placeholder="Use code WEEKEND20 on any SUV booked before Sunday." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Opens in app" htmlFor="bc-link" error={errors.link} hint="Optional in-app path, e.g. /offers">
                  <Input id="bc-link" value={f.link} onChange={set('link')} maxLength={200} className="font-mono text-caption" invalid={Boolean(errors.link)} />
                </Field>
                <Field label="Audience" htmlFor="bc-city" error={errors.cityId} hint="Renters whose home city matches.">
                  <Select id="bc-city" value={f.cityId} onChange={set('cityId')}>
                    <option value="">All renters</option>
                    {(cities.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit" variant="primary" icon={Send}>Review and send</Button>
              </div>
            </form>
          </Panel>
          {can('audit.read') ? <History cityName={cityName} /> : null}
        </div>
        <Panel className="lg:self-start" title="Preview" actions={<Smartphone className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
          <div className="rounded-lg border border-line bg-ink-50 p-3">
            <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-3">
              <img src={`${import.meta.env.BASE_URL}mark.png`} alt="" className="h-8 w-8 shrink-0 rounded-sm object-contain" />
              <div className="min-w-0">
                <p className="text-caption font-semibold text-ink-500">WAY2CARS · now</p>
                <p className="break-words text-bodySm font-bold text-ink-900">{f.title || 'Notification title'}</p>
                <p className="break-words text-caption text-ink-700">{f.body || 'Your message appears here.'}</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-caption text-ink-500">Delivery depends on the push provider being configured (see Integrations). Messages are also saved to each renter’s in-app inbox.</p>
        </Panel>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Send this broadcast?"
        description={`It goes to every active renter${f.cityId ? ` in ${cityName(f.cityId)}` : ''} with promotional notifications on. This cannot be recalled.`}
        confirmLabel="Send now"
        onConfirm={doSend}
      >
        <div className="rounded-md border border-line bg-ink-50 p-3">
          <p className="text-bodySm font-bold text-ink-900">{f.title}</p>
          <p className="text-caption text-ink-700">{f.body}</p>
        </div>
        {send.error && !Object.keys(errors).length ? <p className="sr-only">{errorMessage(send.error)}</p> : null}
      </ConfirmDialog>
    </>
  );
}

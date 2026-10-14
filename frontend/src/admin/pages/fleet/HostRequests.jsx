import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Car, CircleCheck, CircleX, ExternalLink, Inbox, Landmark, TriangleAlert, UserRound, Building2, IdCard, Info } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateLong, dateTime, maskPhone } from '@shared/lib/format.js';
import { VENDOR_STATUS, KYC_SUBMISSION_STATUS, BANK_STATUS, ID_PROOF } from '@/admin/lib/labels.js';
import { useAction, useCatalog, useListQuery, useSearchState } from '@/admin/lib/hooks.js';
import { ageFrom, cn, compact, errorMessage, humanize } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button, ButtonLink } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Checkbox, Field, Textarea } from '@/admin/components/Form.jsx';
import { SearchInput } from '@/admin/components/Filters.jsx';
import { Pagination } from '@/admin/components/Pagination.jsx';
import { EmptyState, ErrorState } from '@/admin/components/EmptyState.jsx';
import { Skeleton, SkeletonText } from '@/admin/components/Skeleton.jsx';
import { SecureImage } from '@/admin/components/SecureImage.jsx';

const MIN_HOST_AGE = 18;

/** "Today", "1 day ago", "6 days ago" — how long a request has been waiting. */
function waiting(d) {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d)) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
}

const hostTitle = (v) => v?.businessName || v?.name || 'Unnamed host';
const businessType = (t) => (t === 'company' ? 'Company' : t === 'individual' ? 'Individual' : null);

// ---------------------------------------------------------------- list (master)

function RequestList({ rows, meta, isLoading, error, refetch, selectedId, q, onSearch, onPage, cityName }) {
  return (
    <Panel
      className="flex min-h-0 flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)]"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      flush
    >
      <div className="border-b border-line p-3">
        <SearchInput value={q} onChange={onSearch} placeholder="Name, business or phone" label="Search host requests" className="sm:w-full" />
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refetch} title="Could not load requests" />
      ) : isLoading ? (
        <ul className="divide-y divide-line" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="space-y-2 px-4 py-3.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        </ul>
      ) : !rows?.length ? (
        <EmptyState compact icon={Inbox} title={q ? 'No requests match' : 'No requests waiting'} description={q ? 'Try another name or phone number.' : 'New host applications appear here.'} />
      ) : (
        <ul className="scroll-thin min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-label="Host requests">
          {rows.map((v) => {
            const active = String(v.id) === String(selectedId);
            const city = cityName(v);
            return (
              <li key={v.id}>
                <Link
                  to={`/hosts/requests/${v.id}`}
                  aria-current={active ? 'true' : undefined}
                  className={cn('relative block px-4 py-3 transition-colors', active ? 'bg-brand-50' : 'hover:bg-ink-50')}
                >
                  <span className={cn('absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full', active ? 'bg-brand-500' : 'bg-transparent')} aria-hidden="true" />
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn('truncate text-bodySm font-semibold', active ? 'text-brand-700' : 'text-ink-900')}>{hostTitle(v)}</span>
                    <span className="shrink-0 whitespace-nowrap text-caption text-ink-500">{waiting(v.submittedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-ink-500">
                    {[v.businessName && v.name ? v.name : businessType(v.businessType), city].filter(Boolean).join(' · ') || maskPhone(v.phone)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {meta?.pages > 1 ? <Pagination meta={meta} onPage={onPage} className="rounded-b-lg" /> : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- detail

function Revealed({ value, masked }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="num font-mono font-semibold tracking-wide text-ink-900">{value || masked || '—'}</span>
      {value ? <Tag tone="warning">Full number</Tag> : null}
    </span>
  );
}

function SectionIcon({ icon: Icon }) {
  return <Icon className="h-4 w-4 text-ink-400" aria-hidden="true" />;
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading request">
      <div className="panel p-5"><Skeleton className="h-6 w-64" /><Skeleton className="mt-3 h-4 w-96 max-w-full" /></div>
      <div className="panel p-5"><SkeletonText lines={4} /></div>
      <div className="panel p-5"><SkeletonText lines={5} /></div>
    </div>
  );
}

function RejectDialog({ open, onClose, onConfirm, kycReopenable, bankReopenable, name }) {
  const [reason, setReason] = useState('');
  const [reopen, setReopen] = useState({ kyc: false, bank: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const reasonId = useId();

  useEffect(() => {
    if (open) {
      setReason('');
      setReopen({ kyc: false, bank: false });
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    if (reason.trim().length < 5) {
      setError({ message: 'Tell the host what to change (at least 5 characters).' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: reason.trim(), reopen: { kyc: kycReopenable && reopen.kyc, bank: bankReopenable && reopen.bank } });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissable={!busy}
      title={`Reject ${name}?`}
      description="The host sees your reason in the app and can fix it and submit again."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy}>Reject request</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason for the host" htmlFor={reasonId} required>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            maxLength={500}
            placeholder="e.g. The selfie is blurred and the bank proof is in a different name."
            data-autofocus
          />
        </Field>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-label text-ink-800">Steps to redo</legend>
          <Checkbox
            label="Ask them to redo KYC"
            description={kycReopenable ? 'Rejects the submitted ID, PAN and selfie so they upload them again.' : 'No KYC submission is waiting for review.'}
            checked={kycReopenable && reopen.kyc}
            disabled={!kycReopenable}
            onChange={(e) => setReopen((r) => ({ ...r, kyc: e.target.checked }))}
          />
          <Checkbox
            label="Ask them to redo bank details"
            description={bankReopenable ? 'Rejects the bank account so they add it again.' : 'No bank account to send back.'}
            checked={bankReopenable && reopen.bank}
            disabled={!bankReopenable}
            onChange={(e) => setReopen((r) => ({ ...r, bank: e.target.checked }))}
          />
        </fieldset>
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-danger-100 bg-danger-50 p-3 text-caption text-danger-700" role="alert">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage(error)}</span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

function RequestDetail({ id, cityName, onDecided }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ['host', id], queryFn: () => api.get(`${ADMIN}/vendors/${id}`) });
  const kycId = v?.kycSubmission?.id;
  const canKyc = can('kyc.review');
  // Full KYC (revealed numbers) — an audited view, same as the KYC review page.
  const full = useQuery({ queryKey: ['kyc', kycId], queryFn: () => api.get(`${ADMIN}/kyc/${kycId}`), enabled: Boolean(kycId && canKyc), staleTime: 60_000 });

  const invalidate = [['hosts'], ['host', id], ['kyc'], ['dashboard'], ['renter-kyc-count']];
  const refreshOnConflict = (e) => {
    if (e?.code === 'INVALID_STATE') invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    throw e;
  };
  const review = useAction((body) => api.post(`${ADMIN}/vendors/${id}/review`, body), {
    success: (_d, b) => (b.decision === 'approve' ? `${hostTitle(v)} approved — they can now list cars` : `Request sent back to ${hostTitle(v)}`),
    invalidate,
    toastError: false,
    onSuccess: () => onDecided(id),
  });
  const suspend = useAction((body) => api.post(`${ADMIN}/vendors/${id}/decision`, body), {
    success: `${hostTitle(v)} suspended`,
    invalidate,
    toastError: false,
    onSuccess: () => onDecided(id),
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this request" /></div>;

  const name = hostTitle(v);
  const masked = v.kycSubmission;
  const k = full.data || masked;
  const bank = v.bank;
  const pending = v.status === 'pending_approval';
  const dob = k?.dateOfBirth;
  const age = ageFrom(dob);
  const city = cityName(v);
  const addr = v.address ? [v.address.line1, v.address.line2, v.address.city, v.address.state, v.address.pincode].filter(Boolean).join(', ') : null;

  const kycUsable = Boolean(masked && masked.status !== 'rejected');
  const bankUsable = Boolean(bank && bank.verification?.status !== 'rejected');
  const blockers = [!kycUsable && 'no KYC submitted', !bankUsable && 'no bank account'].filter(Boolean);
  const canReview = can('vendors.manage') && canKyc && can('vendors.bank.review');
  const canSuspend = can('vendors.manage');

  const docs = k
    ? [
        k.idProof ? { caption: `${ID_PROOF[k.idProof.type] || humanize(k.idProof.type)} · front`, fileId: k.idProof.frontFileId } : { caption: 'ID · front', fileId: null },
        k.idProof ? { caption: `${ID_PROOF[k.idProof.type] || humanize(k.idProof.type)} · back`, fileId: k.idProof.backFileId ?? null } : { caption: 'ID · back', fileId: null },
        { caption: 'PAN card', fileId: k.pan?.fileId ?? null },
        { caption: 'Selfie', fileId: k.selfieFileId ?? null, selfie: true },
      ]
    : [];

  return (
    <div className="min-w-0 space-y-5">
      {/* Summary */}
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-headline text-ink-900">{name}</h2>
              <StatusPill map={VENDOR_STATUS} value={v.status} />
            </div>
            <p className="mt-1 text-bodySm text-ink-500">
              {[businessType(v.businessType), city].filter(Boolean).join(' · ')}
              {v.submittedAt ? <>{city || v.businessType ? ' · ' : ''}Submitted {dateTime(v.submittedAt)} <span className="text-ink-400">({waiting(v.submittedAt).toLowerCase()})</span></> : null}
            </p>
          </div>
          <Link to={`/hosts/${v.id}`} className="link inline-flex items-center gap-1 text-label">
            Full host profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-caption font-semibold text-ink-700">
            <Car className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> {v.vehicles?.length || 0} {v.vehicles?.length === 1 ? 'car' : 'cars'} added
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-caption font-semibold text-ink-700">
            <IdCard className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> KYC: {masked ? KYC_SUBMISSION_STATUS[masked.status]?.label || masked.status : 'Not submitted'}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-caption font-semibold text-ink-700">
            <Landmark className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> Bank: {bank ? BANK_STATUS[bank.verification?.status]?.label || 'Added' : 'Not added'}
          </li>
        </ul>
        {!pending ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-ink-50 p-3 text-caption text-ink-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
            <span>This host is no longer waiting for review ({VENDOR_STATUS[v.status]?.label.toLowerCase() || v.status}). Manage them from the <Link to={`/hosts/${v.id}`} className="link">host profile</Link>.</span>
          </div>
        ) : v.statusReason ? (
          <div className="mt-4 rounded-md border border-warning-100 bg-warning-50 p-3 text-caption text-warning-700">
            <span className="font-bold">Earlier feedback:</span> {v.statusReason}
          </div>
        ) : null}
      </section>

      <Panel title="Profile" actions={<SectionIcon icon={UserRound} />}>
        <KeyValue
          columns={3}
          items={[
            ['Name', v.name],
            ['Phone', <span className="num">{maskPhone(v.phone)}</span>],
            ['Email', v.email],
            ['Joined', dateLong(v.createdAt)],
          ]}
        />
      </Panel>
      <Panel title="Business" actions={<SectionIcon icon={Building2} />}>
        <KeyValue
          columns={3}
          items={[
            ['Type', businessType(v.businessType)],
            ['Business name', v.businessName],
            ['GSTIN', v.gstin ? <span className="num font-mono">{v.gstin}</span> : null],
            ['City', city],
            { label: 'Address', value: addr, wide: true },
          ]}
        />
      </Panel>

      <Panel
        title="KYC"
        description={full.data ? 'Full document numbers are shown for comparison; this view is audited.' : null}
        actions={masked ? <StatusPill map={KYC_SUBMISSION_STATUS} value={masked.status} /> : null}
      >
        {k ? (
          <div className="space-y-5">
            <KeyValue
              columns={3}
              items={[
                ['ID type', k.idProof ? ID_PROOF[k.idProof.type] || humanize(k.idProof.type) : null],
                ['ID number', k.idProof ? <Revealed value={k.idProof.number} masked={k.idProof.numberMasked} /> : null],
                ['PAN', k.pan ? <Revealed value={k.pan.number} masked={k.pan.numberMasked} /> : null],
                ['Date of birth', dob ? (
                  <span>
                    {dateLong(dob)}
                    {age !== null ? <span className={cn('ml-1.5', age < MIN_HOST_AGE ? 'font-bold text-danger-700' : 'text-ink-500')}>({age} years{age < MIN_HOST_AGE ? `, below ${MIN_HOST_AGE}` : ''})</span> : null}
                  </span>
                ) : null],
                ['Submitted', dateTime(k.createdAt)],
                k.review?.reason ? ['Earlier rejection', k.review.reason] : null,
              ]}
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {docs.map((d) => (
                <SecureImage key={d.caption} fileId={d.fileId} caption={d.caption} alt={`${name} — ${d.caption}`} aspect="aspect-square" fit={d.selfie ? 'object-cover' : 'object-contain'} />
              ))}
            </div>
            {full.error ? <p className="text-caption text-danger-600">Full document numbers could not be loaded: {errorMessage(full.error)}</p> : null}
          </div>
        ) : (
          <p className="text-bodySm text-ink-500">No KYC documents submitted.</p>
        )}
      </Panel>

      <Panel title="Bank account" actions={bank ? <StatusPill map={BANK_STATUS} value={bank.verification?.status} /> : <SectionIcon icon={Landmark} />}>
        {bank ? (
          <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
            <KeyValue
              items={[
                ['Account holder', bank.accountHolderName],
                ['Account number', <span className="num font-mono">{bank.accountNumberMasked}</span>],
                ['IFSC', <span className="num font-mono">{bank.ifsc}</span>],
                ['Bank', bank.bankName],
                bank.upiId ? ['UPI', bank.upiId] : null,
                bank.verification?.reason ? ['Earlier rejection', bank.verification.reason] : null,
              ]}
            />
            <SecureImage fileId={bank.proofFileId} caption="Cheque / statement" alt={`${name} — bank proof`} aspect="aspect-square" fit="object-contain" className="max-w-[220px]" />
          </div>
        ) : (
          <p className="text-bodySm text-ink-500">No bank account added.</p>
        )}
      </Panel>

      {pending && (canReview || canSuspend) ? (
        <div className="sticky bottom-4 z-10 rounded-lg border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className={cn('min-w-0 flex-1 text-caption', blockers.length ? 'font-semibold text-danger-600' : 'text-ink-500')}>
              {!canReview
                ? 'You can suspend hosts but not approve them.'
                : blockers.length
                  ? `Can’t approve: ${blockers.join(' and ')}.`
                  : 'Approving also verifies their KYC and bank account.'}
            </p>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {canSuspend ? <Button variant="ghost" icon={Ban} onClick={() => setDialog('suspend')} className="text-danger-600 hover:bg-danger-50">Suspend…</Button> : null}
              {canReview ? <Button variant="danger-outline" icon={CircleX} onClick={() => setDialog('reject')}>Reject…</Button> : null}
              {canReview ? <Button variant="success" icon={CircleCheck} disabled={blockers.length > 0} onClick={() => setDialog('approve')}>Approve host</Button> : null}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={`Approve ${name}?`}
        description="This verifies their KYC and bank account and lets them list cars."
        confirmLabel="Approve host"
        tone="success"
        onConfirm={() => review.mutateAsync({ decision: 'approve' }).catch(refreshOnConflict)}
      >
        <ul className="space-y-2 text-bodySm text-ink-700">
          <li className="flex items-start gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />KYC: {k?.idProof ? ID_PROOF[k.idProof.type] || humanize(k.idProof.type) : 'ID'}{k?.pan ? ', PAN' : ''} and selfie</li>
          <li className="flex items-start gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />Bank account <span className="num font-mono">{bank?.accountNumberMasked}</span>{bank?.ifsc ? ` · ${bank.ifsc}` : ''}</li>
          <li className="flex items-start gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />Host account — they can list cars</li>
        </ul>
      </ConfirmDialog>
      <RejectDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        name={name}
        kycReopenable={masked?.status === 'pending'}
        bankReopenable={Boolean(bank)}
        onConfirm={(body) => review.mutateAsync({ decision: 'reject', ...body }).catch(refreshOnConflict)}
      />
      <ConfirmDialog
        open={dialog === 'suspend'}
        onClose={() => setDialog(null)}
        title={`Suspend ${name}?`}
        description="They are signed out and can’t list cars until an admin reactivates them."
        confirmLabel="Suspend host"
        tone="danger"
        reason={{ label: 'Reason (recorded in the audit log)', minLength: 3, maxLength: 500 }}
        onConfirm={(reason) => suspend.mutateAsync({ action: 'suspend', reason })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function HostRequests() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [s, set] = useSearchState({ page: 1, q: '' });
  const query = compact({ status: 'pending_approval', page: s.page, limit: 50, q: s.q });
  const { rows, meta, isLoading, error, refetch } = useListQuery(['hosts', 'requests'], `${ADMIN}/vendors`, query);
  const cities = useCatalog('cities');
  const cityMap = useMemo(() => new Map((cities.data || []).map((c) => [String(c.id), c.name])), [cities.data]);
  const cityName = (v) => (v?.cityId && cityMap.get(String(v.cityId))) || v?.address?.city || null;
  const search = s.q ? `?q=${encodeURIComponent(s.q)}` : '';

  // Select the oldest request when none is chosen.
  useEffect(() => {
    if (!id && rows?.length) navigate(`/hosts/requests/${rows[0].id}${search}`, { replace: true });
  }, [id, rows, navigate, search]);

  // After a decision, move on to the next request in the (refreshed) queue.
  const onDecided = (doneId) => {
    const list = (rows || []).filter((r) => String(r.id) !== String(doneId));
    const idx = (rows || []).findIndex((r) => String(r.id) === String(doneId));
    const next = list[Math.max(0, Math.min(idx, list.length - 1))];
    navigate(next ? `/hosts/requests/${next.id}${search}` : `/hosts/requests${search}`, { replace: true });
  };

  const total = meta?.total;
  const noneAtAll = !isLoading && !error && !s.q && !rows?.length && !id;

  return (
    <>
      <PageHeader
        title="Host requests"
        meta={total ? <span className="num rounded-full bg-warning-50 px-2 py-0.5 text-caption font-bold text-warning-700">{total} waiting</span> : null}
        description="Hosts waiting for approval, oldest first. Check their details and documents, then approve, reject or suspend in one step."
        actions={<ButtonLink to="/hosts" size="sm">All hosts</ButtonLink>}
      />
      {noneAtAll ? (
        <div className="panel">
          <EmptyState
            icon={CircleCheck}
            title="No host requests waiting"
            description="When a host finishes onboarding in the host app, their request appears here for review."
            action={<ButtonLink to="/hosts" size="sm">View all hosts</ButtonLink>}
          />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
          <RequestList
            rows={rows}
            meta={meta}
            isLoading={isLoading}
            error={error}
            refetch={refetch}
            selectedId={id}
            q={s.q}
            onSearch={(v) => set({ q: v })}
            onPage={(p) => set({ page: p })}
            cityName={cityName}
          />
          {id ? (
            <RequestDetail key={id} id={id} cityName={cityName} onDecided={onDecided} />
          ) : (
            <div className="panel hidden lg:block">
              <EmptyState icon={Inbox} title={isLoading ? 'Loading requests…' : 'Select a request'} description="Pick a host on the left to review their details." />
            </div>
          )}
        </div>
      )}
    </>
  );
}

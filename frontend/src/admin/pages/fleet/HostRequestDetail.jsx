import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Car, CircleCheck, CircleX, ExternalLink, Landmark, TriangleAlert, UserRound, Building2, IdCard } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateLong, dateTime, maskPhone } from '@shared/lib/format.js';
import { VENDOR_STATUS, KYC_SUBMISSION_STATUS, BANK_STATUS, ID_PROOF, VEHICLE_APPROVAL } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { ageFrom, cn, errorMessage, humanize } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button, ButtonLink } from '@/admin/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/admin/components/Modal.jsx';
import { Checkbox, Field, Textarea } from '@/admin/components/Form.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { Skeleton, SkeletonText } from '@/admin/components/Skeleton.jsx';
import { SecureImage } from '@/admin/components/SecureImage.jsx';
import { DecidedNotice, DecisionBar, QueueStepper, businessType, hostTitle, useCityName, useRequestQueue, waiting } from './requestKit.jsx';

const MIN_HOST_AGE = 18;
const BASE = '/hosts/requests';

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

function Chip({ icon: Icon, children }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-caption font-semibold text-ink-700">
      <Icon className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> {children}
    </li>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading request">
      <div><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-7 w-72" /><Skeleton className="mt-2 h-4 w-96 max-w-full" /></div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="panel p-5"><SkeletonText lines={5} /></div>
          <div className="panel p-5"><SkeletonText lines={4} /></div>
        </div>
        <div className="panel p-5"><SkeletonText lines={6} /></div>
      </div>
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

export default function HostRequestDetail() {
  const { id } = useParams();
  return <RequestDetail key={id} id={id} />;
}

function RequestDetail({ id }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const cityName = useCityName();
  const [dialog, setDialog] = useState(null);
  const queue = useRequestQueue({ queryKey: ['hosts', 'requests'], path: `${ADMIN}/vendors`, query: { status: 'pending_approval' }, base: BASE });
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ['host', id], queryFn: () => api.get(`${ADMIN}/vendors/${id}`) });
  const kycId = v?.kycSubmission?.id;
  const canKyc = can('kyc.review');
  // Full KYC (revealed numbers) — an audited view, same as the KYC review page.
  const full = useQuery({ queryKey: ['kyc', kycId], queryFn: () => api.get(`${ADMIN}/kyc/${kycId}`), enabled: Boolean(kycId && canKyc), staleTime: 60_000 });

  // The host itself is refreshed after moving on, so the page doesn't flash its "decided" state.
  const invalidate = [['hosts'], ['kyc'], ['dashboard'], ['renter-kyc-count']];
  const done = async () => {
    await queue.goNext(id);
    qc.invalidateQueries({ queryKey: ['host', id] });
  };
  const refreshOnConflict = (e) => {
    if (e?.code === 'INVALID_STATE') [...invalidate, ['host', id]].forEach((k) => qc.invalidateQueries({ queryKey: k }));
    throw e;
  };
  const review = useAction((body) => api.post(`${ADMIN}/vendors/${id}/review`, body), {
    success: (_d, b) => (b.decision === 'approve' ? `${hostTitle(v)} approved — they can now list cars` : `Request sent back to ${hostTitle(v)}`),
    invalidate,
    toastError: false,
    onSuccess: done,
  });
  const suspend = useAction((body) => api.post(`${ADMIN}/vendors/${id}/decision`, body), {
    success: `${hostTitle(v)} suspended`,
    invalidate,
    toastError: false,
    onSuccess: done,
  });

  const back = { to: BASE, label: 'Host requests' };
  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <>
        <PageHeader back={back} title="Host request" />
        <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this request" /></div>
      </>
    );
  }

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
  const cars = v.vehicles || [];

  const docs = k
    ? [
        k.idProof ? { caption: `${ID_PROOF[k.idProof.type] || humanize(k.idProof.type)} · front`, fileId: k.idProof.frontFileId } : { caption: 'ID · front', fileId: null },
        k.idProof ? { caption: `${ID_PROOF[k.idProof.type] || humanize(k.idProof.type)} · back`, fileId: k.idProof.backFileId ?? null } : { caption: 'ID · back', fileId: null },
        { caption: 'PAN card', fileId: k.pan?.fileId ?? null },
        { caption: 'Selfie', fileId: k.selfieFileId ?? null, selfie: true },
      ]
    : [];

  return (
    <>
      <PageHeader
        back={back}
        title={name}
        meta={<StatusPill map={VENDOR_STATUS} value={v.status} />}
        description={
          <>
            {[businessType(v.businessType), city].filter(Boolean).join(' · ')}
            {v.submittedAt ? <>{city || v.businessType ? ' · ' : ''}Submitted {dateTime(v.submittedAt)} <span className="text-ink-400">({waiting(v.submittedAt).toLowerCase()})</span></> : null}
          </>
        }
        actions={
          <>
            {pending ? <QueueStepper position={queue.position(id)} base={BASE} /> : null}
            <ButtonLink to={`/hosts/${v.id}`} size="sm" icon={ExternalLink}>Full host profile</ButtonLink>
          </>
        }
      />

      {!pending ? (
        <DecidedNotice>
          This host is no longer waiting for review ({VENDOR_STATUS[v.status]?.label.toLowerCase() || v.status}). Manage them from the <Link to={`/hosts/${v.id}`} className="link">host profile</Link>.
        </DecidedNotice>
      ) : v.statusReason ? (
        <div className="mb-5 rounded-lg border border-warning-100 bg-warning-50 p-3 text-bodySm text-warning-700">
          <span className="font-bold">Earlier feedback:</span> {v.statusReason}
        </div>
      ) : null}

      <ul className="-mt-1 mb-5 flex flex-wrap gap-2" aria-label="Summary">
        <Chip icon={Car}>{cars.length} {cars.length === 1 ? 'car' : 'cars'} added</Chip>
        <Chip icon={IdCard}>KYC: {masked ? KYC_SUBMISSION_STATUS[masked.status]?.label || masked.status : 'Not submitted'}</Chip>
        <Chip icon={Landmark}>Bank: {bank ? BANK_STATUS[bank.verification?.status]?.label || 'Added' : 'Not added'}</Chip>
      </ul>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel
            title="KYC"
            description={full.data ? 'Full document numbers are shown for comparison; this view is audited.' : null}
            actions={masked ? <StatusPill map={KYC_SUBMISSION_STATUS} value={masked.status} /> : <SectionIcon icon={IdCard} />}
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
              <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
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
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Profile" actions={<SectionIcon icon={UserRound} />}>
            <KeyValue
              columns={1}
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
              columns={1}
              items={[
                ['Type', businessType(v.businessType)],
                ['Business name', v.businessName],
                ['GSTIN', v.gstin ? <span className="num font-mono">{v.gstin}</span> : null],
                ['City', city],
                ['Address', addr],
              ]}
            />
          </Panel>
          <Panel title="Cars added" description={cars.length ? 'Each car is reviewed separately in Vehicle requests.' : null} flush actions={<SectionIcon icon={Car} />}>
            {cars.length ? (
              <ul className="divide-y divide-line">
                {cars.map((c) => {
                  const href = c.approval === 'pending_review' ? `/vehicles/requests/${c.id}` : `/vehicles/${c.id}`;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        {can('vehicles.read') ? <Link to={href} className="link block truncate text-bodySm">{c.title}</Link> : <span className="block truncate text-bodySm font-semibold">{c.title}</span>}
                        <span className="num text-caption text-ink-500">{c.registrationNumber}</span>
                      </div>
                      <StatusPill map={VEHICLE_APPROVAL} value={c.approval} dot={false} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-bodySm text-ink-500">No cars added yet.</p>
            )}
          </Panel>
        </div>
      </div>

      {pending && (canReview || canSuspend) ? (
        <DecisionBar
          blocked={canReview && blockers.length > 0}
          note={!canReview ? 'You can suspend hosts but not approve them.' : blockers.length ? `Can’t approve: ${blockers.join(' and ')}.` : 'Approving also verifies their KYC and bank account.'}
        >
          {canSuspend ? <Button variant="ghost" icon={Ban} onClick={() => setDialog('suspend')} className="text-danger-600 hover:bg-danger-50">Suspend…</Button> : null}
          {canReview ? <Button variant="danger-outline" icon={CircleX} onClick={() => setDialog('reject')}>Reject…</Button> : null}
          {canReview ? <Button variant="success" icon={CircleCheck} disabled={blockers.length > 0} onClick={() => setDialog('approve')}>Approve host</Button> : null}
        </DecisionBar>
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
    </>
  );
}

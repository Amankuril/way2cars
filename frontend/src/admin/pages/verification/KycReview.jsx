import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Eye } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateLong, dateTime, maskPhone } from '@shared/lib/format.js';
import { KYC_SUBMISSION_STATUS, ID_PROOF } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { ageFrom, errorMessage, humanize } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';
import { Checkbox, Field, Textarea } from '@/admin/components/Form.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { SecureImage } from '@/admin/components/SecureImage.jsx';

const MIN_AGE = { user: 21, vendor: 18 };

function Revealed({ value, masked }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num font-mono font-semibold tracking-wide text-ink-900">{value || masked || '—'}</span>
      {value ? <Tag tone="warning">Full number</Tag> : null}
    </span>
  );
}

function DocGroup({ title, items, children }) {
  return (
    <Panel title={title}>
      <div className="space-y-4">
        {children}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.filter((i) => i.fileId !== undefined).map((i) => (
            <SecureImage key={i.caption} fileId={i.fileId} caption={i.caption} alt={`${title} — ${i.caption}`} fit="object-contain" aspect="aspect-[3/2]" />
          ))}
        </div>
      </div>
    </Panel>
  );
}

export default function KycReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: k, isLoading, error, refetch } = useQuery({ queryKey: ['kyc', id], queryFn: () => api.get(`${ADMIN}/kyc/${id}`), staleTime: 60_000 });
  const [checks, setChecks] = useState({ licenceValid: false, idValid: false, selfieMatches: false, ageEligible: false });
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [checkError, setCheckError] = useState(null);

  const review = useAction((body) => api.post(`${ADMIN}/kyc/${id}/review`, body), {
    success: (_d, v) => (v.decision === 'approve' ? 'KYC approved' : 'KYC rejected — the applicant has been told what to fix'),
    invalidate: [['kyc'], ['dashboard'], ['users'], ['hosts'], ['renter-kyc-count']],
    toastError: false,
    onSuccess: () => navigate(k?.subjectType === 'vendor' ? `/hosts/${k.subjectId}` : '/renter-kyc'),
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this submission" /></div>;

  const isUser = k.subjectType === 'user';
  const subject = k.subject || {};
  const dob = k.dateOfBirth || subject.dateOfBirth;
  const age = ageFrom(dob);
  const minAge = MIN_AGE[k.subjectType];
  const licenceExpired = k.licence?.expiry && new Date(k.licence.expiry) < new Date();
  const pending = k.status === 'pending';
  const required = isUser ? ['licenceValid', 'idValid', 'selfieMatches', 'ageEligible'] : ['idValid', 'selfieMatches', 'ageEligible'];
  const allChecked = required.every((c) => checks[c]);
  const profileHref = isUser ? `/users/${k.subjectId}` : `/hosts/${k.subjectId}`;
  const canProfile = can(isUser ? 'users.read' : 'vendors.read');

  const toggle = (key) => (e) => {
    setCheckError(null);
    setChecks((c) => ({ ...c, [key]: e.target.checked }));
  };

  const CHECKS = [
    isUser && { key: 'licenceValid', label: 'Driving licence is genuine and valid', description: licenceExpired ? 'Warning: the licence expiry date has passed.' : 'Name, photo and validity match; licence covers cars (LMV).' },
    { key: 'idValid', label: 'Identity document is genuine', description: 'Number, name and photo match the uploaded document.' },
    { key: 'selfieMatches', label: 'Selfie matches the documents', description: 'Same person as on the licence / ID photo.' },
    { key: 'ageEligible', label: `Applicant is at least ${minAge}`, description: age !== null ? `Date of birth gives age ${age}.` : 'Check the date of birth on the document.' },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        back={isUser ? { to: '/renter-kyc', label: 'Renter KYC' } : { to: `/hosts/${k.subjectId}`, label: 'Host profile' }}
        title={subject.businessName || subject.name || 'KYC submission'}
        crumb="KYC review"
        meta={
          <>
            <StatusPill map={KYC_SUBMISSION_STATUS} value={k.status} />
            <Tag tone={isUser ? 'neutral' : 'info'}>{isUser ? 'Renter' : 'Host'}</Tag>
          </>
        }
        description={`Submitted ${dateTime(k.createdAt)} IST. Full document numbers are shown for comparison; this view is audited.`}
        actions={canProfile ? <Link to={profileHref} className="link inline-flex items-center gap-1 text-label"><Eye className="h-4 w-4" aria-hidden="true" /> Open {isUser ? 'renter' : 'host'} profile</Link> : null}
      />

      {!isUser && pending && can('vendors.read') ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50 p-4 text-bodySm text-brand-700">
          <span>Host KYC is now reviewed together with their bank details in one step.</span>
          <Link to={`/hosts/requests/${k.subjectId}`} className="font-semibold underline underline-offset-2">Open host request</Link>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Panel title="Selfie and applicant">
            <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
              <SecureImage fileId={k.selfieFileId} caption="Selfie" alt="Applicant selfie" aspect="aspect-square" fit="object-cover" />
              <KeyValue
                items={[
                  ['Name on account', subject.name],
                  !isUser ? ['Business name', subject.businessName] : null,
                  ['Phone', <span className="num">{maskPhone(subject.phone)}</span>],
                  ['Email', subject.email],
                  ['Date of birth', dob ? dateLong(dob) : null],
                  ['Age', age !== null ? (
                    <span className={age < minAge ? 'font-bold text-danger-700' : ''}>
                      {age} years {age < minAge ? `(below ${minAge})` : ''}
                    </span>
                  ) : null],
                  ['Account created', subject.createdAt ? dateLong(subject.createdAt) : null],
                ]}
              />
            </div>
          </Panel>

          {k.licence ? (
            <DocGroup title="Driving licence" items={[{ caption: 'Front', fileId: k.licence.frontFileId }, { caption: 'Back', fileId: k.licence.backFileId ?? null }]}>
              <KeyValue
                items={[
                  ['Licence number', <Revealed value={k.licence.number} masked={k.licence.numberMasked} />],
                  ['Valid until', k.licence.expiry ? <span className={licenceExpired ? 'font-bold text-danger-700' : ''}>{dateLong(k.licence.expiry)}{licenceExpired ? ' · expired' : ''}</span> : null],
                ]}
              />
            </DocGroup>
          ) : null}

          {k.idProof ? (
            <DocGroup title={`Identity proof · ${ID_PROOF[k.idProof.type] || humanize(k.idProof.type)}`} items={[{ caption: 'Front', fileId: k.idProof.frontFileId }, { caption: 'Back', fileId: k.idProof.backFileId ?? null }]}>
              <KeyValue items={[['Document number', <Revealed value={k.idProof.number} masked={k.idProof.numberMasked} />]]} />
            </DocGroup>
          ) : null}

          {k.pan ? (
            <DocGroup title="PAN card" items={[{ caption: 'PAN', fileId: k.pan.fileId }]}>
              <KeyValue items={[['PAN', <Revealed value={k.pan.number} masked={k.pan.numberMasked} />]]} />
            </DocGroup>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          {pending ? (
            <Panel title="Decision" description="Approval requires every check below. Rejections need a reason the applicant will see.">
              <fieldset className="space-y-3.5">
                <legend className="sr-only">Verification checks</legend>
                {CHECKS.map((c) => (
                  <Checkbox key={c.key} label={c.label} description={c.description} checked={checks[c.key]} onChange={toggle(c.key)} />
                ))}
              </fieldset>
              <Field className="mt-5" label="Internal notes" htmlFor="kyc-notes" hint="Visible to admins only.">
                <Textarea id="kyc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
              </Field>
              {checkError ? <p className="mt-3 text-caption font-semibold text-danger-600" role="alert">{checkError}</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="success"
                  icon={CircleCheck}
                  onClick={() => (allChecked ? setConfirm('approve') : setCheckError('Tick every check before approving.'))}
                >
                  Approve
                </Button>
                <Button variant="danger-outline" icon={CircleX} onClick={() => setConfirm('reject')}>
                  Reject…
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel title="Review outcome">
              <KeyValue
                columns={1}
                items={[
                  ['Decision', <StatusPill map={KYC_SUBMISSION_STATUS} value={k.status} />],
                  ['Reviewed', k.review?.at ? dateTime(k.review.at) : null],
                  k.review?.reason ? ['Reason given', k.review.reason] : null,
                  k.review?.notes ? ['Internal notes', k.review.notes] : null,
                  k.review?.checks ? [
                    'Checks confirmed',
                    <ul className="space-y-0.5">
                      {Object.entries(k.review.checks).map(([c, v]) => (
                        <li key={c} className="text-caption">{v ? '✓' : '✗'} {humanize(c.replace(/([A-Z])/g, ' $1').toLowerCase())}</li>
                      ))}
                    </ul>,
                  ] : null,
                ]}
              />
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'approve'}
        onClose={() => setConfirm(null)}
        title="Approve this KYC?"
        description={`${subject.businessName || subject.name || 'The applicant'} will be marked as verified${isUser ? ' and can book cars' : ''}.`}
        confirmLabel="Approve KYC"
        tone="success"
        onConfirm={() => review.mutateAsync({ decision: 'approve', checks: isUser ? checks : { idValid: checks.idValid, selfieMatches: checks.selfieMatches, ageEligible: checks.ageEligible }, notes: notes.trim() || undefined })}
      />
      <ConfirmDialog
        open={confirm === 'reject'}
        onClose={() => setConfirm(null)}
        title="Reject this KYC?"
        description="The applicant sees this reason and can resubmit."
        confirmLabel="Reject KYC"
        tone="danger"
        reason={{ label: 'Reason for the applicant', placeholder: 'e.g. The licence photo is blurred — upload a clear photo of the front side.', minLength: 5 }}
        onConfirm={(reason) => review.mutateAsync({ decision: 'reject', reason, notes: notes.trim() || undefined })}
      />
      {review.error && !confirm ? <p className="sr-only" role="alert">{errorMessage(review.error)}</p> : null}
    </>
  );
}

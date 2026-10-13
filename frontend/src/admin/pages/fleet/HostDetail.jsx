import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Ban, RotateCcw, Star, Landmark } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { money, dateTime, dateLong, maskPhone } from '@shared/lib/format.js';
import { VENDOR_STATUS, KYC_STATUS, KYC_SUBMISSION_STATUS, BANK_STATUS, BOOKING_STATUS, VEHICLE_APPROVAL, VEHICLE_STATUS, ID_PROOF } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { fmtNumber } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue, AmountRows } from '@/admin/components/Panel.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { Button, ButtonLink } from '@/admin/components/Button.jsx';
import { ConfirmDialog } from '@/admin/components/Modal.jsx';
import { DetailSkeleton } from '@/admin/components/Skeleton.jsx';
import { ErrorState } from '@/admin/components/EmptyState.jsx';
import { SecureFileLink } from '@/admin/components/SecureImage.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';
import { HistoryList } from '@/admin/components/HistoryList.jsx';

const STEPS = [
  ['profile', 'Profile'],
  ['business', 'Business details'],
  ['kyc', 'KYC documents'],
  ['bank', 'Bank account'],
];

const DECISIONS = {
  approve: { title: 'Approve this host?', description: 'The host can list cars and accept bookings. Their KYC and bank account must already be verified.', label: 'Approve host', tone: 'success' },
  reject: { title: 'Ask the host for changes?', description: 'The host sees your reason in the app and can resubmit.', label: 'Request changes', tone: 'danger', reason: true },
  suspend: { title: 'Suspend this host?', description: 'All their cars are hidden from search and they are signed out. Upcoming bookings are not cancelled automatically.', label: 'Suspend host', tone: 'danger', reason: true },
  reactivate: { title: 'Reactivate this host?', description: 'Their eligible cars become bookable again.', label: 'Reactivate', tone: 'primary', reason: true },
};

export default function HostDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [decision, setDecision] = useState(null);
  const [bankDecision, setBankDecision] = useState(null);
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ['host', id], queryFn: () => api.get(`${ADMIN}/vendors/${id}`) });
  const invalidate = [['host', id], ['hosts'], ['dashboard']];

  const decide = useAction((body) => api.post(`${ADMIN}/vendors/${id}/decision`, body), {
    success: (d, b) => {
      const base = { approve: 'Host approved', reject: 'Changes requested from the host', suspend: 'Host suspended', reactivate: 'Host reactivated' }[b.action];
      return d?.activeBookingsNeedingAttention ? `${base} — ${d.activeBookingsNeedingAttention} active bookings need attention` : base;
    },
    invalidate,
    toastError: false,
  });
  const verifyBank = useAction((body) => api.post(`${ADMIN}/vendors/${id}/bank/verify`, body), {
    success: (_d, b) => (b.decision === 'verified' ? 'Bank account verified' : 'Bank account rejected'),
    invalidate,
    toastError: false,
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} title="Could not load this host" /></div>;

  const manage = can('vendors.manage');
  const bank = v.bank;
  const kyc = v.kycSubmission;
  const w = v.wallet || {};
  const counts = v.bookingCounts || {};
  const totalBookings = Object.values(counts).reduce((a, b) => a + b, 0);
  const d = decision ? DECISIONS[decision] : null;

  const actions = manage ? (
    <>
      {['pending_approval', 'rejected'].includes(v.status) ? <Button variant="success" icon={CircleCheck} onClick={() => setDecision('approve')}>Approve host</Button> : null}
      {v.status === 'pending_approval' ? <Button variant="danger-outline" icon={CircleX} onClick={() => setDecision('reject')}>Request changes…</Button> : null}
      {v.status === 'suspended' ? <Button icon={RotateCcw} onClick={() => setDecision('reactivate')}>Reactivate…</Button> : null}
      {!['suspended', 'deleted'].includes(v.status) ? <Button variant="danger-outline" icon={Ban} onClick={() => setDecision('suspend')}>Suspend…</Button> : null}
    </>
  ) : null;

  return (
    <>
      <PageHeader
        back={{ to: '/hosts', label: 'Hosts' }}
        title={v.businessName || v.name || 'Unnamed host'}
        meta={<StatusPill map={VENDOR_STATUS} value={v.status} />}
        description={`Joined ${dateLong(v.createdAt)}${v.submittedAt ? ` · submitted for approval ${dateTime(v.submittedAt)}` : ''}`}
        actions={actions}
      />

      {v.statusReason && ['rejected', 'suspended'].includes(v.status) ? (
        <div className="mb-5 rounded-lg border border-danger-100 bg-danger-50 p-4 text-bodySm text-danger-700">
          <span className="font-bold">{v.status === 'suspended' ? 'Suspension reason' : 'Changes requested'}:</span> {v.statusReason}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="Profile and business">
            <KeyValue
              items={[
                ['Contact name', v.name],
                ['Phone', <span className="num">{maskPhone(v.phone)}</span>],
                ['Email', v.email],
                ['Business type', v.businessType === 'company' ? 'Company' : 'Individual'],
                ['Business name', v.businessName],
                ['GSTIN', v.gstin ? <span className="num font-mono">{v.gstin}</span> : null],
                { label: 'Address', value: v.address ? [v.address.line1, v.address.line2, v.address.city, v.address.state, v.address.pincode].filter(Boolean).join(', ') : null, wide: true },
              ]}
            />
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-caption font-semibold text-ink-500">Onboarding steps</p>
              <ol className="flex flex-wrap gap-2">
                {STEPS.map(([key, label]) => {
                  const done = v.completedSteps?.includes(key);
                  return (
                    <li key={key} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold ${done ? 'border-success-100 bg-success-50 text-success-700' : 'border-line bg-surface text-ink-500'}`}>
                      {done ? <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="h-3.5 w-3.5 rounded-full border border-ink-300" aria-hidden="true" />}
                      {label}
                    </li>
                  );
                })}
              </ol>
            </div>
          </Panel>

          <Panel title="Cars" description={`${v.vehicles?.length || 0} cars`} flush actions={v.vehicles?.length && can('vehicles.read') ? <ButtonLink size="sm" to={`/vehicles?vendorId=${v.id}`}>Open in vehicles</ButtonLink> : null}>
            <MiniTable
              columns={[
                { key: 'car', header: 'Car', cell: (c) => (can('vehicles.read') ? <Link to={`/vehicles/${c.id}`} className="link">{c.title}</Link> : c.title) },
                { key: 'reg', header: 'Registration', cell: (c) => <span className="num">{c.registrationNumber}</span> },
                { key: 'review', header: 'Listing', cell: (c) => <StatusPill map={VEHICLE_APPROVAL} value={c.approval} /> },
                { key: 'status', header: 'Availability', cell: (c) => <StatusPill map={VEHICLE_STATUS} value={c.status} dot={false} /> },
                { key: 'bookable', header: 'Bookable', cell: (c) => (c.isListed ? 'Yes' : 'No') },
                { key: 'trips', header: 'Trips', align: 'right', cell: (c) => fmtNumber(c.trips) },
              ]}
              rows={v.vehicles}
              empty="This host has not added any cars yet."
            />
          </Panel>

          <Panel title="KYC" actions={kyc && can('kyc.review') ? <Link to={`/kyc/${kyc.id}`} className="link text-label">Open review</Link> : null}>
            {kyc ? (
              <KeyValue
                items={[
                  ['Account KYC status', <StatusPill map={KYC_STATUS} value={v.kyc?.status} />],
                  ['Latest submission', <StatusPill map={KYC_SUBMISSION_STATUS} value={kyc.status} dot={false} />],
                  ['Submitted', dateTime(kyc.createdAt)],
                  ['Identity proof', kyc.idProof ? `${ID_PROOF[kyc.idProof.type] || kyc.idProof.type} · ${kyc.idProof.numberMasked}` : null],
                  ['PAN', kyc.pan?.numberMasked],
                  kyc.review?.reason ? ['Rejection reason', kyc.review.reason] : null,
                ]}
              />
            ) : (
              <p className="text-bodySm text-ink-500">No KYC documents submitted yet.</p>
            )}
          </Panel>

          <Panel title="Activity history">
            <HistoryList items={v.history} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Bank account" actions={<Landmark className="h-4 w-4 text-ink-400" aria-hidden="true" />}>
            {bank ? (
              <div className="space-y-4">
                <KeyValue
                  columns={1}
                  items={[
                    ['Status', <StatusPill map={BANK_STATUS} value={bank.verification?.status} />],
                    ['Account holder', bank.accountHolderName],
                    ['Account number', <span className="num font-mono">{bank.accountNumberMasked}</span>],
                    ['IFSC', <span className="num font-mono">{bank.ifsc}</span>],
                    ['Bank', bank.bankName],
                    ['UPI', bank.upiId],
                    ['Proof', <SecureFileLink fileId={bank.proofFileId}>Open cheque / statement</SecureFileLink>],
                    bank.verification?.reason ? ['Rejection reason', bank.verification.reason] : null,
                    bank.verification?.reviewedAt ? ['Reviewed', dateTime(bank.verification.reviewedAt)] : null,
                  ]}
                />
                {can('vendors.bank.review') && bank.verification?.status !== 'verified' ? (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                    <Button size="sm" variant="success" icon={CircleCheck} onClick={() => setBankDecision('verified')}>Verify</Button>
                    {bank.verification?.status !== 'rejected' ? <Button size="sm" variant="danger-outline" icon={CircleX} onClick={() => setBankDecision('rejected')}>Reject…</Button> : null}
                  </div>
                ) : null}
                {can('vendors.bank.review') && bank.verification?.status === 'verified' ? (
                  <div className="border-t border-line pt-4">
                    <Button size="sm" variant="danger-outline" icon={CircleX} onClick={() => setBankDecision('rejected')}>Revoke verification…</Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-bodySm text-ink-500">No bank account added yet.</p>
            )}
          </Panel>

          <Panel title="Earnings wallet">
            <AmountRows
              rows={[
                { label: 'Available to withdraw', value: money(w.availablePaise || 0), strong: true },
                { label: 'In hold period', value: money(w.pendingPaise || 0) },
                { label: 'Withdrawal in progress', value: money(w.lockedPaise || 0) },
                { label: 'Lifetime earned', value: money(w.lifetimeEarnedPaise || 0) },
                { label: 'Lifetime paid out', value: money(w.lifetimePaidOutPaise || 0) },
              ]}
            />
            {can('payouts.manage') ? <Link to={`/payouts?vendorId=${v.id}`} className="link mt-3 inline-block text-caption">View payout requests</Link> : null}
          </Panel>

          <Panel title="Bookings" description={`${fmtNumber(totalBookings)} in total`}>
            {totalBookings ? (
              <ul className="space-y-2">
                {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([status, n]) => (
                  <li key={status} className="flex items-center justify-between gap-2">
                    <StatusPill map={BOOKING_STATUS} value={status} dot={false} />
                    <span className="num text-bodySm font-semibold text-ink-900">{fmtNumber(n)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-bodySm text-ink-500">No bookings yet.</p>
            )}
            {totalBookings && can('bookings.read') ? <Link to={`/bookings?vendorId=${v.id}`} className="link mt-3 inline-block text-caption">View bookings</Link> : null}
          </Panel>

          <Panel title="Rating">
            {v.rating?.count ? (
              <p className="inline-flex items-center gap-1.5 text-headline text-ink-900">
                <Star className="h-5 w-5 fill-warning-500 text-warning-500" aria-hidden="true" /> {v.rating.avg.toFixed(1)}
                <span className="text-bodySm font-normal text-ink-500">from {v.rating.count} reviews</span>
              </p>
            ) : (
              <p className="text-bodySm text-ink-500">No reviews yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(d)}
        onClose={() => setDecision(null)}
        title={d?.title}
        description={d?.description}
        confirmLabel={d?.label}
        tone={d?.tone}
        reason={d?.reason ? { label: decision === 'reject' ? 'What should the host change?' : 'Reason (recorded in the audit log)', minLength: 3, maxLength: 500 } : undefined}
        onConfirm={(reason) => decide.mutateAsync({ action: decision, reason })}
      />
      <ConfirmDialog
        open={Boolean(bankDecision)}
        onClose={() => setBankDecision(null)}
        title={bankDecision === 'verified' ? 'Verify this bank account?' : 'Reject this bank account?'}
        description={bankDecision === 'verified' ? 'Confirm the account holder name matches the host and the proof document is genuine. Payouts will go to this account.' : 'The host will need to add their bank details again.'}
        confirmLabel={bankDecision === 'verified' ? 'Verify account' : 'Reject account'}
        tone={bankDecision === 'verified' ? 'success' : 'danger'}
        reason={bankDecision === 'rejected' ? { label: 'Reason for the host', minLength: 3 } : undefined}
        onConfirm={(reason) => verifyBank.mutateAsync({ decision: bankDecision, reason })}
      />
    </>
  );
}

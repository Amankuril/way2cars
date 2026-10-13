import { useQuery } from '@tanstack/react-query';
import { MessageSquare, KeyRound, CreditCard, BellRing, Mail, Map, Satellite, RefreshCw } from 'lucide-react';
import { api, ADMIN } from '@/lib/api.js';
import { fmtNumber, humanize } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { Button } from '@/components/Button.jsx';
import { StatusPill } from '@/components/StatusPill.jsx';
import { ErrorState } from '@/components/EmptyState.jsx';
import { Skeleton } from '@/components/Skeleton.jsx';

function Card({ icon: Icon, title, description, status, children }) {
  return (
    <section className="panel flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-50 text-ink-600"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></div>
          <div>
            <h2 className="text-bodySm font-bold text-ink-900">{title}</h2>
            <p className="mt-0.5 text-caption text-ink-500">{description}</p>
          </div>
        </div>
        {status}
      </div>
      {children ? <div className="mt-4 border-t border-line pt-3 text-caption text-ink-600">{children}</div> : null}
    </section>
  );
}

const on = (ok, yes = 'Configured', no = 'Not configured') => <StatusPill tone={ok ? 'success' : 'warning'}>{ok ? yes : no}</StatusPill>;

export default function Integrations() {
  const { data: d, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['integrations'], queryFn: () => api.get(`${ADMIN}/system/integrations`) });

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Whether each external provider is configured on the server. Keys are set in the server environment and are never shown here."
        actions={<Button icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>Refresh</Button>}
      />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="panel p-5"><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-3 h-3 w-3/4" /></div>)}</div>
      ) : error ? (
        <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card icon={MessageSquare} title="SMS (OTP delivery)" description="Sends sign-in codes to renters and hosts." status={on(d.sms.configured)}>
            {d.sms.configured ? 'OTP messages are delivered by the SMS provider.' : 'OTP messages cannot be delivered to real phones until a provider is configured.'}
          </Card>
          <Card icon={KeyRound} title="OTP safeguards" description="Development and review bypasses." status={d.otp.globalBypass ? <StatusPill tone="danger">Bypass ON</StatusPill> : <StatusPill tone="success">Normal</StatusPill>}>
            <ul className="space-y-1">
              <li>Global OTP bypass: <strong className={d.otp.globalBypass ? 'text-danger-700' : 'text-ink-900'}>{d.otp.globalBypass ? 'On — any code is accepted' : 'Off'}</strong></li>
              <li>Test (dummy) numbers: <strong className="text-ink-900">{d.otp.dummyNumbersConfigured ? 'Configured' : 'None'}</strong></li>
            </ul>
          </Card>
          <Card icon={CreditCard} title="Razorpay payments" description="Checkout, refunds and payment webhooks." status={d.razorpay.configured ? <StatusPill tone={d.razorpay.mode === 'live' ? 'success' : 'info'}>{d.razorpay.mode === 'live' ? 'Live mode' : 'Test mode'}</StatusPill> : on(false)}>
            {d.razorpay.configured ? (d.razorpay.mode === 'live' ? 'Real payments are being collected.' : 'Test keys — no real money moves.') : 'Renters cannot pay until Razorpay keys are configured.'}
          </Card>
          <Card icon={BellRing} title="Firebase push" description="Push notifications to the mobile apps." status={on(d.firebase.configured)}>
            {d.firebase.configured ? 'Push notifications and promotional broadcasts are delivered.' : 'Notifications are saved to in-app inboxes only.'}
          </Card>
          <Card icon={Mail} title="Email" description="Invoices and account emails." status={on(d.email.configured)} />
          <Card icon={Map} title="Google Maps" description="Address search, geocoding and distances." status={on(d.maps.configured)}>
            <p className="mb-1 font-semibold text-ink-700">API usage since the server started</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {Object.entries(d.maps.usageSinceRestart || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><dt>{humanize(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</dt><dd className="num font-semibold text-ink-900">{fmtNumber(v)}</dd></div>
              ))}
            </dl>
          </Card>
          <Card icon={Satellite} title="GPS tracking" description="Live vehicle location during trips." status={on(d.tracking.configured)}>
            {d.tracking.configured ? 'Trip tracking data is shown on booking pages.' : 'No tracking provider — booking pages say so and never show estimated positions.'}
          </Card>
        </div>
      )}
    </>
  );
}

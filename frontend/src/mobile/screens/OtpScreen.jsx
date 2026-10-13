import { useEffect, useState } from 'react';
import { View } from '../rn';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header } from '../ui/Layout';
import { T } from '../ui/Text';
import { Button } from '../ui/Button';
import { OtpInput } from '../ui/OtpInput';
import { useToast } from '../ui/Feedback';
import { maskPhone } from '@shared/lib/format';
import { useApp } from '../app/AppContext';
import { Redirect } from '../nav';

/** Web: opened without a phone (stale link) → back to the phone step. */
export function OtpScreen(props) {
  if (!props.route.params?.phone) return <Redirect to="Phone" />;
  return <OtpForm {...props} />;
}

function OtpForm({ route }) {
  const phone = String(route.params.phone);
  const { api, realm, auth } = useApp();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(Number(route.params.resendAfterSeconds) || 30);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = useMutation({
    mutationFn: () => api.post(`/api/v1/auth/${realm}/otp/verify`, { phone, code }),
    onSuccess: (data) => auth.completeLogin(data),
    onError: (e) => { setError(e.message); setCode(''); },
  });
  const resend = useMutation({
    mutationFn: () => api.post(`/api/v1/auth/${realm}/otp/request`, { phone }),
    onSuccess: (d) => { setWait(d.resendAfterSeconds); toast('A new code is on its way.'); },
    onError: (e) => { toast(e.message, 'danger'); if (e.details?.retryAfterSeconds) setWait(e.details.retryAfterSeconds); },
  });
  useEffect(() => {
    if (code.length === 6 && !verify.isPending) verify.mutate();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen bg="surface" header={<Header title="" transparent />} footer={<Button title="Verify and continue" size="lg" block disabled={code.length < 6} loading={verify.isPending} onPress={() => verify.mutate()} testID="verify-otp" />}>
      <View className="px-5 pt-2">
        <T variant="title">Enter verification code</T>
        <T variant="body" tone="muted" className="mt-2">Sent to {maskPhone(phone)}</T>
        <View className="mt-8">
          <OtpInput value={code} onChange={(c) => { setCode(c); setError(null); }} error={!!error} />
          {error ? <T variant="bodySm" tone="danger" className="mt-3">{error}</T> : null}
        </View>
        <View className="mt-6 flex-row items-center">
          {wait > 0 ? <T variant="bodySm" tone="subtle">Resend code in {wait}s</T> : <Button title="Resend code" variant="ghost" size="sm" className="-ml-4" loading={resend.isPending} onPress={() => resend.mutate()} />}
        </View>
      </View>
    </Screen>
  );
}

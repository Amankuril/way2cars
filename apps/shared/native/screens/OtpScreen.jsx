import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import Svg, { Circle } from 'react-native-svg';
import { MessageSquareText, RotateCw } from 'lucide-react-native';
import { Screen } from '../Layout';
import { T } from '../Text';
import { Button } from '../Button';
import { OtpInput } from '../OtpInput';
import { useToast } from '../Feedback';
import { Card, IconTile } from '../Surfaces';
import { HeroHeader } from '../Blocks';
import { FadeInView, PressableScale } from '../Motion';
import { maskPhone } from '../../lib/format';
import { useApp } from '../app/AppContext';
import { colors } from '../../theme/tokens';

/** Countdown ring: the arc shrinks one step per second (discrete state, no animation loop). */
function CountdownRing({ left, total, size = 26 }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.brand[100]} strokeWidth={3} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.brand[500]} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>
  );
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const { api, realm, auth } = useApp();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(route.params.resendAfterSeconds || 30);
  const [total, setTotal] = useState(wait);

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
    onSuccess: (d) => { setWait(d.resendAfterSeconds); setTotal(d.resendAfterSeconds); toast('A new code is on its way.'); },
    onError: (e) => { toast(e.message, 'danger'); if (e.details?.retryAfterSeconds) { setWait(e.details.retryAfterSeconds); setTotal(e.details.retryAfterSeconds); } },
  });
  useEffect(() => {
    if (code.length === 6 && !verify.isPending) verify.mutate();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen tone="hero" bg="canvas" footer={<Button title="Verify and continue" size="lg" block disabled={code.length < 6} loading={verify.isPending} onPress={() => verify.mutate()} testID="verify-otp" />}>
      <HeroHeader className="pb-20" title="Enter verification code" subtitle="Enter the 6-digit code we just sent." />

      <FadeInView className="mx-4" style={{ marginTop: -56 }}>
        <Card className="p-4">
          <View className="flex-row items-center">
            <IconTile icon={MessageSquareText} tone="brand" size={44} />
            <View className="ml-3 flex-1">
              <T variant="caption" tone="subtle">Sent to</T>
              <T variant="headline" numberOfLines={1}>{maskPhone(phone)}</T>
            </View>
            <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Change number" hitSlop={6} className="min-h-[44px] justify-center rounded-lg px-2 active:bg-brand-50">
              <T variant="label" tone="brand">Change</T>
            </Pressable>
          </View>
          <View className="mt-5">
            <OtpInput value={code} onChange={(c) => { setCode(c); setError(null); }} error={!!error} />
            {error ? <T variant="bodySm" tone="danger" className="mt-3">{error}</T> : null}
          </View>
        </Card>
      </FadeInView>

      <FadeInView index={1} className="mx-4 mt-5 flex-row items-center justify-center">
        {wait > 0 ? (
          <View className="h-11 flex-row items-center rounded-full bg-surface pl-2 pr-4" style={{ borderWidth: 1, borderColor: colors.ink[100] }} accessibilityLabel={`Resend code in ${wait} seconds`}>
            <CountdownRing left={wait} total={total} />
            <T variant="label" tone="muted" className="ml-2">Resend code in <T variant="label" className="text-brand-700">{clock(wait)}</T></T>
          </View>
        ) : (
          <PressableScale onPress={() => resend.mutate()} disabled={resend.isPending} accessibilityRole="button" accessibilityLabel="Resend code" className="h-11 flex-row items-center rounded-full bg-brand-50 px-4">
            <RotateCw size={16} color={colors.brand[600]} strokeWidth={2.4} />
            <T variant="label" className="ml-2 text-brand-700">{resend.isPending ? 'Sending…' : 'Resend code'}</T>
          </PressableScale>
        )}
      </FadeInView>
    </Screen>
  );
}

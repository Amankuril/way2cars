import { View, Pressable } from '@/mobile/rn';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { useCallback } from 'react';
import { CheckCircle2, Circle, ChevronRight, UserRound, Building2, ShieldCheck, Landmark, LogOut } from 'lucide-react';
import { Screen, T, Button, Notice, Logo, Panel, Pill, useToast, cn } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { KYC_STATUS } from '@shared/lib/labels';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

const STEPS = [
  { key: 'profile', screen: 'ProfileStep', icon: UserRound, title: 'Your details', desc: 'Name and email' },
  { key: 'business', screen: 'BusinessStep', icon: Building2, title: 'Business & address', desc: 'Individual or company, city' },
  { key: 'kyc', screen: 'KycStep', icon: ShieldCheck, title: 'Identity verification', desc: 'ID, PAN and a selfie' },
  { key: 'bank', screen: 'BankStep', icon: Landmark, title: 'Bank account', desc: 'Where we send your earnings' },
];

export function OnboardingScreen({ navigation }) {
  const { account, refreshAccount, signOut } = useAuth();
  const toast = useToast();
  const me = useQuery({ queryKey: ['vendor-me'], queryFn: refreshAccount });
  useFocusEffect(useCallback(() => { me.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const v = me.data || account;
  const done = (k) => v.completedSteps?.includes(k);
  const allDone = STEPS.every((s) => done(s.key));
  const submit = useMutation({
    mutationFn: () => api.post('/api/v1/vendor/me/onboarding/submit'),
    onSuccess: async () => { await refreshAccount(); toast('Application submitted', 'success'); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const completed = STEPS.filter((s) => done(s.key)).length;

  return (
    <Screen edges={['top', 'bottom']} refreshing={me.isRefetching} onRefresh={me.refetch} footer={<Button title={v.status === 'rejected' ? 'Resubmit application' : 'Submit for approval'} size="lg" block disabled={!allDone} loading={submit.isPending} onPress={() => submit.mutate()} />}>
      <View className="flex-row items-start justify-between px-5 pt-6">
        <Logo subtitle="Host" />
        <Pressable onPress={signOut} className="flex-row items-center p-2" accessibilityRole="button"><LogOut size={16} color={colors.ink[500]} /><T variant="caption" tone="subtle" className="ml-1">Sign out</T></Pressable>
      </View>
      <View className="px-5 pt-6">
        <T variant="title">Become a WAY2CARS host</T>
        <T variant="body" tone="muted" className="mt-2">Complete these steps. Our team reviews applications within one working day.</T>
        <View className="mt-4 flex-row items-center">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200"><View className="h-full bg-brand-500" style={{ width: `${(completed / STEPS.length) * 100}%` }} /></View>
          <T variant="caption" tone="muted" className="ml-3">{completed}/{STEPS.length}</T>
        </View>
      </View>
      {v.status === 'rejected' ? <Notice tone="danger" title="Changes requested" className="mx-4 mt-5">{v.statusReason || 'Please review your details and resubmit.'}</Notice> : null}
      <Panel padded={false} className="mt-5">
        {STEPS.map((s, i) => {
          const ok = done(s.key);
          const kycBadge = s.key === 'kyc' && v.kyc?.status !== 'not_submitted' ? KYC_STATUS[v.kyc.status] : null;
          return (
            <Pressable key={s.key} onPress={() => navigation.navigate(s.screen)} className={cn('flex-row items-center px-4 py-4 active:bg-ink-50', i < STEPS.length - 1 && 'border-b border-line')} accessibilityRole="button">
              {ok ? <CheckCircle2 size={22} color={colors.success[600]} /> : <Circle size={22} color={colors.ink[300]} />}
              <View className="ml-3.5 flex-1">
                <T variant="body" className="font-semibold">{s.title}</T>
                <T variant="caption" tone="subtle">{s.desc}</T>
              </View>
              {kycBadge ? <Pill label={kycBadge.label} tone={kycBadge.tone} className="mr-2" /> : null}
              <ChevronRight size={18} color={colors.ink[400]} />
            </Pressable>
          );
        })}
      </Panel>
      <T variant="caption" tone="subtle" className="mx-5 mt-4">You can add cars while we review your application. Commission and payout timelines are in the <T variant="caption" tone="brand" onPress={() => navigation.navigate("CmsPage", { slug: "host-terms" })}>Host Terms</T>.</T>
      <Pressable onPress={() => navigation.navigate('Help')} className="mx-5 mt-3 self-start py-1"><T variant="label" tone="brand">Need help with your application?</T></Pressable>
    </Screen>
  );
}

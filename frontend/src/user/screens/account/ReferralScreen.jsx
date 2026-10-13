import { useEffect, useRef, useState } from 'react';
import { View, Share, FlatList } from '@/mobile/rn';
import { useQuery } from '@tanstack/react-query';
import { Clipboard } from '@/mobile/rn';
import { Gift, Copy, Share2, Check, Users } from 'lucide-react';
import { Screen, HeroHeader, Header, T, Button, ErrorState, Pill, Card, SectionHeader, FadeInView, IconTile, Avatar, Skeleton, SkeletonRow, PressableScale, useToast } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { money, dateLong } from '@shared/lib/format';
import { api } from '../../api';

function Hero({ r }) {
  return (
    <HeroHeader compact title="Refer & earn">
      <View className="mt-2 flex-row items-center pb-14">
        <View className="mr-3 flex-1">
          {r ? <T variant="title" tone="inverse">Give {money(r.refereeRewardPaise)}, get {money(r.referrerRewardPaise)}</T> : <Skeleton className="h-7 w-48 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />}
          <T variant="bodySm" className="mt-1.5 text-white/80">Your friend gets credit after their first completed trip — and so do you.</T>
        </View>
        <IconTile icon={Gift} tone="inverse" size={56} />
      </View>
    </HeroHeader>
  );
}

export function ReferralScreen() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const q = useQuery({ queryKey: ['referrals'], queryFn: () => api.get('/api/v1/user/referrals') });
  if (q.isLoading) {
    return (
      <Screen tone="hero" scroll={false}>
        <Hero />
        <View style={{ marginTop: -40 }}><Card className="mx-4 p-4"><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-14 w-full rounded-xl" /><Skeleton className="mt-3 h-12 w-full rounded-lg" /></Card></View>
        <Card className="mx-4 mt-6"><SkeletonRow /><SkeletonRow /></Card>
      </Screen>
    );
  }
  if (q.error) return <Screen header={<Header title="Refer & earn" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const r = q.data;
  const message = `Rent self-drive cars on WAY2CARS. Sign up with my code ${r.code} and get ${money(r.refereeRewardPaise)} in your wallet after your first trip.`;
  const copy = () => {
    Clipboard.setString(r.code);
    toast('Code copied');
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  const steps = [
    { title: 'Share your code', subtitle: 'Send an invite to a friend' },
    { title: 'Your friend signs up', subtitle: `With code ${r.code}, then completes their first trip` },
    { title: 'You both get credit', subtitle: `${money(r.referrerRewardPaise)} for you, ${money(r.refereeRewardPaise)} for them — in your wallets` },
  ];
  return (
    <Screen tone="hero" scroll={false}>
      <FlatList
        data={r.referrals}
        keyExtractor={(x) => x.id}
        contentContainerClassName="pb-8"
        ListHeaderComponent={
          <View>
            <Hero r={r} />
            <FadeInView style={{ marginTop: -40 }}>
              <Card className="mx-4 p-4">
                <T variant="overline" tone="subtle">Your invite code</T>
                <View className="mt-2 flex-row items-center rounded-xl border border-dashed border-brand-300 bg-brand-50 py-1.5 pl-4 pr-1.5">
                  <T variant="headline" className="flex-1 tracking-widest text-brand-700" selectable>{r.code}</T>
                  <PressableScale onPress={copy} accessibilityRole="button" accessibilityLabel={copied ? 'Code copied' : 'Copy code'} className="h-11 flex-row items-center rounded-lg bg-surface px-3.5">
                    {copied ? <Check size={16} color={colors.success[600]} strokeWidth={2.6} /> : <Copy size={16} color={colors.brand[600]} strokeWidth={2.2} />}
                    <T variant="label" className={copied ? 'ml-1.5 text-success-700' : 'ml-1.5 text-brand-700'}>{copied ? 'Copied' : 'Copy'}</T>
                  </PressableScale>
                </View>
                <Button title="Share invite" icon={Share2} block size="lg" className="mt-3" onPress={() => Share.share({ message })} />
                {!r.enabled ? <T variant="caption" tone="warning" className="mt-2 text-center">Referral rewards are paused right now.</T> : null}
              </Card>
            </FadeInView>

            <FadeInView index={1} className="mt-6">
              <SectionHeader title="How it works" />
              <Card className="mx-4 p-4">
                {steps.map((s, i) => (
                  <View key={s.title} className={i ? 'mt-4 flex-row' : 'flex-row'}>
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-50"><T variant="label" className="text-brand-700">{i + 1}</T></View>
                    <View className="ml-3 flex-1">
                      <T variant="label">{s.title}</T>
                      <T variant="caption" tone="subtle" className="mt-0.5">{s.subtitle}</T>
                    </View>
                  </View>
                ))}
              </Card>
            </FadeInView>

            <View className="mt-7 flex-row items-end justify-between px-4 pb-3">
              <T variant="headline" accessibilityRole="header">Your referrals</T>
              <T variant="label" tone="success">Earned {money(r.totalEarnedPaise)}</T>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <FadeInView index={index} className="mx-4 mb-2.5">
            <Card className="flex-row items-center p-3.5">
              <Avatar name={item.name} size={40} />
              <View className="ml-3 mr-2 flex-1"><T variant="label" numberOfLines={1}>{item.name}</T><T variant="caption" tone="subtle">Joined {dateLong(item.createdAt)}</T></View>
              <Pill label={item.status === 'rewarded' ? `+${money(item.rewardPaise)}` : item.status === 'pending' ? 'First trip pending' : 'Not eligible'} tone={item.status === 'rewarded' ? 'success' : 'neutral'} />
            </Card>
          </FadeInView>
        )}
        ListEmptyComponent={
          <Card flat className="mx-4 flex-row items-center p-4">
            <IconTile icon={Users} tone="neutral" size={40} />
            <T variant="bodySm" tone="subtle" className="ml-3 flex-1">No referrals yet. Share your code to get started.</T>
          </Card>
        }
      />
    </Screen>
  );
}

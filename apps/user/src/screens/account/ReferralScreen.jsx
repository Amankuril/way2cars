import { View, Share, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Clipboard from '@react-native-clipboard/clipboard';
import { Gift, Copy, Share2 } from 'lucide-react-native';
import { Screen, Header, T, Button, Loading, ErrorState, Pill, useToast } from '@shared/native';
import { money, dateLong } from '@shared/lib/format';
import { api } from '../../api';

export function ReferralScreen() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['referrals'], queryFn: () => api.get('/api/v1/user/referrals') });
  if (q.isLoading) return <Screen header={<Header title="Refer & earn" />} scroll={false}><Loading /></Screen>;
  if (q.error) return <Screen header={<Header title="Refer & earn" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const r = q.data;
  const message = `Rent self-drive cars on WAY2CARS. Sign up with my code ${r.code} and get ${money(r.refereeRewardPaise)} in your wallet after your first trip.`;
  return (
    <Screen scroll={false} header={<Header title="Refer & earn" />}>
      <FlatList
        data={r.referrals}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={
          <View className="px-4 pt-4">
            <View className="items-center rounded-lg border border-line bg-surface p-5">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-50"><Gift size={26} color="#1875B9" /></View>
              <T variant="headline" className="mt-3 text-center">Give {money(r.refereeRewardPaise)}, get {money(r.referrerRewardPaise)}</T>
              <T variant="bodySm" tone="muted" className="mt-1 text-center">Your friend gets credit after their first completed trip — and so do you.</T>
              <View className="mt-4 w-full flex-row items-center justify-between rounded-md border border-dashed border-brand-300 bg-brand-50 px-4 py-3">
                <T variant="headline" className="tracking-widest text-brand-700">{r.code}</T>
                <Button title="Copy" icon={Copy} variant="ghost" size="sm" onPress={() => { Clipboard.setString(r.code); toast('Code copied'); }} />
              </View>
              <Button title="Share invite" icon={Share2} block className="mt-3" onPress={() => Share.share({ message })} />
              {!r.enabled ? <T variant="caption" tone="warning" className="mt-2">Referral rewards are paused right now.</T> : null}
            </View>
            <View className="mt-6 flex-row items-end justify-between">
              <T variant="headline">Your referrals</T>
              <T variant="label" tone="success">Earned {money(r.totalEarnedPaise)}</T>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View className="mx-4 flex-row items-center border-b border-line py-3">
            <View className="flex-1"><T variant="label">{item.name}</T><T variant="caption" tone="subtle">Joined {dateLong(item.createdAt)}</T></View>
            <Pill label={item.status === 'rewarded' ? `+${money(item.rewardPaise)}` : item.status === 'pending' ? 'First trip pending' : 'Not eligible'} tone={item.status === 'rewarded' ? 'success' : 'neutral'} />
          </View>
        )}
        ListEmptyComponent={<T variant="bodySm" tone="subtle" className="mx-4 mt-3">No referrals yet. Share your code to get started.</T>}
        contentContainerClassName="pb-8"
      />
    </Screen>
  );
}

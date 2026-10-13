import { View, FlatList } from '@/mobile/rn';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { Screen, Header, T, Loading, ErrorState, EmptyState } from '@/mobile/ui';
import { money, dateTime } from '@shared/lib/format';
import { api } from '../../api';

const LABEL = { referral_reward: 'Referral reward', loyalty_reward: 'Trip reward', wallet_redeemed: 'Used for booking', wallet_redeem_reversed: 'Returned from booking', admin_adjustment: 'Credit from WAY2CARS' };

export function WalletScreen() {
  const q = useInfiniteQuery({
    queryKey: ['wallet'],
    queryFn: ({ pageParam }) => api.list('/api/v1/user/wallet', { page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const balance = q.data?.pages[0]?.data.balancePaise ?? 0;
  const entries = q.data?.pages.flatMap((p) => p.data.entries) || [];
  return (
    <Screen scroll={false} header={<Header title="WAY2CARS wallet" />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          ListHeaderComponent={
            <View className="mx-4 mb-4 mt-4 rounded-lg bg-ink-900 p-5">
              <T variant="overline" className="text-ink-300">Available balance</T>
              <T variant="display" tone="inverse" className="mt-1">{money(balance, { exact: true })}</T>
              <T variant="caption" className="mt-2 text-ink-300">Use credits on trip charges at checkout (up to a share of the rental). Credits can’t be withdrawn.</T>
            </View>
          }
          renderItem={({ item: e }) => (
            <View className="flex-row items-center border-b border-line bg-surface px-4 py-3.5">
              <View className="flex-1">
                <T variant="label">{LABEL[e.type] || e.type}</T>
                <T variant="caption" tone="subtle">{e.note ? `${e.note} · ` : ''}{dateTime(e.createdAt)}</T>
              </View>
              <T variant="label" tone={e.direction === 'credit' ? 'success' : 'default'}>{e.direction === 'credit' ? '+' : '−'}{money(e.amountPaise, { exact: true })}</T>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={Wallet} title="No wallet activity yet" message="Earn credits from referrals and completed trips." />}
        />
      )}
    </Screen>
  );
}

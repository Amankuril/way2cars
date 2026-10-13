import { View, FlatList } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Screen, HeroHeader, T, ErrorState, EmptyState, Card, SectionHeader, FadeInView, IconTile, AnimatedNumber, Skeleton, SkeletonRow } from '@shared/native';
import { money, dateTime } from '@shared/lib/format';
import { api } from '../../api';

const LABEL = { referral_reward: 'Referral reward', loyalty_reward: 'Trip reward', wallet_redeemed: 'Used for booking', wallet_redeem_reversed: 'Returned from booking', admin_adjustment: 'Credit from WAY2CARS' };

function BalanceHero({ balance, loading }) {
  return (
    <HeroHeader compact title="WAY2CARS wallet">
      <View className="mt-3 flex-row items-end pb-2">
        <View className="flex-1">
          <T variant="overline" className="text-white/75">Available balance</T>
          {loading ? <Skeleton className="mt-2 h-10 w-40 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} /> : (
            <AnimatedNumber value={money(balance, { exact: true })} variant="display" tone="inverse" className="mt-1" testID="wallet-balance" />
          )}
        </View>
        <IconTile icon={Wallet} tone="inverse" size={52} />
      </View>
      <T variant="caption" className="mt-3 text-white/80">Use credits on trip charges at checkout (up to a share of the rental). Credits can’t be withdrawn.</T>
    </HeroHeader>
  );
}

function Entry({ e, index }) {
  const credit = e.direction === 'credit';
  return (
    <FadeInView index={index} className="mx-4 mb-2.5">
      <Card className="flex-row items-center p-3.5">
        <IconTile icon={credit ? ArrowDownLeft : ArrowUpRight} tone={credit ? 'success' : 'neutral'} size={42} />
        <View className="ml-3 mr-3 flex-1">
          <T variant="label">{LABEL[e.type] || e.type}</T>
          <T variant="caption" tone="subtle" className="mt-0.5" numberOfLines={2}>{e.note ? `${e.note} · ` : ''}{dateTime(e.createdAt)}</T>
        </View>
        <T variant="body" tone={credit ? 'success' : 'default'} className="font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>{credit ? '+' : '−'}{money(e.amountPaise, { exact: true })}</T>
      </Card>
    </FadeInView>
  );
}

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
    <Screen tone="hero" scroll={false}>
      {q.isLoading ? (
        <View className="flex-1">
          <BalanceHero loading />
          <SectionHeader title="Activity" className="mt-6" />
          <Card className="mx-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></Card>
        </View>
      ) : q.error ? (
        <View className="flex-1"><BalanceHero loading /><ErrorState error={q.error} onRetry={q.refetch} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          contentContainerClassName="pb-8"
          ListHeaderComponent={
            <View>
              <BalanceHero balance={balance} />
              {entries.length ? <SectionHeader title="Activity" subtitle="Credits earned and used" className="mt-6" /> : null}
            </View>
          }
          renderItem={({ item: e, index }) => <Entry e={e} index={index} />}
          ListEmptyComponent={<EmptyState icon={Wallet} title="No wallet activity yet" message="Earn credits from referrals and completed trips." />}
        />
      )}
    </Screen>
  );
}

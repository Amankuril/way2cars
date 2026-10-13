import { View, FlatList } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react-native';
import { Screen, Header, T, Pill, Loading, ErrorState, EmptyState } from '@shared/native';
import { PAYOUT_STATUS } from '@shared/lib/labels';
import { money, dateTime } from '../../lib';
import { api } from '../../api';

export function PayoutsScreen() {
  const q = useInfiniteQuery({
    queryKey: ['payouts'],
    queryFn: ({ pageParam }) => api.list('/api/v1/vendor/earnings/payouts', { page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.data) || [];
  return (
    <Screen scroll={false} header={<Header title="Withdrawals" />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList data={items} keyExtractor={(p) => p.id} contentContainerClassName="py-2" onEndReached={() => q.hasNextPage && q.fetchNextPage()} refreshing={q.isRefetching} onRefresh={q.refetch}
          renderItem={({ item: p }) => (
            <View className="mx-4 mt-2 rounded-lg border border-line bg-surface p-4">
              <View className="flex-row items-center justify-between"><T variant="headline">{money(p.amountPaise, { exact: true })}</T><Pill label={PAYOUT_STATUS[p.status].label} tone={PAYOUT_STATUS[p.status].tone} /></View>
              <T variant="caption" tone="subtle" className="mt-1">Requested {dateTime(p.createdAt)} · {p.bank?.bankName || p.bank?.ifsc} ••{p.bank?.accountNumberLast4}</T>
              {p.utr ? <T variant="caption" tone="success" className="mt-1">Paid {dateTime(p.paidAt)} · UTR {p.utr}</T> : null}
              {p.rejectionReason ? <T variant="caption" tone="danger" className="mt-1">{p.rejectionReason} — amount returned to your balance.</T> : null}
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={History} title="No withdrawals yet" />} />
      )}
    </Screen>
  );
}

import { View, FlatList } from '@/mobile/rn';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ListOrdered } from 'lucide-react';
import { Screen, Header, T, Loading, ErrorState, EmptyState } from '@/mobile/ui';
import { money, dateTime } from '../../lib';
import { api } from '../../api';

const LABEL = { trip_earning: 'Trip earning (pending)', earning_released: 'Released to available', payout_requested: 'Withdrawal requested', payout_paid: 'Paid to bank', payout_rejected: 'Withdrawal returned', earning_reversed: 'Adjustment' };

export function LedgerScreen() {
  const q = useInfiniteQuery({
    queryKey: ['ledger'],
    queryFn: ({ pageParam }) => api.list('/api/v1/vendor/earnings/ledger', { page: pageParam, limit: 30 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.data) || [];
  return (
    <Screen scroll={false} header={<Header title="Transactions" />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList data={items} keyExtractor={(e) => e.id} onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          renderItem={({ item: e }) => (
            <View className="flex-row items-center border-b border-line bg-surface px-4 py-3.5">
              <View className="flex-1"><T variant="label">{LABEL[e.type] || e.type}</T><T variant="caption" tone="subtle">{dateTime(e.createdAt)}{e.releaseAt && e.type === 'trip_earning' ? ` · available ${dateTime(e.releaseAt)}` : ''}</T></View>
              <T variant="label" tone={e.type === 'payout_paid' ? 'default' : 'success'}>{e.type === 'payout_paid' || e.type === 'payout_requested' ? '' : '+'}{money(e.amountPaise, { exact: true })}</T>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={ListOrdered} title="No transactions yet" />} />
      )}
    </Screen>
  );
}

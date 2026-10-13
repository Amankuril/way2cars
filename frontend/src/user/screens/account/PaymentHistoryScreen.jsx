import { View, FlatList, Pressable } from '@/mobile/rn';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Screen, Header, T, Loading, ErrorState, EmptyState, Pill } from '@/mobile/ui';
import { money, dateTime } from '@shared/lib/format';
import { REFUND_STATUS } from '@shared/lib/labels';
import { api } from '../../api';

const PURPOSE = { booking: 'Booking', extension: 'Trip extension', settlement: 'Trip dues' };

export function PaymentHistoryScreen({ navigation }) {
  const q = useInfiniteQuery({
    queryKey: ['payments'],
    queryFn: ({ pageParam }) => api.list('/api/v1/user/payments', { page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.data) || [];
  return (
    <Screen scroll={false} header={<Header title="Payments & refunds" />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          contentContainerClassName="py-2"
          renderItem={({ item: p }) => (
            <Pressable onPress={() => navigation.navigate('Trip', { id: p.bookingId })} className="mx-4 mt-2 rounded-lg border border-line bg-surface p-4 active:bg-ink-50">
              <View className="flex-row items-start justify-between">
                <View className="mr-3 flex-1">
                  <T variant="label">{PURPOSE[p.purpose]} · {p.booking?.ref}</T>
                  <T variant="caption" tone="subtle" numberOfLines={1}>{p.booking?.vehicle} · {dateTime(p.paidAt || p.createdAt)}{p.method ? ` · ${p.method.toUpperCase()}` : ''}</T>
                </View>
                <T variant="label">{money(p.amountPaise, { exact: true })}</T>
              </View>
              {p.refunds.map((r) => (
                <View key={r.id} className="mt-2.5 flex-row items-center justify-between border-t border-line pt-2.5">
                  <T variant="caption" tone="muted">Refund · {r.reason.replace(/_/g, ' ')}</T>
                  <View className="flex-row items-center"><Pill label={REFUND_STATUS[r.status].label} tone={REFUND_STATUS[r.status].tone} /><T variant="caption" className="ml-2 font-semibold">{money(r.amountPaise, { exact: true })}</T></View>
                </View>
              ))}
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon={Receipt} title="No payments yet" />}
        />
      )}
    </Screen>
  );
}

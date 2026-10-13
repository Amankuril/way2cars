import { View, FlatList } from '@/mobile/rn';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Receipt, CarFront, CalendarPlus, RotateCcw, ChevronRight } from 'lucide-react';
import { Screen, Header, T, ErrorState, EmptyState, Pill, Card, IconTile, FadeInView, PressableScale, DashedDivider, SkeletonRow } from '@/mobile/ui';
import { colors, shadows } from '@shared/theme/tokens';
import { money, dateTime } from '@shared/lib/format';
import { REFUND_STATUS } from '@shared/lib/labels';
import { api } from '../../api';

const PURPOSE = { booking: 'Booking', extension: 'Trip extension', settlement: 'Trip dues' };
const PURPOSE_ICON = { booking: [CarFront, 'brand'], extension: [CalendarPlus, 'accent'], settlement: [Receipt, 'warning'] };

function PaymentCard({ p, index, onPress }) {
  const [Icon, tone] = PURPOSE_ICON[p.purpose] || [Receipt, 'brand'];
  return (
    <FadeInView index={index} className="mx-4 mb-3">
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${PURPOSE[p.purpose]} ${p.booking?.ref || ''}, ${money(p.amountPaise, { exact: true })}`} className="rounded-2xl bg-surface p-4" style={{ boxShadow: shadows.card }}>
        <View className="flex-row items-start">
          <IconTile icon={Icon} tone={tone} size={42} />
          <View className="ml-3 mr-2 flex-1">
            <T variant="label" numberOfLines={1}>{PURPOSE[p.purpose]} · {p.booking?.ref}</T>
            <T variant="caption" tone="subtle" className="mt-0.5" numberOfLines={1}>{p.booking?.vehicle}</T>
            <T variant="caption" tone="subtle" numberOfLines={1}>{dateTime(p.paidAt || p.createdAt)}{p.method ? ` · ${p.method.toUpperCase()}` : ''}</T>
          </View>
          <View className="items-end">
            <T variant="body" className="font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>{money(p.amountPaise, { exact: true })}</T>
            {p.status === 'paid' ? <View className="mt-1.5 flex-row"><Pill label="Paid" tone="success" /></View> : null}
          </View>
        </View>
        {p.refunds.map((r) => (
          <View key={r.id}>
            <DashedDivider className="my-3" />
            <View className="flex-row items-center">
              <View className="h-7 w-7 items-center justify-center rounded-full bg-ink-100"><RotateCcw size={14} color={colors.ink[600]} strokeWidth={2.2} /></View>
              <T variant="caption" tone="muted" className="ml-2.5 flex-1" numberOfLines={1}>Refund · {r.reason.replace(/_/g, ' ')}</T>
              <Pill label={REFUND_STATUS[r.status].label} tone={REFUND_STATUS[r.status].tone} />
              <T variant="label" className="ml-2" style={{ fontVariant: ['tabular-nums'] }}>{money(r.amountPaise, { exact: true })}</T>
            </View>
          </View>
        ))}
        <View className="mt-3 flex-row items-center justify-end">
          <T variant="caption" tone="brand" className="font-semibold">View trip</T>
          <ChevronRight size={14} color={colors.brand[600]} strokeWidth={2.4} />
        </View>
      </PressableScale>
    </FadeInView>
  );
}

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
      {q.isLoading ? (
        <View className="pt-3">{[0, 1, 2, 3].map((i) => <Card key={i} className="mx-4 mb-3 py-1"><SkeletonRow /></Card>)}</View>
      ) : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          contentContainerClassName="pb-8 pt-3"
          renderItem={({ item: p, index }) => <PaymentCard p={p} index={index} onPress={() => navigation.navigate('Trip', { id: p.bookingId })} />}
          ListFooterComponent={q.isFetchingNextPage ? <Card className="mx-4 mb-3 py-1"><SkeletonRow /></Card> : null}
          ListEmptyComponent={<EmptyState icon={Receipt} title="No payments yet" />}
        />
      )}
    </Screen>
  );
}

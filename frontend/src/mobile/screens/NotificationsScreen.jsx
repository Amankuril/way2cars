import { View, FlatList, Pressable } from '../rn';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, CreditCard, ShieldCheck, Gift, LifeBuoy, Info, Car, Banknote } from 'lucide-react';
import { Screen, Header } from '../ui/Layout';
import { T } from '../ui/Text';
import { Button } from '../ui/Button';
import { Loading, ErrorState, EmptyState } from '../ui/Feedback';
import { cn } from '../ui/cn';
import { colors } from '@shared/theme/tokens';
import { ago } from '@shared/lib/format';
import { useApp } from '../app/AppContext';

const ICON = { booking: CalendarClock, trip: CalendarClock, payment: CreditCard, kyc: ShieldCheck, promo: Gift, support: LifeBuoy, account: Info, system: Info, vehicle: Car, payout: Banknote };

/** In-app inbox. Each app provides `openLink(navigation, link)` to route deep links. */
export function NotificationsScreen({ navigation }) {
  const { api, realm, openLink } = useApp();
  const qc = useQueryClient();
  const base = `/api/v1/${realm}/notifications`;
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.list(base, { page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = useMutation({ mutationFn: () => api.post(`${base}/read`, { all: true }), onSuccess: refresh });
  const open = (n) => {
    if (!n.readAt) api.post(`${base}/read`, { ids: [n._id] }).then(refresh).catch(() => {});
    openLink?.(navigation, n.link);
  };
  const items = q.data?.pages.flatMap((p) => p.data) || [];
  const unread = q.data?.pages[0]?.meta.unreadCount;
  return (
    <Screen scroll={false} header={<Header title="Notifications" right={unread ? <Button title="Mark all read" variant="ghost" size="sm" onPress={() => markAll.mutate()} /> : null} />}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={items}
          keyExtractor={(n) => n._id}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          renderItem={({ item: n }) => {
            const Icon = ICON[n.category] || Bell;
            return (
              <Pressable onPress={() => open(n)} className={cn('flex-row border-b border-line px-4 py-3.5 active:bg-ink-50', n.readAt ? 'bg-surface' : 'bg-brand-50')}>
                <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-md bg-brand-50"><Icon size={18} color={colors.brand[600]} /></View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center justify-between">
                    <T variant="label" className="flex-1" numberOfLines={1}>{n.title}</T>
                    <T variant="caption" tone="subtle" className="ml-2">{ago(n.createdAt)}</T>
                  </View>
                  <T variant="bodySm" tone="muted" className="mt-0.5">{n.body}</T>
                </View>
                {!n.readAt ? <View className="ml-2 mt-2 h-2 w-2 rounded-full bg-brand-500" /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState icon={Bell} title="You’re all caught up" message="Updates about bookings, payments and your account appear here." />}
        />
      )}
    </Screen>
  );
}

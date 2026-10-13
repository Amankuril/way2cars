import { View, FlatList, Pressable } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, CreditCard, ShieldCheck, Gift, LifeBuoy, Info } from 'lucide-react-native';
import { Screen, Header, T, Loading, ErrorState, EmptyState, Button, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { ago } from '@shared/lib/format';
import { api } from '../../api';

const ICON = { booking: CalendarClock, trip: CalendarClock, payment: CreditCard, kyc: ShieldCheck, promo: Gift, support: LifeBuoy, account: Info, system: Info };

/** Maps an in-app link (/trips/<id>, /profile/kyc, …) to a screen. */
function openLink(navigation, link) {
  const m = link?.match(/^\/trips\/([a-f0-9]{24})/);
  if (m) return navigation.navigate('Trip', { id: m[1] });
  if (link?.startsWith('/profile/kyc')) return navigation.navigate('Kyc');
  if (link?.startsWith('/wallet')) return navigation.navigate('Wallet');
  const t = link?.match(/^\/support\/([a-f0-9]{24})/);
  if (t) return navigation.navigate('Ticket', { id: t[1] });
  return null;
}

export function NotificationsScreen({ navigation }) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.list('/api/v1/user/notifications', { page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  const markAll = useMutation({ mutationFn: () => api.post('/api/v1/user/notifications/read', { all: true }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); } });
  const read = (n) => {
    if (!n.readAt) api.post('/api/v1/user/notifications/read', { ids: [n._id] }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {});
    openLink(navigation, n.link);
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
              <Pressable onPress={() => read(n)} className={cn('flex-row border-b border-line px-4 py-3.5 active:bg-ink-50', n.readAt ? 'bg-surface' : 'bg-brand-50/50')}>
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
          ListEmptyComponent={<EmptyState icon={Bell} title="You’re all caught up" message="Booking updates and offers will show up here." />}
        />
      )}
    </Screen>
  );
}

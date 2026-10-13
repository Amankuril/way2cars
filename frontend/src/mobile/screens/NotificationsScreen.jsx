import { View, FlatList, Pressable } from '../rn';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, CreditCard, ShieldCheck, Gift, LifeBuoy, Info, Car, Banknote, CheckCheck } from 'lucide-react';
import { Screen } from '../ui/Layout';
import { T } from '../ui/Text';
import { ErrorState, EmptyState, SkeletonRow, Skeleton } from '../ui/Feedback';
import { Card, IconTile } from '../ui/Surfaces';
import { HeroHeader } from '../ui/Blocks';
import { FadeInView } from '../ui/Motion';
import { cn } from '../ui/cn';
import { colors, shadows } from '@shared/theme/tokens';
import { ago } from '@shared/lib/format';
import { useApp } from '../app/AppContext';

const ICON = { booking: CalendarClock, trip: CalendarClock, payment: CreditCard, kyc: ShieldCheck, promo: Gift, support: LifeBuoy, account: Info, system: Info, vehicle: Car, payout: Banknote };
const TONE = { booking: 'brand', trip: 'brand', payment: 'accent', kyc: 'success', promo: 'warning', support: 'accent', account: 'neutral', system: 'neutral', vehicle: 'brand', payout: 'success' };

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
function groupLabel(d) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(d)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  return 'Earlier';
}

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

  // Flatten into day groups: a header row, then rows that know whether they open/close their card.
  const rows = [];
  items.forEach((n, i) => {
    const g = groupLabel(n.createdAt);
    const prevG = i > 0 ? groupLabel(items[i - 1].createdAt) : null;
    const nextG = i < items.length - 1 ? groupLabel(items[i + 1].createdAt) : null;
    if (g !== prevG) rows.push({ key: `h-${g}`, header: g });
    rows.push({ key: n._id, n, first: g !== prevG, last: g !== nextG, index: i });
  });

  return (
    <Screen
      tone="hero"
      scroll={false}
      header={(
        <HeroHeader
          compact
          rounded={false}
          title="Notifications"
          subtitle={unread ? `${unread} unread` : q.data ? 'All caught up' : undefined}
          right={unread ? (
            <Pressable onPress={() => markAll.mutate()} disabled={markAll.isPending} accessibilityRole="button" accessibilityLabel="Mark all read" className={cn('ml-2 h-11 flex-row items-center rounded-full bg-white/15 px-3.5 active:bg-white/25', markAll.isPending && 'opacity-60')}>
              <CheckCheck size={16} color="#fff" strokeWidth={2.4} />
              <T variant="label" tone="inverse" className="ml-1.5">Mark all read</T>
            </Pressable>
          ) : null}
          className="pb-2"
        />
      )}
    >
      {q.isLoading ? (
        <View className="pt-4">
          <Skeleton className="mx-4 mb-3 h-4 w-20" />
          <Card className="mx-4">{[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}</Card>
        </View>
      ) : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerClassName="pb-8"
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          renderItem={({ item: r }) => {
            if (r.header) return <T variant="overline" tone="subtle" className="mx-5 mb-2 mt-5">{r.header}</T>;
            const { n } = r;
            const Icon = ICON[n.category] || Bell;
            const fresh = !n.readAt;
            return (
              <FadeInView index={r.index} style={{ marginHorizontal: 16 }}>
                <View className={cn('bg-surface', r.first && 'rounded-t-2xl', r.last && 'rounded-b-2xl')} style={{ boxShadow: shadows.card }}>
                  <Pressable
                    onPress={() => open(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${fresh ? 'Unread. ' : ''}${n.title}. ${n.body}`}
                    className={cn('flex-row px-4 py-3.5 active:bg-ink-50', r.first && 'rounded-t-2xl', r.last && 'rounded-b-2xl', !r.last && 'border-b border-line')}
                    style={fresh ? { backgroundColor: 'rgba(234, 243, 250, 0.7)' } : undefined}
                  >
                    <View>
                      <IconTile icon={Icon} tone={TONE[n.category] || 'brand'} size={40} />
                      {fresh ? <View className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" /> : null}
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-start">
                        <T variant="label" className={cn('flex-1 text-[14px]', fresh ? 'font-extrabold text-ink-900' : 'text-ink-800')} numberOfLines={2}>{n.title}</T>
                        <T variant="caption" className={cn('ml-2', fresh && 'font-bold')} style={{ color: fresh ? colors.brand[600] : colors.ink[500] }}>{ago(n.createdAt)}</T>
                      </View>
                      <T variant="bodySm" tone="muted" className="mt-0.5 text-[13px] leading-[19px]">{n.body}</T>
                    </View>
                  </Pressable>
                </View>
              </FadeInView>
            );
          }}
          ListEmptyComponent={<EmptyState icon={Bell} title="You’re all caught up" message="Updates about bookings, payments and your account appear here." />}
        />
      )}
    </Screen>
  );
}

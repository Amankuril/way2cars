import { useEffect, useState, useCallback } from 'react';
import { View, FlatList } from '@/mobile/rn';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { CalendarClock, Lock } from 'lucide-react';
import { Screen, T, Segmented, Loading, ErrorState, EmptyState } from '@/mobile/ui';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { BookingRow } from '../../components/BookingRow';

const TABS = [
  { value: 'requests', label: 'Requests' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];
const EMPTY = { requests: 'No requests waiting', upcoming: 'No upcoming trips', active: 'No cars on trips right now', completed: 'No completed trips yet', cancelled: 'Nothing cancelled' };

export function BookingsScreen({ navigation, route }) {
  const { account } = useAuth();
  const [tab, setTab] = useState(route.params?.tab || 'requests');
  useEffect(() => { if (route.params?.tab) setTab(route.params.tab); }, [route.params?.tab]);
  const approved = account?.status === 'approved';
  const q = useInfiniteQuery({
    queryKey: ['bookings', 'list', tab],
    queryFn: ({ pageParam }) => api.list('/api/v1/vendor/bookings', { tab, page: pageParam, limit: 15 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
    enabled: approved,
  });
  useFocusEffect(useCallback(() => { if (approved) q.refetch(); }, [tab, approved])); // eslint-disable-line react-hooks/exhaustive-deps
  const items = q.data?.pages.flatMap((p) => p.data) || [];

  return (
    <Screen edges={['top']} scroll={false}>
      <View className="px-4 pb-3 pt-4">
        <T variant="title">Bookings</T>
        <Segmented className="mt-4" options={TABS} value={tab} onChange={setTab} />
      </View>
      {!approved ? (
        <EmptyState icon={Lock} title="Available after approval" message="Bookings appear here once your host account is approved and your cars are live." />
      ) : q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BookingRow booking={item} onPress={() => navigation.navigate('Booking', { id: item.id })} />}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          contentContainerClassName="pb-6"
          ListEmptyComponent={<EmptyState icon={CalendarClock} title={EMPTY[tab]} />}
        />
      )}
    </Screen>
  );
}

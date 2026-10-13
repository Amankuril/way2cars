import { useState, useCallback } from 'react';
import { View, FlatList } from '@/mobile/rn';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { CalendarX, History, Search } from 'lucide-react';
import { Screen, T, Segmented, ErrorState, EmptyState, Button, FadeInView, CarArt } from '@/mobile/ui';
import { api } from '../../api';
import { TripCard, SkeletonTripCard } from '../../components/TripCard';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY = {
  upcoming: { title: 'No upcoming trips', message: 'Find a car for your next weekend getaway or city run.', art: <CarArt still /> },
  active: { title: 'No trip in progress', message: 'Once you pick up a car, your trip shows up here.', art: <CarArt still /> },
  completed: { title: 'No past trips yet', message: 'Trips you complete will show up here.', icon: History },
  cancelled: { title: 'No cancelled trips', message: 'Cancelled, declined and unpaid bookings appear here.', icon: CalendarX },
};

export function TripsScreen({ navigation }) {
  const [tab, setTab] = useState('upcoming');
  const q = useInfiniteQuery({
    queryKey: ['trips', tab],
    queryFn: ({ pageParam }) => api.list('/api/v1/user/bookings', { tab, page: pageParam, limit: 15 }),
    initialPageParam: 1,
    getNextPageParam: (l) => (l.meta.page < l.meta.pages ? l.meta.page + 1 : undefined),
  });
  useFocusEffect(useCallback(() => { q.refetch(); }, [tab])); // eslint-disable-line react-hooks/exhaustive-deps
  const items = q.data?.pages.flatMap((p) => p.data) || [];
  const empty = EMPTY[tab];

  return (
    <Screen edges={['top']} scroll={false}>
      <View className="px-4 pb-3 pt-4">
        <T variant="overline" tone="brand">My bookings</T>
        <T variant="title" className="mt-0.5" accessibilityRole="header">Your trips</T>
        <Segmented className="mt-4" options={TABS} value={tab} onChange={setTab} />
      </View>
      {q.isLoading ? (
        <View className="pt-2" accessibilityLabel="Loading trips">
          {[0, 1, 2].map((i) => <SkeletonTripCard key={i} />)}
        </View>
      ) : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index }) => (
            <FadeInView index={index}>
              <TripCard trip={item} onPress={() => navigation.navigate('Trip', { id: item.id })} />
            </FadeInView>
          )}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          contentContainerClassName="pb-6 pt-2"
          ListFooterComponent={q.isFetchingNextPage ? <SkeletonTripCard /> : null}
          ListEmptyComponent={
            <EmptyState
              key={tab}
              art={empty.art}
              icon={empty.icon}
              title={empty.title}
              message={empty.message}
              action={tab === 'upcoming' ? <Button title="Find a car" icon={Search} onPress={() => navigation.navigate('Explore')} /> : null}
            />
          }
        />
      )}
    </Screen>
  );
}

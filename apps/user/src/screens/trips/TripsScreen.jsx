import { useState } from 'react';
import { View, FlatList } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { CalendarClock } from 'lucide-react-native';
import { Screen, T, Segmented, Loading, ErrorState, EmptyState, Button } from '@shared/native';
import { api } from '../../api';
import { TripCard } from '../../components/TripCard';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];

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

  return (
    <Screen edges={['top']} scroll={false}>
      <View className="px-4 pb-3 pt-4">
        <T variant="title">Your trips</T>
        <Segmented className="mt-4" options={TABS} value={tab} onChange={setTab} />
      </View>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TripCard trip={item} onPress={() => navigation.navigate('Trip', { id: item.id })} />}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          contentContainerClassName="pb-6"
          ListEmptyComponent={
            <EmptyState
              icon={CalendarClock}
              title={tab === 'upcoming' ? 'No upcoming trips' : tab === 'active' ? 'No trip in progress' : tab === 'completed' ? 'No past trips yet' : 'No cancelled trips'}
              message={tab === 'upcoming' ? 'Find a car for your next weekend getaway or city run.' : undefined}
              action={tab === 'upcoming' ? <Button title="Find a car" onPress={() => navigation.navigate('Explore')} /> : null}
            />
          }
        />
      )}
    </Screen>
  );
}

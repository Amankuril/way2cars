import { useMemo, useState } from 'react';
import { View, FlatList, ScrollView, Pressable } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, ArrowUpDown, PencilLine, SearchX, RotateCcw, CalendarDays } from 'lucide-react-native';
import { Screen, Header, T, Button, Chip, Sheet, ErrorState, IconButton, CarLoader, CarArt, TripRoute, FadeInView, SkeletonVehicleCard, Card } from '@shared/native';
import { colors, shadows } from '@shared/theme/tokens';
import { dayLabel, timeLabel, duration } from '@shared/lib/format';
import { FUEL, BODY_TYPE } from '@shared/lib/labels';
import { api } from '../../api';
import { useTripPlan } from '../../hooks/useTripPlan';
import { useBrands, usePublicConfig } from '../../hooks/queries';
import { VehicleCard } from '../../components/VehicleCard';
import { TripTimesSheet } from '../../components/TripTimesSheet';

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'distance', label: 'Nearest first' },
];
const PRICE_BANDS = [
  { label: 'Under ₹2,000/day', max: 200000 },
  { label: '₹2,000–3,500', min: 200000, max: 350000 },
  { label: '₹3,500–6,000', min: 350000, max: 600000 },
  { label: 'Above ₹6,000', min: 600000 },
];
const EMPTY = { brandIds: [], fuelTypes: [], bodyTypes: [], transmission: null, price: null, luxury: false, electric: false, instant: false, delivery: false, minHostRating: null, seatsMin: null };

export function SearchResultsScreen({ navigation, route }) {
  const plan = useTripPlan();
  const config = usePublicConfig();
  const brands = useBrands();
  const [sort, setSort] = useState(route.params?.sort || 'recommended');
  const [filters, setFilters] = useState({ ...EMPTY, categoryIds: route.params?.categoryIds || [] });
  const [draft, setDraft] = useState(filters);
  const [sheet, setSheet] = useState(null); // 'filters' | 'sort' | 'times'
  const near = route.params?.near;

  const query = useMemo(() => ({
    cityId: plan.city?.id,
    startAt: plan.startAt.toISOString(),
    endAt: plan.endAt.toISOString(),
    sort,
    lat: near?.lat,
    lng: near?.lng,
    brandIds: filters.brandIds,
    fuelTypes: filters.fuelTypes,
    bodyTypes: filters.bodyTypes,
    categoryIds: filters.categoryIds,
    transmission: filters.transmission,
    minPricePaise: filters.price?.min,
    maxPricePaise: filters.price?.max,
    luxury: filters.luxury ? 'true' : undefined,
    electric: filters.electric ? 'true' : undefined,
    instant: filters.instant ? 'true' : undefined,
    delivery: filters.delivery ? 'true' : undefined,
    minHostRating: filters.minHostRating,
    seatsMin: filters.seatsMin,
    limit: 12,
  }), [plan.city, plan.startAt, plan.endAt, sort, near, filters]);

  const results = useInfiniteQuery({
    queryKey: ['search', query],
    queryFn: ({ pageParam }) => api.list('/api/v1/public/vehicles', { ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined),
    enabled: !!plan.city,
  });
  const items = results.data?.pages.flatMap((p) => p.data) || [];
  const total = results.data?.pages[0]?.meta.total;
  const activeCount = ['brandIds', 'fuelTypes', 'bodyTypes'].reduce((n, k) => n + filters[k].length, 0) + ['transmission', 'price', 'minHostRating', 'seatsMin'].filter((k) => filters[k]).length + ['luxury', 'electric', 'instant', 'delivery'].filter((k) => filters[k]).length;

  const toggle = (key, val) => setDraft((d) => ({ ...d, [key]: d[key].includes(val) ? d[key].filter((x) => x !== val) : [...d[key], val] }));
  const flag = (key) => setDraft((d) => ({ ...d, [key]: !d[key] }));

  const tripLabel = duration(plan.startAt, plan.endAt);
  const sortLabel = SORTS.find((x) => x.value === sort)?.label;

  return (
    <Screen
      scroll={false}
      header={
        <Header
          title={route.params?.title || `Cars in ${plan.city?.name || ''}`}
          subtitle={`${dayLabel(plan.startAt)}, ${timeLabel(plan.startAt)} → ${dayLabel(plan.endAt)}, ${timeLabel(plan.endAt)} · ${tripLabel}`}
          right={<IconButton icon={PencilLine} label="Change trip times" tone="brand" onPress={() => setSheet('times')} className="bg-brand-50" />}
        />
      }
    >
      {/* Quick controls */}
      <View className="border-b border-line bg-surface py-2.5" style={{ boxShadow: shadows.card }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4">
          <Chip label={activeCount ? `Filters · ${activeCount}` : 'Filters'} icon={SlidersHorizontal} selected={!!activeCount} onPress={() => { setDraft(filters); setSheet('filters'); }} />
          <Chip label={sortLabel} icon={ArrowUpDown} onPress={() => setSheet('sort')} />
          <Chip label="Instant book" selected={filters.instant} onPress={() => setFilters((f) => ({ ...f, instant: !f.instant }))} />
          <Chip label="Automatic" selected={filters.transmission === 'automatic'} onPress={() => setFilters((f) => ({ ...f, transmission: f.transmission === 'automatic' ? null : 'automatic' }))} />
          <Chip label="Electric" selected={filters.electric} onPress={() => setFilters((f) => ({ ...f, electric: !f.electric }))} />
          <Chip label="Delivery" selected={filters.delivery} onPress={() => setFilters((f) => ({ ...f, delivery: !f.delivery }))} />
        </ScrollView>
      </View>

      {results.isLoading ? (
        <View className="pt-5" testID="search-loading">
          <CarLoader title="Finding the best rides…" subtitle={`for your trip in ${plan.city?.name || 'your city'}`}>
            <View className="rounded-2xl border border-ink-100 bg-ink-50 px-3.5 py-3">
              <TripRoute
                animated
                start={{ overline: 'Pickup', title: dayLabel(plan.startAt), subtitle: timeLabel(plan.startAt) }}
                end={{ overline: 'Return', title: dayLabel(plan.endAt), subtitle: timeLabel(plan.endAt) }}
                label={tripLabel}
              />
            </View>
          </CarLoader>
        </View>
      ) : results.error ? (
        <ErrorState error={results.error} onRetry={results.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          contentContainerClassName="pb-10"
          ListHeaderComponent={items.length ? (
            <View className="flex-row items-center justify-between px-4 pb-3 pt-4">
              <T variant="label">{total} {total === 1 ? 'car' : 'cars'} available</T>
              <T variant="caption" tone="subtle">{sortLabel}</T>
            </View>
          ) : null}
          renderItem={({ item, index }) => (
            <FadeInView index={index}>
              <VehicleCard vehicle={item} onPress={() => navigation.navigate('Vehicle', { id: item.id })} />
            </FadeInView>
          )}
          onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshing={results.isRefetching && !results.isFetchingNextPage}
          onRefresh={results.refetch}
          ListFooterComponent={results.isFetchingNextPage ? <SkeletonVehicleCard /> : null}
          ListEmptyComponent={
            <FadeInView className="px-4 pt-6">
              <Card className="items-center overflow-hidden px-6 pb-6 pt-8">
                <View className="items-center">
                  <CarArt still />
                  <View className="mt-1 h-1.5 w-44 rounded-full bg-ink-100" />
                </View>
                <View className="absolute right-5 top-5 h-10 w-10 items-center justify-center rounded-full bg-warning-50"><SearchX size={20} color={colors.warning[600]} /></View>
                <T variant="headline" className="mt-5 text-center">No cars for these times</T>
                <T variant="bodySm" tone="muted" className="mt-1.5 text-center">{activeCount ? 'Try removing some filters.' : 'Try shifting your pickup time or trip length — availability changes quickly.'}</T>
                <View className="mt-5">
                  {activeCount
                    ? <Button title="Clear filters" icon={RotateCcw} variant="secondary" onPress={() => setFilters({ ...EMPTY, categoryIds: [] })} />
                    : <Button title="Change times" icon={CalendarDays} variant="secondary" onPress={() => setSheet('times')} />}
                </View>
              </Card>
            </FadeInView>
          }
        />
      )}

      <Sheet visible={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        <View className="pb-3">
          {SORTS.filter((s) => s.value !== 'distance' || near).map((s) => (
            <Pressable key={s.value} onPress={() => { setSort(s.value); setSheet(null); }} className="flex-row items-center justify-between px-5 py-3.5 active:bg-ink-50">
              <T variant="body" className={sort === s.value ? 'font-bold text-brand-700' : ''}>{s.label}</T>
              {sort === s.value ? <View className="h-2.5 w-2.5 rounded-full bg-brand-500" /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={sheet === 'filters'}
        onClose={() => setSheet(null)}
        title="Filters"
        footer={
          <View className="flex-row">
            <Button title="Reset" variant="secondary" className="mr-3 flex-1" onPress={() => setDraft({ ...EMPTY, categoryIds: [] })} />
            <Button title="Show cars" className="flex-[2]" onPress={() => { setFilters(draft); setSheet(null); }} />
          </View>
        }
      >
        <ScrollView className="px-5" contentContainerClassName="pb-4">
          <T variant="label" tone="muted" className="mb-2 mt-1">Price per day</T>
          <View className="flex-row flex-wrap">{PRICE_BANDS.map((p) => <Chip key={p.label} label={p.label} className="mb-2" selected={draft.price?.label === p.label} onPress={() => setDraft((d) => ({ ...d, price: d.price?.label === p.label ? null : p }))} />)}</View>
          <T variant="label" tone="muted" className="mb-2 mt-4">Car type</T>
          <View className="flex-row flex-wrap">{['hatchback', 'sedan', 'compact_suv', 'suv', 'muv'].map((b) => <Chip key={b} label={BODY_TYPE[b]} className="mb-2" selected={draft.bodyTypes.includes(b)} onPress={() => toggle('bodyTypes', b)} />)}</View>
          <T variant="label" tone="muted" className="mb-2 mt-4">Fuel</T>
          <View className="flex-row flex-wrap">{Object.entries(FUEL).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={draft.fuelTypes.includes(k)} onPress={() => toggle('fuelTypes', k)} />)}</View>
          <T variant="label" tone="muted" className="mb-2 mt-4">Transmission</T>
          <View className="flex-row">{['manual', 'automatic'].map((t) => <Chip key={t} label={t === 'manual' ? 'Manual' : 'Automatic'} selected={draft.transmission === t} onPress={() => setDraft((d) => ({ ...d, transmission: d.transmission === t ? null : t }))} />)}</View>
          <T variant="label" tone="muted" className="mb-2 mt-4">Seats</T>
          <View className="flex-row">{[5, 7].map((s) => <Chip key={s} label={`${s}+ seats`} selected={draft.seatsMin === s} onPress={() => setDraft((d) => ({ ...d, seatsMin: d.seatsMin === s ? null : s }))} />)}</View>
          <T variant="label" tone="muted" className="mb-2 mt-4">Good to have</T>
          <View className="flex-row flex-wrap">
            <Chip label="Luxury" className="mb-2" selected={draft.luxury} onPress={() => flag('luxury')} />
            <Chip label="Electric" className="mb-2" selected={draft.electric} onPress={() => flag('electric')} />
            <Chip label="Instant book" className="mb-2" selected={draft.instant} onPress={() => flag('instant')} />
            <Chip label="Doorstep delivery" className="mb-2" selected={draft.delivery} onPress={() => flag('delivery')} />
          </View>
          <T variant="label" tone="muted" className="mb-2 mt-4">Host rating</T>
          <View className="flex-row">{[4, 4.5].map((r) => <Chip key={r} label={`${r}★ & above`} selected={draft.minHostRating === r} onPress={() => setDraft((d) => ({ ...d, minHostRating: d.minHostRating === r ? null : r }))} />)}</View>
          {brands.data?.length ? (
            <>
              <T variant="label" tone="muted" className="mb-2 mt-4">Brand</T>
              <View className="flex-row flex-wrap">{brands.data.map((b) => <Chip key={b.id} label={b.name} className="mb-2" selected={draft.brandIds.includes(b.id)} onPress={() => toggle('brandIds', b.id)} />)}</View>
            </>
          ) : null}
          <T variant="caption" tone="subtle" className="mt-3">Prices exclude taxes and the refundable deposit.</T>
        </ScrollView>
      </Sheet>

      <TripTimesSheet visible={sheet === 'times'} onClose={() => setSheet(null)} startAt={plan.startAt} endAt={plan.endAt} minLeadMinutes={config.data?.booking?.minLeadMinutes ?? 60} minHours={config.data?.booking?.minDurationHours ?? 4} onApply={plan.setTimes} />
    </Screen>
  );
}

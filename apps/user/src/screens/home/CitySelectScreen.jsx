import { useMemo, useState } from 'react';
import { View, FlatList, TextInput, Pressable } from 'react-native';
import { Check, MapPin, Search, X, MapPinOff } from 'lucide-react-native';
import { Screen, Header, T, ErrorState, EmptyState, FadeInView, PressableScale, IconTile, SkeletonRow, cn } from '@shared/native';
import { colors, shadows } from '@shared/theme/tokens';
import { useCities } from '../../hooks/queries';
import { useTripPlan } from '../../hooks/useTripPlan';

export function CitySelectScreen({ navigation }) {
  const plan = useTripPlan();
  const cities = useCities();
  const [q, setQ] = useState('');
  const list = useMemo(() => (cities.data || []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [cities.data, q]);
  const choose = (c) => { plan.setCity(c); navigation.goBack(); };

  return (
    <Screen scroll={false} header={<Header title="Choose your city" subtitle="Cars, prices and offers are shown per city" />}>
      <View className="px-4 pb-2 pt-4">
        <View className="h-12 flex-row items-center rounded-full border border-ink-100 bg-surface pl-4 pr-1" style={{ boxShadow: shadows.card }}>
          <Search size={18} color={colors.ink[500]} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Search cities"
            placeholderTextColor={colors.ink[400]}
            accessibilityLabel="Search cities"
            className="ml-2.5 h-12 flex-1 font-sans text-body font-medium text-ink-900"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear search" className="h-11 w-11 items-center justify-center rounded-full active:bg-ink-100">
              <X size={18} color={colors.ink[500]} />
            </Pressable>
          ) : null}
        </View>
        {plan.city ? (
          <View className="mt-3 flex-row items-center">
            <T variant="caption" tone="subtle">Currently browsing</T>
            <View className="ml-2 flex-row items-center rounded-full bg-brand-50 px-2.5 py-1">
              <MapPin size={12} color={colors.brand[600]} strokeWidth={2.4} />
              <T variant="caption" className="ml-1 font-bold text-brand-700">{plan.city.name}</T>
            </View>
          </View>
        ) : null}
      </View>
      {cities.isLoading ? (
        <View className="pt-2">{[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}</View>
      ) : cities.error ? <ErrorState error={cities.error} onRetry={cities.refetch} /> : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pb-8 pt-2"
          renderItem={({ item, index }) => {
            const selected = plan.city?.id === item.id;
            return (
              <FadeInView index={index} className="mb-2.5">
                <PressableScale
                  onPress={() => choose(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${item.name}${item.state ? `, ${item.state}` : ''}`}
                  className={cn('min-h-[64px] flex-row items-center rounded-2xl border bg-surface px-3.5 py-3', selected ? 'border-brand-300' : 'border-transparent')}
                  style={{ boxShadow: shadows.card }}
                >
                  <IconTile icon={MapPin} tone={selected ? 'brand' : 'neutral'} size={40} />
                  <View className="ml-3 flex-1">
                    <T variant="body" className="font-bold">{item.name}</T>
                    {item.state ? <T variant="caption" tone="subtle">{item.state}</T> : null}
                  </View>
                  {selected ? (
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-brand-500"><Check size={16} color="#fff" strokeWidth={3} /></View>
                  ) : null}
                </PressableScale>
              </FadeInView>
            );
          }}
          ListEmptyComponent={<EmptyState icon={MapPinOff} title={`We’re not in “${q}” yet`} message="We’re adding new cities regularly. Try a nearby city for now." />}
        />
      )}
    </Screen>
  );
}

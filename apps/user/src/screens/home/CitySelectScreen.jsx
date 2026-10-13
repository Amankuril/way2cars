import { useMemo, useState } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { Check, MapPin } from 'lucide-react-native';
import { Screen, Header, T, Field, Loading, ErrorState } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { useCities } from '../../hooks/queries';
import { useTripPlan } from '../../hooks/useTripPlan';

export function CitySelectScreen({ navigation }) {
  const plan = useTripPlan();
  const cities = useCities();
  const [q, setQ] = useState('');
  const list = useMemo(() => (cities.data || []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [cities.data, q]);
  const choose = (c) => { plan.setCity(c); navigation.goBack(); };

  return (
    <Screen bg="surface" scroll={false} header={<Header title="Choose your city" />}>
      <View className="px-4 pt-4"><Field placeholder="Search cities" value={q} onChangeText={setQ} autoFocus /></View>
      {cities.isLoading ? <Loading /> : cities.error ? <ErrorState error={cities.error} onRetry={cities.refetch} /> : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => choose(item)} className="flex-row items-center border-b border-line px-4 py-4 active:bg-ink-50" accessibilityRole="button">
              <MapPin size={18} color={colors.ink[500]} />
              <View className="ml-3 flex-1">
                <T variant="body" className="font-semibold">{item.name}</T>
                {item.state ? <T variant="caption" tone="subtle">{item.state}</T> : null}
              </View>
              {plan.city?.id === item.id ? <Check size={18} color={colors.brand[600]} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={<T variant="bodySm" tone="subtle" className="px-4 py-6">We’re not in “{q}” yet.</T>}
        />
      )}
    </Screen>
  );
}

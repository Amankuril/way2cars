import { View, FlatList, Image, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Plus, CarFront, Eye, EyeOff } from 'lucide-react-native';
import { Screen, T, Button, Pill, Loading, ErrorState, EmptyState } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { VEHICLE_APPROVAL, VEHICLE_STATUS } from '@shared/lib/labels';
import { money } from '../../lib';
import { api } from '../../api';

export function FleetScreen({ navigation }) {
  const q = useQuery({ queryKey: ['vehicles'], queryFn: () => api.get('/api/v1/vendor/vehicles', { limit: 100 }) });
  useFocusEffect(useCallback(() => { q.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen edges={['top']} scroll={false}>
      <View className="flex-row items-center justify-between px-4 pb-3 pt-4">
        <T variant="title">Your fleet</T>
        <Button title="Add car" icon={Plus} size="sm" onPress={() => navigation.navigate('VehicleForm')} />
      </View>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <FlatList
          data={q.data}
          keyExtractor={(v) => v.id}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          contentContainerClassName="pb-6"
          renderItem={({ item: v }) => {
            const a = VEHICLE_APPROVAL[v.approval?.status || 'draft'];
            const s = VEHICLE_STATUS[v.status];
            return (
              <Pressable onPress={() => navigation.navigate('Vehicle', { id: v.id })} className="mx-4 mb-3 overflow-hidden rounded-lg border border-line bg-surface active:opacity-90" accessibilityRole="button">
                <View className="flex-row p-3">
                  {v.photos?.[0] ? <Image source={{ uri: v.photos[0] }} style={{ width: 104, height: 74, borderRadius: 8 }} /> : <View style={{ width: 104, height: 74 }} className="items-center justify-center rounded-md bg-ink-100"><CarFront size={24} color={colors.ink[400]} /></View>}
                  <View className="ml-3 flex-1">
                    <T variant="label" numberOfLines={1}>{v.title}</T>
                    <T variant="caption" tone="muted">{v.registrationNumber} · {v.year}</T>
                    <T variant="caption" tone="subtle">{money(v.pricing.dailyPaise)}/day · {v.stats?.trips || 0} trips</T>
                    <View className="mt-1.5 flex-row">
                      <Pill label={a.label} tone={a.tone} className="mr-1.5" />
                      {v.approval?.status === 'approved' ? <Pill label={s.label} tone={s.tone} /> : null}
                    </View>
                  </View>
                </View>
                <View className="flex-row items-center border-t border-line px-3 py-2">
                  {v.isListed ? <Eye size={14} color={colors.success[600]} /> : <EyeOff size={14} color={colors.ink[400]} />}
                  <T variant="caption" tone={v.isListed ? 'success' : 'subtle'} className="ml-1.5">{v.isListed ? 'Visible to renters' : 'Not visible to renters'}</T>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState icon={CarFront} title="No cars yet" message="Add your first car — it takes about 10 minutes with photos and documents." action={<Button title="Add a car" icon={Plus} onPress={() => navigation.navigate('VehicleForm')} />} />}
        />
      )}
    </Screen>
  );
}

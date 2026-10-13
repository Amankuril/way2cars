import { View, FlatList } from '@/mobile/rn';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { useCallback } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { Screen, Header, T, Button, Loading, ErrorState, EmptyState, Pill, ListItem } from '@/mobile/ui';
import { api } from '../../api';

export function AddressesScreen({ navigation }) {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/api/v1/user/me') });
  useFocusEffect(useCallback(() => { me.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const list = me.data?.addresses || [];
  return (
    <Screen scroll={false} header={<Header title="Saved addresses" />} footer={list.length < 10 ? <Button title="Add address" icon={Plus} block onPress={() => navigation.navigate('AddressForm')} /> : null}>
      {me.isLoading ? <Loading /> : me.error ? <ErrorState error={me.error} onRetry={me.refetch} /> : (
        <FlatList
          data={list}
          keyExtractor={(a) => String(a.id)}
          contentContainerClassName="pt-2"
          renderItem={({ item: a }) => (
            <View className="mx-4 mt-2 overflow-hidden rounded-lg border border-line bg-surface">
              <ListItem icon={MapPin} title={a.label || 'Address'} subtitle={[a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')} right={a.isDefault ? <Pill label="Default" tone="info" /> : null} last onPress={() => navigation.navigate('AddressForm', { id: String(a.id), address: a })} />
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={MapPin} title="No saved addresses" message="Save home or office to get cars delivered faster." />}
        />
      )}
    </Screen>
  );
}

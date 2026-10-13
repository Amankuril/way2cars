import { View, FlatList } from '@/mobile/rn';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@/mobile/nav';
import { useCallback } from 'react';
import { MapPin, Plus, Home, Briefcase } from 'lucide-react';
import { Screen, Header, Button, ErrorState, EmptyState, Pill, ListItem, Card, FadeInView, SkeletonRow } from '@/mobile/ui';
import { api } from '../../api';

const LABEL_ICON = { Home: [Home, 'brand'], Work: [Briefcase, 'accent'] };

export function AddressesScreen({ navigation }) {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/api/v1/user/me') });
  useFocusEffect(useCallback(() => { me.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const list = me.data?.addresses || [];
  return (
    <Screen scroll={false} header={<Header title="Saved addresses" />} footer={list.length < 10 ? <Button title="Add address" icon={Plus} block size="lg" onPress={() => navigation.navigate('AddressForm')} /> : null}>
      {me.isLoading ? (
        <View className="pt-3">{[0, 1].map((i) => <Card key={i} className="mx-4 mb-3 py-1"><SkeletonRow /></Card>)}</View>
      ) : me.error ? <ErrorState error={me.error} onRetry={me.refetch} /> : (
        <FlatList
          data={list}
          keyExtractor={(a) => String(a.id)}
          contentContainerClassName="pb-8 pt-3"
          renderItem={({ item: a, index }) => {
            const [icon, tone] = LABEL_ICON[a.label] || [MapPin, 'warning'];
            return (
              <FadeInView index={index} className="mx-4 mb-3">
                <Card>
                  <View className="overflow-hidden rounded-2xl">
                    <ListItem icon={icon} iconTone={tone} title={a.label || 'Address'} subtitle={[a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')} right={a.isDefault ? <View><Pill label="Default" tone="info" /></View> : null} last onPress={() => navigation.navigate('AddressForm', { id: String(a.id), address: a })} />
                  </View>
                </Card>
              </FadeInView>
            );
          }}
          ListEmptyComponent={<EmptyState icon={MapPin} title="No saved addresses" message="Save home or office to get cars delivered faster." />}
        />
      )}
    </Screen>
  );
}

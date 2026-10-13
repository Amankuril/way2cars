import { View, FlatList, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Clipboard from '@react-native-clipboard/clipboard';
import { TicketPercent, Copy } from 'lucide-react-native';
import { Screen, Header, T, Loading, ErrorState, EmptyState, useToast } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money, dateLong, percent } from '@shared/lib/format';
import { api } from '../../api';
import { useTripPlan } from '../../hooks/useTripPlan';

export function OffersScreen() {
  const plan = useTripPlan();
  const toast = useToast();
  const offers = useQuery({ queryKey: ['offers', plan.city?.id], queryFn: () => api.get('/api/v1/user/offers', { cityId: plan.city?.id }) });
  return (
    <Screen scroll={false} header={<Header title="Offers" />}>
      {offers.isLoading ? <Loading /> : offers.error ? <ErrorState error={offers.error} onRetry={offers.refetch} /> : (
        <FlatList
          data={offers.data}
          keyExtractor={(o) => o.id}
          contentContainerClassName="p-4"
          ListEmptyComponent={<EmptyState icon={TicketPercent} title="No offers right now" message="Check back soon — new deals are added regularly." />}
          renderItem={({ item: o }) => (
            <View className="mb-3 rounded-lg border border-line bg-surface">
              <View className="p-4">
                <T variant="headline">{o.title}</T>
                {o.description ? <T variant="bodySm" tone="muted" className="mt-1">{o.description}</T> : null}
                <T variant="caption" tone="subtle" className="mt-2">
                  {o.type === 'percent' ? `${percent(o.valueBps)} off${o.maxDiscountPaise ? ` up to ${money(o.maxDiscountPaise)}` : ''}` : `${money(o.valuePaise)} off`}
                  {o.minRentalPaise ? ` · on trips above ${money(o.minRentalPaise)}` : ''}{o.firstBookingOnly ? ' · first booking only' : ''} · valid till {dateLong(o.endsAt)}
                </T>
              </View>
              <Pressable onPress={() => { Clipboard.setString(o.code); toast(`Code ${o.code} copied`); }} className="flex-row items-center justify-between border-t border-dashed border-ink-200 px-4 py-3 active:bg-ink-50">
                <T variant="label" className="tracking-widest text-brand-700">{o.code}</T>
                <View className="flex-row items-center"><Copy size={14} color={colors.brand[600]} /><T variant="label" tone="brand" className="ml-1">Copy</T></View>
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

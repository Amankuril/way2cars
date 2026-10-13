import { View, FlatList } from '@/mobile/rn';
import { useQuery } from '@tanstack/react-query';
import { Clipboard } from '@/mobile/rn';
import { TicketPercent, Sparkles } from 'lucide-react';
import { Screen, Header, T, ErrorState, EmptyState, TicketCard, FadeInView, GradientHero, SkeletonCard, useToast } from '@/mobile/ui';
import { api } from '../../api';
import { useTripPlan } from '../../hooks/useTripPlan';
import { offerValue, offerTerms } from '../../components/offers';

export function OffersScreen() {
  const plan = useTripPlan();
  const toast = useToast();
  const offers = useQuery({ queryKey: ['offers', plan.city?.id], queryFn: () => api.get('/api/v1/user/offers', { cityId: plan.city?.id }) });
  const copy = (code) => { Clipboard.setString(code); toast(`Code ${code} copied`, 'success'); };
  return (
    <Screen scroll={false} header={<Header title="Offers" />}>
      {offers.isLoading ? (
        <View className="pt-4">{[1, 2, 3].map((i) => <SkeletonCard key={i} height={180} className="mb-4" />)}</View>
      ) : offers.error ? <ErrorState error={offers.error} onRetry={offers.refetch} /> : (
        <FlatList
          data={offers.data}
          keyExtractor={(o) => o.id}
          contentContainerClassName="pb-10"
          ListHeaderComponent={offers.data?.length ? (
            <GradientHero className="mb-5 px-5 pb-6 pt-5">
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-white/15"><Sparkles size={22} color="#fff" /></View>
                <View className="ml-3 flex-1">
                  <T variant="headline" tone="inverse">{offers.data.length} {offers.data.length === 1 ? 'offer' : 'offers'} for you{plan.city ? ` in ${plan.city.name}` : ''}</T>
                  <T variant="caption" className="mt-0.5 text-white/75">Copy a code and apply it at checkout.</T>
                </View>
              </View>
            </GradientHero>
          ) : null}
          ListEmptyComponent={<EmptyState icon={TicketPercent} title="No offers right now" message="Check back soon — new deals are added regularly." />}
          renderItem={({ item: o, index }) => (
            <FadeInView index={index} className="mx-4 mb-4">
              <TicketCard value={offerValue(o)} code={o.code} title={o.title} description={o.description} meta={offerTerms(o)} onCopy={copy} testID={`offer-${o.code}`} />
            </FadeInView>
          )}
        />
      )}
    </Screen>
  );
}

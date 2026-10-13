import { useState } from 'react';
import { View, ScrollView, Image, Pressable, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Bell, ChevronDown, Search, Navigation, TicketPercent, ShieldCheck, ArrowRight } from 'lucide-react-native';
import { Screen, T, Button, Section, Notice, Skeleton, IconButton, Pill } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { dayLabel, timeLabel, duration, money } from '@shared/lib/format';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';
import { useCategories, usePublicConfig, useUnreadCount } from '../../hooks/queries';
import { TripTimesSheet } from '../../components/TripTimesSheet';
import { VehicleCard } from '../../components/VehicleCard';
import { currentPosition } from '../../services/location';

export function HomeScreen({ navigation }) {
  const { account } = useAuth();
  const plan = useTripPlan();
  const [timesOpen, setTimesOpen] = useState(false);
  const config = usePublicConfig();
  const categories = useCategories();
  const unread = useUnreadCount();
  const cityId = plan.city?.id;

  const banners = useQuery({ queryKey: ['banners', cityId], queryFn: () => api.get('/api/v1/public/banners', { cityId }), enabled: !!cityId });
  const featured = useQuery({ queryKey: ['featured', cityId], queryFn: () => api.get('/api/v1/public/vehicles/featured', { cityId }), enabled: !!cityId });
  const offers = useQuery({ queryKey: ['offers', cityId], queryFn: () => api.get('/api/v1/user/offers', { cityId }) });

  const search = (extra = {}) => {
    if (!plan.city) return navigation.navigate('CitySelect');
    navigation.navigate('Search', extra);
  };
  const nearMe = async () => {
    const pos = await currentPosition();
    search(pos ? { near: pos, sort: 'distance' } : {});
  };
  const firstName = account?.name?.split(' ')[0];
  const kyc = account?.kyc?.status;

  return (
    <Screen edges={['top']} refreshing={featured.isRefetching} onRefresh={() => { featured.refetch(); banners.refetch(); offers.refetch(); }}>
      <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
        <View>
          <T variant="caption" tone="subtle">{firstName ? `Hi ${firstName}` : 'Welcome'}</T>
          <Pressable onPress={() => navigation.navigate('CitySelect')} className="flex-row items-center" accessibilityRole="button" accessibilityLabel="Change city">
            <MapPin size={16} color={colors.brand[600]} />
            <T variant="headline" className="ml-1">{plan.city?.name || 'Choose city'}</T>
            <ChevronDown size={16} color={colors.ink[600]} style={{ marginLeft: 2 }} />
          </Pressable>
        </View>
        <View>
          <IconButton icon={Bell} label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          {unread.data ? <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-danger-500" /> : null}
        </View>
      </View>

      {/* Search panel */}
      <View className="mx-4 mt-3 rounded-lg border border-line bg-surface p-4">
        <Pressable onPress={() => setTimesOpen(true)} className="flex-row" accessibilityRole="button" accessibilityLabel="Change trip times">
          <View className="flex-1">
            <T variant="overline" tone="subtle">Pickup</T>
            <T variant="body" className="mt-1 font-bold">{dayLabel(plan.startAt)}</T>
            <T variant="bodySm" tone="muted">{timeLabel(plan.startAt)}</T>
          </View>
          <View className="items-center justify-center px-2">
            <View className="rounded-full bg-brand-50 px-2.5 py-1"><T variant="caption" className="font-semibold text-brand-700">{duration(plan.startAt, plan.endAt)}</T></View>
          </View>
          <View className="flex-1 items-end">
            <T variant="overline" tone="subtle">Return</T>
            <T variant="body" className="mt-1 font-bold">{dayLabel(plan.endAt)}</T>
            <T variant="bodySm" tone="muted">{timeLabel(plan.endAt)}</T>
          </View>
        </Pressable>
        <Button title="Find cars" icon={Search} size="lg" block className="mt-4" onPress={() => search()} testID="find-cars" />
        <Pressable onPress={nearMe} className="mt-3 flex-row items-center justify-center py-1" accessibilityRole="button">
          <Navigation size={14} color={colors.brand[600]} />
          <T variant="label" tone="brand" className="ml-1.5">Cars near my location</T>
        </Pressable>
      </View>

      {kyc && kyc !== 'approved' ? (
        <View className="mx-4 mt-4">
          <Notice
            tone={kyc === 'rejected' ? 'danger' : kyc === 'pending' ? 'info' : 'warning'}
            title={kyc === 'pending' ? 'Verification in progress' : kyc === 'rejected' ? 'Verification needs attention' : 'Verify your driving licence'}
            action={kyc !== 'pending' ? <Button title={kyc === 'rejected' ? 'Fix documents' : 'Verify now'} size="sm" variant="tonal" icon={ShieldCheck} onPress={() => navigation.navigate('Kyc')} /> : null}
          >
            {kyc === 'pending' ? 'We’re checking your documents. You can browse cars meanwhile.' : kyc === 'rejected' ? account.kyc.rejectionReason || 'Please re-upload clear photos.' : 'A quick one-time check before your first trip. Takes about 2 minutes.'}
          </Notice>
        </View>
      ) : null}

      {banners.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-5" contentContainerClassName="px-4" snapToInterval={312} decelerationRate="fast">
          {banners.data.map((b) => (
            <Pressable key={b.id} onPress={() => (b.link?.startsWith('/search') ? search() : b.couponCode ? navigation.navigate('Offers') : null)} className="mr-3 w-[300px] overflow-hidden rounded-lg bg-ink-100">
              <Image source={{ uri: b.imageUrl }} style={{ width: 300, height: 140 }} resizeMode="cover" accessibilityLabel={b.title} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Section title="Browse by type">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4">
          {(categories.data || []).map((c) => (
            <Pressable key={c.id} onPress={() => search({ categoryIds: [c.id], title: c.name })} className="mr-3 w-28 rounded-md border border-line bg-surface p-3 active:bg-ink-50" accessibilityRole="button">
              {c.imageUrl ? <Image source={{ uri: c.imageUrl }} style={{ width: 80, height: 40 }} resizeMode="contain" /> : <View className="h-10" />}
              <T variant="label" className="mt-2">{c.name}</T>
            </Pressable>
          ))}
          {categories.isLoading ? [1, 2, 3].map((i) => <Skeleton key={i} className="mr-3 h-24 w-28" />) : null}
        </ScrollView>
      </Section>

      {cityId ? (
        <Section title="Featured in your city" action={<Pressable onPress={() => search()}><T variant="label" tone="brand">See all</T></Pressable>}>
          {featured.isLoading ? (
            <View className="flex-row px-4"><Skeleton className="mr-3 h-56 w-64" /><Skeleton className="h-56 w-64" /></View>
          ) : featured.data?.length ? (
            <FlatList horizontal data={featured.data} keyExtractor={(v) => v.id} showsHorizontalScrollIndicator={false} contentContainerClassName="px-4" ItemSeparatorComponent={() => <View className="w-3" />} renderItem={({ item }) => <VehicleCard compact vehicle={item} onPress={() => navigation.navigate('Vehicle', { id: item.id })} />} />
          ) : (
            <T variant="bodySm" tone="subtle" className="px-4">No featured cars yet — search to see everything available.</T>
          )}
        </Section>
      ) : null}

      {offers.data?.length ? (
        <Section title="Offers for you" action={<Pressable onPress={() => navigation.navigate('Offers')}><T variant="label" tone="brand">All offers</T></Pressable>}>
          {offers.data.slice(0, 2).map((o) => (
            <Pressable key={o.id} onPress={() => navigation.navigate('Offers')} className="mx-4 mb-2.5 flex-row items-center rounded-md border border-dashed border-brand-300 bg-brand-50 p-3.5">
              <TicketPercent size={22} color={colors.brand[600]} />
              <View className="ml-3 flex-1">
                <T variant="label">{o.title}</T>
                <T variant="caption" tone="muted">Use code <T variant="caption" className="font-bold text-brand-700">{o.code}</T>{o.minRentalPaise ? ` · min ${money(o.minRentalPaise)}` : ''}</T>
              </View>
              <ArrowRight size={16} color={colors.brand[600]} />
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section title="Why WAY2CARS">
        <View className="mx-4 rounded-lg border border-line bg-surface">
          {[
            ['Verified hosts and cars', 'Every car’s RC, insurance and PUC is checked before it goes live.'],
            ['Transparent pricing', 'Taxes, deposit and free kilometres are shown before you pay.'],
            ['24×7 roadside help', 'One tap from your active trip connects you to our team.'],
          ].map(([t, d], i) => (
            <View key={t} className={`p-4 ${i < 2 ? 'border-b border-line' : ''}`}>
              <T variant="label">{t}</T>
              <T variant="caption" tone="muted" className="mt-0.5">{d}</T>
            </View>
          ))}
        </View>
        {config.data?.support?.phone ? <Pill label={`Support: ${config.data.support.phone}`} tone="neutral" className="mx-4 mt-3" /> : null}
      </Section>

      <TripTimesSheet
        visible={timesOpen}
        onClose={() => setTimesOpen(false)}
        startAt={plan.startAt}
        endAt={plan.endAt}
        minLeadMinutes={config.data?.booking?.minLeadMinutes ?? 60}
        minHours={config.data?.booking?.minDurationHours ?? 4}
        onApply={plan.setTimes}
      />
    </Screen>
  );
}

import { useCallback, useState } from 'react';
import { View, ScrollView, Image, Pressable, RefreshControl, StatusBar, Linking, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Clipboard from '@react-native-clipboard/clipboard';
import { MapPin, Bell, ChevronDown, Search, Navigation, ShieldCheck, ReceiptText, Truck, LifeBuoy, Phone, Headset, MessageCircle, CalendarDays, Undo2, CarFront } from 'lucide-react-native';
import { T, Button, Notice, IconButton, Avatar, GradientHero, GradientFill, Card, SectionHeader, IconTile, TicketCard, Carousel, StickyScrollView, FadeInView, PressableScale, Accordion, FAB, Skeleton, SkeletonVehicleCard, TripRoute, useToast } from '@shared/native';
import { colors, gradients, shadows } from '@shared/theme/tokens';
import { dayLabel, timeLabel, duration } from '@shared/lib/format';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';
import { useCategories, usePublicConfig, useUnreadCount } from '../../hooks/queries';
import { TripTimesSheet } from '../../components/TripTimesSheet';
import { VehicleCard } from '../../components/VehicleCard';
import { offerValue, offerTerms } from '../../components/offers';
import { currentPosition } from '@shared/native/app/location';

const HERO_TOP = gradients.hero[0];
const STICKY_AT = 236; // px scrolled before the compact "Where to?" bar slides in

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Full refund window from the platform's cancellation tiers (settings), if there is one. */
function fullRefundHours(tiers = []) {
  const full = tiers.filter((t) => t.refundBps === 10000).sort((a, b) => a.minHoursBeforeStart - b.minHoursBeforeStart)[0];
  return full ? full.minHoursBeforeStart : null;
}

export function HomeScreen({ navigation }) {
  const { account } = useAuth();
  const plan = useTripPlan();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [timesOpen, setTimesOpen] = useState(false);
  const config = usePublicConfig();
  const categories = useCategories();
  const unread = useUnreadCount();
  const cityId = plan.city?.id;

  const banners = useQuery({ queryKey: ['banners', cityId], queryFn: () => api.get('/api/v1/public/banners', { cityId }), enabled: !!cityId });
  const featured = useQuery({ queryKey: ['featured', cityId], queryFn: () => api.get('/api/v1/public/vehicles/featured', { cityId }), enabled: !!cityId });
  const offers = useQuery({ queryKey: ['offers', cityId], queryFn: () => api.get('/api/v1/user/offers', { cityId }) });
  const faqs = useQuery({ queryKey: ['faqs', 'user'], queryFn: () => api.get('/api/v1/public/faqs', { audience: 'user' }), staleTime: 60 * 60_000 });

  // Light status bar over the navy hero while this tab is focused.
  useFocusEffect(useCallback(() => {
    const entry = StatusBar.pushStackEntry({ barStyle: 'light-content', backgroundColor: HERO_TOP });
    return () => StatusBar.popStackEntry(entry);
  }, []));

  const search = (extra = {}) => {
    if (!plan.city) return navigation.navigate('CitySelect');
    navigation.navigate('Search', extra);
  };
  const nearMe = async () => {
    const pos = await currentPosition();
    search(pos ? { near: pos, sort: 'distance' } : {});
  };
  const refresh = () => { featured.refetch(); banners.refetch(); offers.refetch(); };
  const firstName = account?.name?.split(' ')[0];
  const kyc = account?.kyc?.status;
  const support = config.data?.support || {};
  const refundHrs = fullRefundHours(config.data?.cancellation?.tiers);
  const tripLabel = duration(plan.startAt, plan.endAt);

  const sticky = (
    <View className="px-4 pb-3 pt-2" style={{ backgroundColor: HERO_TOP, boxShadow: shadows.raised }}>
      <View className="h-14 flex-row items-center rounded-full bg-surface pl-2 pr-1.5" style={{ boxShadow: shadows.card }}>
        <Pressable onPress={() => navigation.navigate('CitySelect')} accessibilityRole="button" accessibilityLabel="Change city" className="h-11 flex-row items-center rounded-full bg-brand-50 px-3">
          <MapPin size={15} color={colors.brand[600]} strokeWidth={2.4} />
          <T variant="label" className="ml-1 max-w-[96px] text-brand-700" numberOfLines={1}>{plan.city?.name || 'City'}</T>
        </Pressable>
        <Pressable onPress={() => setTimesOpen(true)} accessibilityRole="button" accessibilityLabel="Change trip times" className="h-11 flex-1 justify-center px-3">
          <T variant="label" numberOfLines={1}>{dayLabel(plan.startAt)} → {dayLabel(plan.endAt)}</T>
          <T variant="caption" tone="subtle" numberOfLines={1}>{tripLabel}</T>
        </Pressable>
        <PressableScale onPress={() => search()} accessibilityRole="button" accessibilityLabel="Find cars" className="h-11 w-11 items-center justify-center overflow-hidden rounded-full">
          <GradientFill stops={gradients.brand} />
          <Search size={19} color="#fff" strokeWidth={2.6} />
        </PressableScale>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: HERO_TOP }}>
      <View className="flex-1 bg-canvas">
        <StickyScrollView
          threshold={STICKY_AT}
          sticky={sticky}
          contentContainerClassName="pb-28"
          refreshControl={<RefreshControl refreshing={featured.isRefetching} onRefresh={refresh} colors={[colors.brand[500]]} progressViewOffset={8} />}
          testID="home-scroll"
        >
          {/* ------------------------------------------------ hero */}
          <GradientHero angle="vertical" className="px-4 pb-24 pt-3">
            <View className="flex-row items-center">
              <View className="rounded-full border-2 border-white/40"><Avatar name={account?.name} size={44} /></View>
              <View className="ml-3 flex-1">
                <T variant="caption" className="text-white/75">{greeting()}{firstName ? `, ${firstName}` : ''}</T>
                <T variant="title" tone="inverse" numberOfLines={1}>Where to next?</T>
              </View>
              <View>
                <IconButton icon={Bell} tone="inverse" label="Notifications" onPress={() => navigation.navigate('Notifications')} className="bg-white/15 active:bg-white/25" />
                {unread.data ? <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-brand-700 bg-danger-500" /> : null}
              </View>
            </View>
            <PressableScale onPress={() => navigation.navigate('CitySelect')} containerStyle={{ alignSelf: 'flex-start', marginTop: 16 }} className="h-11 flex-row items-center px-3.5" style={{ borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)' }} accessibilityRole="button" accessibilityLabel="Change city">
              <MapPin size={16} color="#fff" strokeWidth={2.4} />
              <T variant="label" tone="inverse" className="ml-1.5">{plan.city?.name || 'Choose your city'}</T>
              <ChevronDown size={16} color="#fff" style={{ marginLeft: 4 }} />
            </PressableScale>
          </GradientHero>

          {/* ------------------------------------------------ search card (overlaps the hero) */}
          <FadeInView className="mx-4" style={{ marginTop: -72 }}>
            <Card className="p-4" style={{ boxShadow: shadows.raised }}>
              <View className="mb-3 flex-row items-center">
                <CalendarDays size={16} color={colors.brand[600]} />
                <T variant="label" className="ml-2 flex-1">Your trip</T>
                <Pressable onPress={() => setTimesOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit trip times" className="min-h-[36px] justify-center px-1">
                  <T variant="label" tone="brand">Edit</T>
                </Pressable>
              </View>
              <PressableScale onPress={() => setTimesOpen(true)} accessibilityRole="button" accessibilityLabel="Change trip times" className="rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-3">
                <TripRoute
                  start={{ overline: 'Pickup', title: dayLabel(plan.startAt), subtitle: timeLabel(plan.startAt) }}
                  end={{ overline: 'Return', title: dayLabel(plan.endAt), subtitle: timeLabel(plan.endAt) }}
                  label={tripLabel}
                />
              </PressableScale>
              <Button title="Find cars" icon={Search} size="lg" block className="mt-4" onPress={() => search()} testID="find-cars" />
              <Pressable onPress={nearMe} className="mt-2 min-h-[44px] flex-row items-center justify-center" accessibilityRole="button">
                <Navigation size={14} color={colors.brand[600]} />
                <T variant="label" tone="brand" className="ml-1.5">Cars near my location</T>
              </Pressable>
            </Card>
          </FadeInView>

          {kyc && kyc !== 'approved' ? (
            <FadeInView index={1} className="mx-4 mt-4">
              <Notice
                tone={kyc === 'rejected' ? 'danger' : kyc === 'pending' ? 'info' : 'warning'}
                title={kyc === 'pending' ? 'Verification in progress' : kyc === 'rejected' ? 'Verification needs attention' : 'Verify your driving licence'}
                action={kyc !== 'pending' ? <Button title={kyc === 'rejected' ? 'Fix documents' : 'Verify now'} size="sm" variant="tonal" icon={ShieldCheck} onPress={() => navigation.navigate('Kyc')} /> : null}
              >
                {kyc === 'pending' ? 'We’re checking your documents. You can browse cars meanwhile.' : kyc === 'rejected' ? account.kyc.rejectionReason || 'Please re-upload clear photos.' : 'A quick one-time check before your first trip. Takes about 2 minutes.'}
              </Notice>
            </FadeInView>
          ) : null}

          {/* ------------------------------------------------ banners */}
          {banners.data?.length ? (
            <Carousel
              className="mt-6"
              data={banners.data}
              itemWidth={width - 32}
              autoPlay={4500}
              testID="banner-carousel"
              renderItem={({ item: b }) => (
                <PressableScale onPress={() => (b.link?.startsWith('/search') ? search() : b.couponCode ? navigation.navigate('Offers') : null)} accessibilityRole="button" accessibilityLabel={b.title} className="overflow-hidden rounded-2xl bg-ink-100" style={{ boxShadow: shadows.card }}>
                  <Image source={{ uri: b.imageUrl }} style={{ width: width - 32, height: Math.round((width - 32) * 0.42) }} resizeMode="cover" accessibilityLabel={b.title} />
                </PressableScale>
              )}
            />
          ) : null}

          {/* ------------------------------------------------ coupons */}
          {offers.data?.length ? (
            <View className="mt-7">
              <SectionHeader eyebrow="Save on your trip" title="Coupons for you" actionLabel="All offers" onAction={() => navigation.navigate('Offers')} />
              <Carousel
                data={offers.data.slice(0, 6)}
                itemWidth={Math.min(296, width - 64)}
                dots={offers.data.length > 1}
                renderItem={({ item: o }) => (
                  <TicketCard value={offerValue(o)} code={o.code} title={o.title} meta={offerTerms(o)} onCopy={(code) => { Clipboard.setString(code); toast(`Code ${code} copied`, 'success'); }} />
                )}
              />
            </View>
          ) : null}

          {/* ------------------------------------------------ categories */}
          {categories.isLoading || categories.data?.length ? (
            <View className="mt-7">
              <SectionHeader title="Browse by type" subtitle="Pick the shape of your trip" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 pb-2">
                {(categories.data || []).map((c, i) => (
                  <FadeInView key={c.id} index={i} from="none">
                    <PressableScale onPress={() => search({ categoryIds: [c.id], title: c.name })} accessibilityRole="button" accessibilityLabel={`Browse ${c.name}`} className="mr-3 w-[124px] items-center rounded-2xl bg-surface px-3 pb-3 pt-4" style={{ boxShadow: shadows.card }}>
                      <View className="h-12 w-full items-center justify-center">
                        {c.imageUrl ? <Image source={{ uri: c.imageUrl }} style={{ width: 92, height: 46 }} resizeMode="contain" /> : <IconTile icon={CarFront} tone="brand" size={40} />}
                      </View>
                      <T variant="label" className="mt-2" numberOfLines={1}>{c.name}</T>
                    </PressableScale>
                  </FadeInView>
                ))}
                {categories.isLoading ? [1, 2, 3].map((i) => <Skeleton key={i} className="mr-3 h-[104px] w-[124px] rounded-2xl" />) : null}
              </ScrollView>
            </View>
          ) : null}

          {/* ------------------------------------------------ featured cars */}
          {cityId ? (
            <View className="mt-6">
              <SectionHeader eyebrow={`Top picks in ${plan.city.name}`} title="Featured cars" onAction={() => search()} />
              {featured.isLoading ? (
                <View className="flex-row px-4"><SkeletonVehicleCard compact className="mr-3" /><SkeletonVehicleCard compact /></View>
              ) : featured.data?.length ? (
                <Carousel
                  data={featured.data}
                  itemWidth={256}
                  dots={featured.data.length > 1}
                  testID="featured-carousel"
                  renderItem={({ item, index: i }) => (
                    <FadeInView index={i} className="pb-3 pt-1">
                      <VehicleCard compact vehicle={item} onPress={() => navigation.navigate('Vehicle', { id: item.id })} />
                    </FadeInView>
                  )}
                />
              ) : (
                <Card className="mx-4 flex-row items-center p-4">
                  <IconTile icon={Search} tone="brand" />
                  <T variant="bodySm" tone="muted" className="ml-3 flex-1">No featured cars yet — search to see everything available.</T>
                </Card>
              )}
            </View>
          ) : null}

          {/* ------------------------------------------------ why us (claims backed by product features/settings) */}
          <View className="mt-7">
            <SectionHeader eyebrow="Drive with confidence" title="Why WAY2CARS" />
            <View className="flex-row flex-wrap px-3">
              {[
                { icon: ShieldCheck, tone: 'brand', t: 'Verified hosts & cars', d: 'Every car’s RC, insurance and PUC is checked before it goes live.' },
                { icon: ReceiptText, tone: 'accent', t: 'Transparent pricing', d: 'Taxes, deposit and free kilometres shown before you pay.' },
                { icon: Truck, tone: 'success', t: 'Doorstep delivery', d: 'On cars that offer it — add your address at checkout.' },
                refundHrs !== null
                  ? { icon: Undo2, tone: 'warning', t: 'Flexible cancellation', d: refundHrs > 0 ? `Full refund up to ${refundHrs} hrs before pickup.` : 'Full refund on cancellation before pickup.' }
                  : { icon: LifeBuoy, tone: 'warning', t: '24×7 roadside help', d: 'One tap from your active trip connects you to our team.' },
              ].map((x, i) => (
                <View key={x.t} className="w-1/2 p-1">
                  <FadeInView index={i} className="flex-1" style={{ flex: 1 }}>
                    <Card className="flex-1 p-4">
                      <IconTile icon={x.icon} tone={x.tone} size={40} />
                      <T variant="label" className="mt-3">{x.t}</T>
                      <T variant="caption" tone="muted" className="mt-1">{x.d}</T>
                    </Card>
                  </FadeInView>
                </View>
              ))}
            </View>
          </View>

          {/* ------------------------------------------------ assistance */}
          <View className="mx-4 mt-7 overflow-hidden rounded-3xl" style={{ boxShadow: shadows.float }}>
            <GradientFill stops={gradients.deep} />
            <View className="flex-row items-center p-5">
              <View className="mr-4 flex-1">
                <T variant="overline" className="text-accent-200" style={{ color: colors.accent[200] }}>We’re here {support.hours || '24×7'}</T>
                <T variant="headline" tone="inverse" className="mt-1">Need a hand with a booking?</T>
                <T variant="caption" className="mt-1 text-white/75">Chat with us, raise a ticket or get roadside help during a trip.</T>
                <Button title="Contact us" variant="secondary" size="sm" icon={MessageCircle} className="mt-4 self-start border-0" onPress={() => navigation.navigate('Help')} testID="home-contact" />
              </View>
              <View className="h-24 w-24 items-center justify-center rounded-full bg-white/10">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-white/15"><Headset size={30} color="#fff" strokeWidth={1.8} /></View>
                <View className="absolute right-0 top-1 rounded-full bg-accent-500 p-1.5"><MessageCircle size={12} color="#fff" strokeWidth={2.4} /></View>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------ FAQs */}
          {faqs.data?.length ? (
            <View className="mt-7">
              <SectionHeader title="FAQs" subtitle="Quick answers before you book" actionLabel="View all" onAction={() => navigation.navigate('Faq')} />
              <Accordion items={faqs.data.slice(0, 4).map((f) => ({ id: f.id, title: f.question, content: f.answer }))} />
            </View>
          ) : null}

          <View className="mt-8 items-center">
            <T variant="overline" tone="subtle">WAY2CARS · Self-drive cars</T>
          </View>
        </StickyScrollView>

        {support.phone ? <FAB icon={Phone} label={`Call support ${support.phone}`} onPress={() => Linking.openURL(`tel:${support.phone}`)} testID="call-support" /> : null}
      </View>

      <TripTimesSheet
        visible={timesOpen}
        onClose={() => setTimesOpen(false)}
        startAt={plan.startAt}
        endAt={plan.endAt}
        minLeadMinutes={config.data?.booking?.minLeadMinutes ?? 60}
        minHours={config.data?.booking?.minDurationHours ?? 4}
        onApply={plan.setTimes}
      />
    </SafeAreaView>
  );
}

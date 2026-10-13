import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { Users, Cog, Fuel, Briefcase, CalendarDays, ShieldCheck, Gauge, Zap, Truck, Check, Star, BadgeCheck, MapPin, ArrowLeft, Route, MessageSquareQuote } from 'lucide-react-native';
import { Screen, Header, T, Button, KeyValue, ErrorState, Notice, Avatar, IconButton, StickyScrollView, Parallax, Card, SectionHeader, IconTile, DashedDivider, TripRoute, FadeInView, AnimatedNumber, Skeleton, PressableScale, cn } from '@shared/native';
import { colors, shadows } from '@shared/theme/tokens';
import { money, dayLabel, timeLabel, duration, dateLong, percent } from '@shared/lib/format';
import { FUEL, TRANSMISSION, FEATURES, INSURANCE } from '@shared/lib/labels';
import { api } from '../../api';
import { ENV } from '../../env';
import { useTripPlan } from '../../hooks/useTripPlan';
import { usePublicConfig } from '../../hooks/queries';
import { Gallery } from '../../components/Gallery';
import { TripTimesSheet } from '../../components/TripTimesSheet';

const GALLERY_H = 300;

const Spec = ({ icon: Icon, label, value }) => (
  <View className="w-1/3 p-1">
    <View className="items-start rounded-2xl border border-ink-100 bg-ink-50 p-3">
      <IconTile icon={Icon} size={34} />
      <T variant="caption" tone="subtle" className="mt-2">{label}</T>
      <T variant="label" numberOfLines={1}>{value}</T>
    </View>
  </View>
);

const Block = ({ title, eyebrow, children, className }) => (
  <View className={cn('mt-7', className)}>
    <SectionHeader title={title} eyebrow={eyebrow} />
    {children}
  </View>
);

const BackButton = ({ onPress }) => (
  <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel="Go back" className="h-11 w-11 items-center justify-center rounded-full bg-white/95" style={{ boxShadow: shadows.card }}>
    <ArrowLeft size={22} color={colors.ink[900]} />
  </PressableScale>
);

function VehicleSkeleton() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <Skeleton className="rounded-none" style={{ height: GALLERY_H }} />
      <View className="px-4 pt-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-3 h-7 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
        <Skeleton className="mt-6 h-24 w-full rounded-2xl" />
        <View className="mt-6 flex-row"><Skeleton className="mr-2 h-20 flex-1 rounded-2xl" /><Skeleton className="mr-2 h-20 flex-1 rounded-2xl" /><Skeleton className="h-20 flex-1 rounded-2xl" /></View>
      </View>
    </SafeAreaView>
  );
}


export function VehicleScreen({ route, navigation }) {
  const { id } = route.params;
  const plan = useTripPlan();
  const config = usePublicConfig();
  const [timesOpen, setTimesOpen] = useState(false);
  const q = useQuery({
    queryKey: ['vehicle', id, plan.startAt.toISOString(), plan.endAt.toISOString()],
    queryFn: () => api.get(`/api/v1/public/vehicles/${id}`, { startAt: plan.startAt.toISOString(), endAt: plan.endAt.toISOString() }),
  });

  if (q.isLoading) return <VehicleSkeleton />;
  if (q.error) return <Screen header={<Header title="" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const v = q.data;
  const available = v.availability?.available;
  const est = v.estimate;
  const rated = v.rating?.count > 0;
  const tiers = (v.policies?.cancellation?.tiers || []).slice().sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);

  const sticky = (
    <View className="h-14 flex-row items-center border-b border-line bg-surface px-1" style={{ boxShadow: shadows.card }}>
      <IconButton icon={ArrowLeft} label="Go back" onPress={() => navigation.goBack()} />
      <View className="ml-1 flex-1">
        <T variant="headline" numberOfLines={1}>{v.title}</T>
        <T variant="caption" tone="subtle" numberOfLines={1}>{v.year} · {v.city?.name}</T>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <StickyScrollView threshold={GALLERY_H - 40} sticky={sticky} contentContainerClassName="pb-8" testID="vehicle-scroll">
        <Parallax height={GALLERY_H}><Gallery photos={v.photos} height={GALLERY_H} /></Parallax>
        <View className="absolute left-3 top-3"><BackButton onPress={() => navigation.goBack()} /></View>

        <View className="-mt-6 rounded-t-3xl bg-surface pt-5">
          {/* identity */}
          <FadeInView className="px-4">
            <View className="flex-row flex-wrap items-center">
              <View className="mr-2 flex-row items-center rounded-full bg-warning-50 px-2.5 py-1">
                <Star size={13} color={colors.warning[500]} fill={rated ? colors.warning[500] : 'transparent'} />
                <T variant="caption" className="ml-1 font-bold text-ink-800">{rated ? `${Number(v.rating.avg).toFixed(1)} (${v.rating.count})` : 'New'}</T>
              </View>
              <View className="mr-2 flex-row items-center rounded-full bg-ink-100 px-2.5 py-1">
                <Route size={13} color={colors.ink[600]} />
                <T variant="caption" className="ml-1 font-semibold text-ink-700">{v.trips} trips</T>
              </View>
              {v.instantBooking ? (
                <View className="flex-row items-center rounded-full bg-brand-50 px-2.5 py-1"><Zap size={13} color={colors.brand[600]} fill={colors.brand[600]} /><T variant="caption" className="ml-1 font-bold text-brand-700">Instant book</T></View>
              ) : null}
            </View>
            <T variant="title" className="mt-2.5">{v.title}</T>
            <View className="mt-1 flex-row items-center">
              <MapPin size={14} color={colors.ink[500]} />
              <T variant="bodySm" tone="muted" className="ml-1 flex-1">{v.location?.area || v.city?.name}{v.delivery?.enabled ? ' · doorstep delivery available' : ''}</T>
            </View>
          </FadeInView>

          {/* trip times */}
          <FadeInView index={1} className="mx-4 mt-5">
            <Card className="p-4">
              <View className="mb-3 flex-row items-center">
                <CalendarDays size={16} color={colors.brand[600]} />
                <T variant="label" className="ml-2 flex-1">Your trip</T>
                <Pressable onPress={() => setTimesOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change trip times" className="min-h-[36px] justify-center px-1">
                  <T variant="label" tone="brand">Change</T>
                </Pressable>
              </View>
              <TripRoute
                start={{ overline: 'Pickup', title: dayLabel(plan.startAt), subtitle: timeLabel(plan.startAt) }}
                end={{ overline: 'Return', title: dayLabel(plan.endAt), subtitle: timeLabel(plan.endAt) }}
                label={duration(plan.startAt, plan.endAt)}
              />
            </Card>
          </FadeInView>
          {v.availability && !available ? (
            <Notice tone="warning" title="Booked for these times" className="mx-4 mt-3">Try different times — or go back for similar cars.</Notice>
          ) : null}

          <Block title="Specifications">
            <View className="flex-row flex-wrap px-3">
              <Spec icon={Users} label="Seats" value={v.seats} />
              <Spec icon={Cog} label="Transmission" value={TRANSMISSION[v.transmission]} />
              <Spec icon={v.fuelType === 'electric' ? Zap : Fuel} label="Fuel" value={FUEL[v.fuelType]} />
              <Spec icon={Briefcase} label="Luggage" value={`${v.luggageBags} bags`} />
              <Spec icon={CalendarDays} label="Model year" value={v.year} />
              {v.rangeKm ? <Spec icon={Gauge} label="Range" value={`${v.rangeKm} km`} /> : <Spec icon={Gauge} label="Free km / day" value={v.pricing.includedKmPerDay} />}
            </View>
          </Block>

          {v.features?.length ? (
            <Block title="Features">
              <View className="flex-row flex-wrap px-4">
                {v.features.map((f) => (
                  <View key={f} className="mb-3 w-1/2 flex-row items-center pr-2">
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-success-50"><Check size={14} color={colors.success[600]} strokeWidth={2.8} /></View>
                    <T variant="bodySm" className="ml-2 flex-1">{FEATURES[f] || f}</T>
                  </View>
                ))}
              </View>
            </Block>
          ) : null}

          {v.description ? (
            <Block title="About this car"><T variant="body" tone="muted" className="px-4">{v.description}</T></Block>
          ) : null}

          <Block title="Pricing & kilometres">
            <Card className="mx-4 p-4">
              {est?.lines?.map((l, i) => (
                <KeyValue key={i} label={l.kind === 'day' ? `${dayLabel(l.date)} · full day` : `${dayLabel(l.date)} · ${l.hours} hrs${l.capped ? ' (capped at day rate)' : ''}`} hint={l.source === 'weekend' ? 'Weekend rate' : l.source === 'calendar' ? 'Special date rate' : undefined} value={money(l.amountPaise)} />
              ))}
              {est ? <DashedDivider className="my-2.5" /> : null}
              <KeyValue label="Free kilometres" value={est ? `${est.includedKm} km` : `${v.pricing.includedKmPerDay} km / day`} />
              <KeyValue label="Extra kilometres" value={`${money(v.pricing.extraKmChargePaise)} / km`} />
              <KeyValue label="Refundable security deposit" value={money(v.pricing.securityDepositPaise)} />
              <KeyValue label="Hourly / daily rate" value={`${money(v.pricing.hourlyPaise)} · ${money(v.pricing.dailyPaise)}`} />
              {v.pricing.weekendDailyPaise ? <KeyValue label="Weekend daily rate" value={money(v.pricing.weekendDailyPaise)} /> : null}
              <View className="mt-3 rounded-xl bg-ink-50 p-3">
                <T variant="caption" tone="muted">GST of {percent(config.data?.tax?.rentalGstBps ?? 1800)} and a convenience fee apply at checkout. Fuel is not included — return it at the same level.</T>
              </View>
            </Card>
          </Block>

          <Block title="Insurance & protection">
            <Card className="mx-4 flex-row items-start p-4">
              <IconTile icon={ShieldCheck} tone="success" size={40} />
              <View className="ml-3 flex-1">
                <T variant="label">{v.insurance ? `${INSURANCE[v.insurance.type]} insurance` : 'Insured vehicle'}</T>
                <T variant="caption" tone="muted" className="mt-0.5">{v.insurance?.provider ? `Policy by ${v.insurance.provider}. ` : ''}Damage you cause is charged as assessed after the trip, up to the repair cost. Report incidents immediately via roadside assistance.</T>
              </View>
            </Card>
          </Block>

          <Block title="Cancellation policy">
            <Card className="mx-4 p-4">
              {tiers.map((t, i, arr) => {
                const tone = t.refundBps === 10000 ? 'success' : t.refundBps === 0 ? 'danger' : 'warning';
                const label = i === 0 ? `More than ${t.minHoursBeforeStart} hrs before pickup` : t.minHoursBeforeStart === 0 ? `Less than ${arr[i - 1].minHoursBeforeStart} hrs before pickup` : `${t.minHoursBeforeStart}–${arr[i - 1].minHoursBeforeStart} hrs before pickup`;
                return (
                  <View key={i} className="flex-row">
                    <View className="mr-3 items-center">
                      <View className={cn('mt-1 h-3 w-3 rounded-full', tone === 'success' ? 'bg-success-500' : tone === 'danger' ? 'bg-danger-500' : 'bg-warning-500')} />
                      {i < arr.length - 1 ? <View className="w-0.5 flex-1 bg-ink-100" /> : null}
                    </View>
                    <View className={cn('flex-1 flex-row items-start justify-between', i < arr.length - 1 && 'pb-4')}>
                      <T variant="bodySm" tone="muted" className="mr-3 flex-1">{label}</T>
                      <T variant="label" tone={tone}>{t.refundBps === 10000 ? 'Full refund' : t.refundBps === 0 ? 'No refund' : `${percent(t.refundBps)} refund`}</T>
                    </View>
                  </View>
                );
              })}
              <T variant="caption" tone="subtle" className="mt-3">Refund applies to trip charges; the security deposit is always returned in full on cancellation.</T>
            </Card>
          </Block>

          <Block title="Your host">
            <Card className="mx-4 p-4">
              <View className="flex-row items-center">
                <Avatar name={v.host?.name} size={48} />
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center">
                    <T variant="body" className="font-bold">{v.host?.name}</T>
                    <BadgeCheck size={16} color={colors.brand[500]} style={{ marginLeft: 4 }} />
                  </View>
                  <T variant="caption" tone="subtle">Verified host · since {dateLong(v.host?.memberSince)}</T>
                </View>
                {v.host?.rating?.count ? (
                  <View className="items-end">
                    <View className="flex-row items-center"><Star size={14} color={colors.warning[500]} fill={colors.warning[500]} /><T variant="label" className="ml-1">{Number(v.host.rating.avg).toFixed(1)}</T></View>
                    <T variant="caption" tone="subtle">{v.host.rating.count} ratings</T>
                  </View>
                ) : <T variant="caption" tone="subtle">New host</T>}
              </View>
              {v.host?.acceptanceRate !== null && v.host?.acceptanceRate !== undefined ? (
                <View className="mt-3 flex-row items-center rounded-xl bg-ink-50 px-3 py-2.5">
                  <Check size={14} color={colors.success[600]} strokeWidth={2.6} />
                  <T variant="caption" tone="muted" className="ml-2 flex-1">Accepts {v.host.acceptanceRate}% of booking requests{v.instantBooking ? ' · this car confirms instantly' : ''}.</T>
                </View>
              ) : null}
            </Card>
          </Block>

          {ENV.mapsEnabled && v.location?.point ? (
            <Block title="Pickup area">
              <View className="mx-4 overflow-hidden rounded-2xl border border-line">
                <MapView provider={PROVIDER_GOOGLE} liteMode style={{ height: 170 }} initialRegion={{ latitude: v.location.point.lat, longitude: v.location.point.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }} pointerEvents="none">
                  <Circle center={{ latitude: v.location.point.lat, longitude: v.location.point.lng }} radius={900} strokeColor={colors.brand[500]} fillColor="rgba(24,117,185,0.15)" />
                </MapView>
              </View>
              <T variant="caption" tone="subtle" className="mx-4 mt-2">Exact address is shared after your booking is confirmed.{v.delivery?.enabled ? ` Doorstep delivery within ${v.delivery.maxKm} km.` : ''}</T>
            </Block>
          ) : null}

          <Block title="Reviews">
            {rated ? (
              <View className="mx-4 mb-3 flex-row items-center">
                <T variant="display">{Number(v.rating.avg).toFixed(1)}</T>
                <View className="ml-3">
                  <View className="flex-row">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={14} color={colors.warning[500]} fill={s <= Math.round(v.rating.avg) ? colors.warning[500] : 'transparent'} />)}</View>
                  <T variant="caption" tone="subtle" className="mt-0.5">{v.rating.count} {v.rating.count === 1 ? 'rating' : 'ratings'}</T>
                </View>
              </View>
            ) : null}
            {v.reviews?.length ? v.reviews.map((r, i) => (
              <FadeInView key={r.id} index={i} className="mx-4 mb-3">
                <Card className="p-4">
                  <View className="flex-row items-center">
                    <Avatar name={r.author} size={34} />
                    <View className="ml-2.5 flex-1">
                      <T variant="label">{r.author}</T>
                      <View className="mt-0.5 flex-row">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={11} color={colors.warning[500]} fill={s <= r.rating ? colors.warning[500] : 'transparent'} />)}</View>
                    </View>
                    <T variant="caption" tone="subtle">{dateLong(r.createdAt)}</T>
                  </View>
                  {r.comment ? <T variant="bodySm" tone="muted" className="mt-2.5">{r.comment}</T> : null}
                  {r.hostReply ? (
                    <View className="mt-3 flex-row rounded-xl bg-ink-50 p-3">
                      <MessageSquareQuote size={14} color={colors.ink[500]} />
                      <T variant="caption" tone="muted" className="ml-2 flex-1"><T variant="caption" className="font-bold text-ink-700">Host: </T>{r.hostReply}</T>
                    </View>
                  ) : null}
                </Card>
              </FadeInView>
            )) : (
              <Card className="mx-4 flex-row items-center p-4"><IconTile icon={Star} tone="warning" size={36} /><T variant="bodySm" tone="muted" className="ml-3 flex-1">No reviews yet. Be the first to drive it!</T></Card>
            )}
          </Block>

          {v.delivery?.enabled ? (
            <View className="mx-4 mt-5 flex-row items-center"><Truck size={16} color={colors.ink[500]} /><T variant="caption" tone="subtle" className="ml-2 flex-1">Delivery and pickup at your address can be added at checkout.</T></View>
          ) : null}
        </View>
      </StickyScrollView>

      {/* sticky price + CTA */}
      <SafeAreaView edges={['bottom']} className="bg-surface" style={{ boxShadow: shadows.bar }}>
        <View className="flex-row items-center border-t border-line px-4 py-3">
          <View className="mr-3 flex-1">
            {est ? <AnimatedNumber value={money(est.rentalPaise)} className="text-brand-700" /> : null}
            <T variant="caption" tone="subtle" numberOfLines={1}>{est ? `${duration(plan.startAt, plan.endAt)} · excl. taxes & deposit` : 'Choose trip times'}</T>
          </View>
          <Button title={available ? 'Continue' : 'Unavailable'} size="lg" disabled={!available} onPress={() => navigation.navigate('Checkout', { vehicleId: v.id })} testID="continue-booking" className="min-w-[150px]" />
        </View>
      </SafeAreaView>

      <TripTimesSheet visible={timesOpen} onClose={() => setTimesOpen(false)} startAt={plan.startAt} endAt={plan.endAt} minLeadMinutes={config.data?.booking?.minLeadMinutes ?? 60} minHours={config.data?.booking?.minDurationHours ?? 4} onApply={plan.setTimes} />
    </SafeAreaView>
  );
}

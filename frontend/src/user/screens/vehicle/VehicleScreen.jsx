import { useState } from 'react';
import { View, Pressable } from '@/mobile/rn';
import { useQuery } from '@tanstack/react-query';
import MapView, { Circle, PROVIDER_GOOGLE } from '@/mobile/app/maps';
import { Users, Cog, Fuel, Briefcase, CalendarDays, ShieldCheck, Gauge, Zap, Truck, Check, Star, BadgeCheck, MapPin } from 'lucide-react';
import { Screen, Header, T, Button, Section, Panel, Divider, KeyValue, Loading, ErrorState, Notice, Rating, Avatar } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { money, dayLabel, timeLabel, duration, dateLong, percent } from '@shared/lib/format';
import { FUEL, TRANSMISSION, FEATURES, INSURANCE } from '@shared/lib/labels';
import { api } from '../../api';
import { ENV } from '../../env';
import { useTripPlan } from '../../hooks/useTripPlan';
import { usePublicConfig } from '../../hooks/queries';
import { Gallery } from '../../components/Gallery';
import { TripTimesSheet } from '../../components/TripTimesSheet';

const Spec = ({ icon: Icon, label, value }) => (
  <View className="mb-4 w-1/3 items-start">
    <Icon size={18} color={colors.ink[600]} strokeWidth={1.8} />
    <T variant="caption" tone="subtle" className="mt-1.5">{label}</T>
    <T variant="label">{value}</T>
  </View>
);

export function VehicleScreen({ route, navigation }) {
  const { id } = route.params;
  const plan = useTripPlan();
  const config = usePublicConfig();
  const [timesOpen, setTimesOpen] = useState(false);
  const q = useQuery({
    queryKey: ['vehicle', id, plan.startAt.toISOString(), plan.endAt.toISOString()],
    queryFn: () => api.get(`/api/v1/public/vehicles/${id}`, { startAt: plan.startAt.toISOString(), endAt: plan.endAt.toISOString() }),
  });

  if (q.isLoading) return <Screen header={<Header title="" />} scroll={false}><Loading /></Screen>;
  if (q.error) return <Screen header={<Header title="" />} scroll={false}><ErrorState error={q.error} onRetry={q.refetch} /></Screen>;
  const v = q.data;
  const available = v.availability?.available;
  const est = v.estimate;

  return (
    <Screen
      bg="surface"
      header={<Header title={v.title} subtitle={`${v.year} · ${v.city?.name}`} />}
      footer={
        <View className="flex-row items-center">
          <View className="flex-1">
            {est ? <T variant="price">{money(est.rentalPaise)}</T> : null}
            <T variant="caption" tone="subtle">{est ? `${duration(plan.startAt, plan.endAt)} · excl. taxes & deposit` : 'Choose trip times'}</T>
          </View>
          <Button title={available ? 'Continue' : 'Unavailable'} size="lg" disabled={!available} onPress={() => navigation.navigate('Checkout', { vehicleId: v.id })} testID="continue-booking" />
        </View>
      }
    >
      <Gallery photos={v.photos} />

      <View className="px-4 pt-4">
        <View className="flex-row items-center">
          <Rating value={v.rating?.avg} count={v.rating?.count} size="md" />
          <T variant="caption" tone="subtle" className="ml-2">· {v.trips} trips</T>
          {v.instantBooking ? <View className="ml-2 flex-row items-center"><Zap size={13} color={colors.brand[600]} fill={colors.brand[600]} /><T variant="caption" className="ml-1 font-bold text-brand-700">Instant book</T></View> : null}
        </View>
        <T variant="title" className="mt-1.5">{v.title}</T>
        <View className="mt-1 flex-row items-center">
          <MapPin size={13} color={colors.ink[500]} />
          <T variant="bodySm" tone="muted" className="ml-1">{v.location?.area || v.city?.name}{v.delivery?.enabled ? ' · doorstep delivery available' : ''}</T>
        </View>
      </View>

      {/* Trip times */}
      <Pressable onPress={() => setTimesOpen(true)} className="mx-4 mt-4 flex-row items-center rounded-md border border-ink-200 p-3 active:bg-ink-50" accessibilityRole="button" accessibilityLabel="Change trip times">
        <CalendarDays size={18} color={colors.brand[600]} />
        <View className="ml-3 flex-1">
          <T variant="label">{dayLabel(plan.startAt)}, {timeLabel(plan.startAt)} → {dayLabel(plan.endAt)}, {timeLabel(plan.endAt)}</T>
          <T variant="caption" tone="subtle">{duration(plan.startAt, plan.endAt)}</T>
        </View>
        <T variant="label" tone="brand">Change</T>
      </Pressable>
      {v.availability && !available ? (
        <Notice tone="warning" title="Booked for these times" className="mx-4 mt-3">Try different times — or go back for similar cars.</Notice>
      ) : null}

      <Section title="Specifications">
        <View className="flex-row flex-wrap px-4">
          <Spec icon={Users} label="Seats" value={v.seats} />
          <Spec icon={Cog} label="Transmission" value={TRANSMISSION[v.transmission]} />
          <Spec icon={v.fuelType === 'electric' ? Zap : Fuel} label="Fuel" value={FUEL[v.fuelType]} />
          <Spec icon={Briefcase} label="Luggage" value={`${v.luggageBags} bags`} />
          <Spec icon={CalendarDays} label="Model year" value={v.year} />
          {v.rangeKm ? <Spec icon={Gauge} label="Range" value={`${v.rangeKm} km`} /> : <Spec icon={Gauge} label="Free km / day" value={v.pricing.includedKmPerDay} />}
        </View>
      </Section>

      {v.features?.length ? (
        <Section title="Features">
          <View className="flex-row flex-wrap px-4">
            {v.features.map((f) => (
              <View key={f} className="mb-2.5 w-1/2 flex-row items-center pr-2">
                <Check size={15} color={colors.success[600]} />
                <T variant="bodySm" className="ml-2">{FEATURES[f] || f}</T>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {v.description ? (
        <Section title="About this car"><T variant="body" tone="muted" className="px-4">{v.description}</T></Section>
      ) : null}

      <Section title="Pricing & kilometres">
        <Panel>
          {est?.lines?.map((l, i) => (
            <KeyValue key={i} label={l.kind === 'day' ? `${dayLabel(l.date)} · full day` : `${dayLabel(l.date)} · ${l.hours} hrs${l.capped ? ' (capped at day rate)' : ''}`} hint={l.source === 'weekend' ? 'Weekend rate' : l.source === 'calendar' ? 'Special date rate' : undefined} value={money(l.amountPaise)} />
          ))}
          {est ? <Divider className="my-2" /> : null}
          <KeyValue label="Free kilometres" value={est ? `${est.includedKm} km` : `${v.pricing.includedKmPerDay} km / day`} />
          <KeyValue label="Extra kilometres" value={`${money(v.pricing.extraKmChargePaise)} / km`} />
          <KeyValue label="Refundable security deposit" value={money(v.pricing.securityDepositPaise)} />
          <KeyValue label="Hourly / daily rate" value={`${money(v.pricing.hourlyPaise)} · ${money(v.pricing.dailyPaise)}`} />
          {v.pricing.weekendDailyPaise ? <KeyValue label="Weekend daily rate" value={money(v.pricing.weekendDailyPaise)} /> : null}
          <T variant="caption" tone="subtle" className="mt-2">GST of {percent(config.data?.tax?.rentalGstBps ?? 1800)} and a convenience fee apply at checkout. Fuel is not included — return it at the same level.</T>
        </Panel>
      </Section>

      <Section title="Insurance & protection">
        <Panel>
          <View className="flex-row items-start">
            <ShieldCheck size={20} color={colors.success[600]} />
            <View className="ml-3 flex-1">
              <T variant="label">{v.insurance ? `${INSURANCE[v.insurance.type]} insurance` : 'Insured vehicle'}</T>
              <T variant="caption" tone="muted" className="mt-0.5">{v.insurance?.provider ? `Policy by ${v.insurance.provider}. ` : ''}Damage you cause is charged as assessed after the trip, up to the repair cost. Report incidents immediately via roadside assistance.</T>
            </View>
          </View>
        </Panel>
      </Section>

      <Section title="Cancellation policy">
        <Panel>
          {(v.policies?.cancellation?.tiers || []).slice().sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart).map((t, i, arr) => (
            <KeyValue
              key={i}
              label={i === 0 ? `More than ${t.minHoursBeforeStart} hrs before pickup` : t.minHoursBeforeStart === 0 ? `Less than ${arr[i - 1].minHoursBeforeStart} hrs before pickup` : `${t.minHoursBeforeStart}–${arr[i - 1].minHoursBeforeStart} hrs before pickup`}
              value={t.refundBps === 10000 ? 'Full refund' : t.refundBps === 0 ? 'No refund' : `${percent(t.refundBps)} refund`}
              tone={t.refundBps === 10000 ? 'success' : t.refundBps === 0 ? 'danger' : 'warning'}
            />
          ))}
          <T variant="caption" tone="subtle" className="mt-2">Refund applies to trip charges; the security deposit is always returned in full on cancellation.</T>
        </Panel>
      </Section>

      <Section title="Your host">
        <Panel>
          <View className="flex-row items-center">
            <Avatar name={v.host?.name} />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                <T variant="body" className="font-bold">{v.host?.name}</T>
                <BadgeCheck size={16} color={colors.brand[500]} style={{ marginLeft: 4 }} />
              </View>
              <T variant="caption" tone="subtle">Verified host · since {dateLong(v.host?.memberSince)}</T>
            </View>
            <Rating value={v.host?.rating?.avg} count={v.host?.rating?.count} />
          </View>
          {v.host?.acceptanceRate !== null && v.host?.acceptanceRate !== undefined ? <T variant="caption" tone="muted" className="mt-3">Accepts {v.host.acceptanceRate}% of booking requests{v.instantBooking ? ' · this car confirms instantly' : ''}.</T> : null}
        </Panel>
      </Section>

      {ENV.mapsEnabled && v.location?.point ? (
        <Section title="Pickup area">
          <View className="mx-4 overflow-hidden rounded-lg border border-line">
            <MapView provider={PROVIDER_GOOGLE} liteMode style={{ height: 170 }} initialRegion={{ latitude: v.location.point.lat, longitude: v.location.point.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }} pointerEvents="none">
              <Circle center={{ latitude: v.location.point.lat, longitude: v.location.point.lng }} radius={900} strokeColor={colors.brand[500]} fillColor="rgba(24,117,185,0.15)" />
            </MapView>
          </View>
          <T variant="caption" tone="subtle" className="mx-4 mt-2">Exact address is shared after your booking is confirmed.{v.delivery?.enabled ? ` Doorstep delivery within ${v.delivery.maxKm} km.` : ''}</T>
        </Section>
      ) : null}

      <Section title="Reviews">
        {v.reviews?.length ? v.reviews.map((r) => (
          <View key={r.id} className="mx-4 mb-3 border-b border-line pb-3">
            <View className="flex-row items-center">
              <T variant="label">{r.author}</T>
              <View className="ml-2 flex-row">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={12} color={colors.warning[500]} fill={s <= r.rating ? colors.warning[500] : 'transparent'} />)}</View>
              <T variant="caption" tone="subtle" className="ml-auto">{dateLong(r.createdAt)}</T>
            </View>
            {r.comment ? <T variant="bodySm" tone="muted" className="mt-1">{r.comment}</T> : null}
            {r.hostReply ? <View className="mt-2 border-l-2 border-ink-200 pl-3"><T variant="caption" tone="subtle">Host: {r.hostReply}</T></View> : null}
          </View>
        )) : <T variant="bodySm" tone="subtle" className="px-4">No reviews yet. Be the first to drive it!</T>}
      </Section>

      {v.delivery?.enabled ? (
        <View className="mx-4 mt-6 flex-row items-center"><Truck size={16} color={colors.ink[500]} /><T variant="caption" tone="subtle" className="ml-2">Delivery and pickup at your address can be added at checkout.</T></View>
      ) : null}

      <TripTimesSheet visible={timesOpen} onClose={() => setTimesOpen(false)} startAt={plan.startAt} endAt={plan.endAt} minLeadMinutes={config.data?.booking?.minLeadMinutes ?? 60} minHours={config.data?.booking?.minDurationHours ?? 4} onApply={plan.setTimes} />
    </Screen>
  );
}

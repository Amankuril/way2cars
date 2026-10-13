import { useState } from 'react';
import { View, Linking, Switch } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Phone, CheckCircle2, ShieldAlert, Wrench, CircleDot, BatteryWarning, CarFront, Fuel, KeyRound, HelpCircle, MapPin, Siren, MessageSquareText } from 'lucide-react-native';
import { Screen, T, Field, Button, EmptyState, Card, HeroHeader, SectionHeader, IconTile, FadeInView, PressableScale, Skeleton, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { ROADSIDE } from '@shared/lib/labels';
import { dateTime } from '@shared/lib/format';
import { api } from '../../api';
import { currentPosition } from '@shared/native/app/location';
import { usePublicConfig } from '../../hooks/queries';
import { VehicleStrip } from '../../components/TripScene';

const ICONS = { breakdown: Wrench, flat_tyre: CircleDot, battery: BatteryWarning, accident: CarFront, fuel: Fuel, lockout: KeyRound, other: HelpCircle };

/** Selectable issue tile (radio). */
function IssueTile({ id, label, selected, onPress }) {
  const Icon = ICONS[id] || HelpCircle;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      containerStyle={{ flex: 1, marginHorizontal: 4 }}
      className={cn('min-h-[88px] items-center justify-center rounded-2xl border-2 px-1 py-3', selected ? 'border-danger-500 bg-danger-50' : 'border-transparent bg-surface')}
      style={selected ? undefined : { boxShadow: '0px 2px 8px -2px rgba(14, 23, 27, 0.10)' }}
    >
      <IconTile icon={Icon} tone={selected ? 'danger' : 'neutral'} size={38} />
      <T variant="caption" className={cn('mt-2 text-center font-semibold', selected ? 'text-danger-700' : 'text-ink-700')} numberOfLines={1}>{label}</T>
    </PressableScale>
  );
}

/** White / glass call button for the hero. */
function CallPill({ label, phone, primary }) {
  return (
    <PressableScale
      onPress={() => Linking.openURL(`tel:${phone}`)}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${phone}`}
      containerStyle={{ flex: 1, marginHorizontal: 4 }}
      className={cn('h-14 flex-row items-center justify-center rounded-2xl px-3', primary ? 'bg-white' : 'border border-white/30 bg-white/15')}
    >
      <Phone size={18} color={primary ? colors.danger[600] : '#FFFFFF'} strokeWidth={2.4} />
      <View className="ml-2">
        <T variant="label" className={primary ? 'font-extrabold text-danger-700' : 'font-bold text-white'} numberOfLines={1}>Call {phone}</T>
        <T variant="caption" className={primary ? 'text-ink-600' : 'text-white/80'} numberOfLines={1}>{label}</T>
      </View>
    </PressableScale>
  );
}

export function RoadsideScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const [type, setType] = useState(null);
  const [description, setDescription] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const config = usePublicConfig();
  const trip = useQuery({ queryKey: ['trip', bookingId], queryFn: () => api.get(`/api/v1/user/bookings/${bookingId}`) });
  const send = useMutation({
    mutationFn: async () => {
      const pos = shareLocation ? await currentPosition() : null;
      return api.post('/api/v1/user/support/roadside', { bookingId, type, description: description.trim(), ...(pos || {}) });
    },
  });
  const support = config.data?.support || {};
  const emergency = support.emergencyPhone;
  const roadsideLine = support.roadsidePhone || support.phone;

  if (send.data) {
    const r = send.data;
    return (
      <Screen tone="hero" header={<HeroHeader compact title="Roadside assistance" />}>
        <EmptyState icon={CheckCircle2} title="Help is on the way" message={`Request ${r.ref} has been sent to our team. We’ll call you shortly. For faster help, call us now.`} className="pb-6 pt-10" />
        <FadeInView index={2}>
          <Card className="mx-4 p-4">
            {r.roadsidePhone ? <Button title={`Call ${r.roadsidePhone}`} icon={Phone} block size="lg" onPress={() => Linking.openURL(`tel:${r.roadsidePhone}`)} /> : null}
            <Button title="Open conversation" icon={MessageSquareText} variant="secondary" block className={r.roadsidePhone ? 'mt-3' : undefined} onPress={() => navigation.replace('Ticket', { id: r.id })} />
            {r.emergencyPhone ? <Button title={`Emergency services ${r.emergencyPhone}`} icon={Siren} variant="dangerGhost" block className="mt-3" onPress={() => Linking.openURL(`tel:${r.emergencyPhone}`)} /> : null}
          </Card>
        </FadeInView>
      </Screen>
    );
  }

  const b = trip.data;
  return (
    <Screen tone="hero" footer={<Button title="Request help now" variant="danger" block size="lg" disabled={!type || description.trim().length < 5} loading={send.isPending} onPress={() => send.mutate()} />}>
      <HeroHeader title="Roadside assistance" eyebrow={support.hours ? `Support ${support.hours}` : undefined} subtitle="Tell us what happened and we’ll get help to you." className="pb-14">
        <View className="mt-4 flex-row rounded-2xl border border-white/20 bg-white/10 p-3">
          <ShieldAlert size={20} color="#FFFFFF" strokeWidth={2.2} />
          <View className="ml-2.5 flex-1">
            <T variant="label" tone="inverse">If anyone is hurt, call {emergency || '112'} first.</T>
            <T variant="caption" className="mt-0.5 text-white/80">Move to a safe place and switch on hazard lights.</T>
          </View>
        </View>
        {emergency || roadsideLine ? (
          <View className="-mx-1 mt-3 flex-row">
            {emergency ? <CallPill label="Emergency services" phone={emergency} primary /> : null}
            {roadsideLine ? <CallPill label="Roadside help" phone={roadsideLine} primary={!emergency} /> : null}
          </View>
        ) : null}
      </HeroHeader>

      {trip.isLoading || b ? (
        <FadeInView style={{ marginTop: -36 }}>
          <Card className="mx-4 p-4">
            {b ? <VehicleStrip vehicle={b.vehicle} caption={`Due back ${dateTime(b.endAt)}`} /> : (
              <View className="flex-row items-center"><Skeleton className="h-14 w-[76px] rounded-xl" /><View className="ml-3 flex-1"><Skeleton className="h-4 w-3/4 rounded-md" /><Skeleton className="mt-2 h-3 w-1/2 rounded-md" /></View></View>
            )}
          </Card>
        </FadeInView>
      ) : null}

      <SectionHeader title="What happened?" className="mt-6" />
      <View className="px-3">
        {[Object.entries(ROADSIDE).slice(0, 4), Object.entries(ROADSIDE).slice(4)].map((row, r) => (
          <View key={r} className={cn('flex-row', r > 0 && 'mt-2')} accessibilityRole="radiogroup">
            {row.map(([k, l], i) => (
              <FadeInView key={k} index={r * 4 + i} style={{ flex: 1 }}>
                <IssueTile id={k} label={l} selected={type === k} onPress={() => setType(k)} />
              </FadeInView>
            ))}
          </View>
        ))}
      </View>

      <SectionHeader title="Details" className="mt-6" />
      <Card className="mx-4 p-4">
        <Field value={description} onChangeText={setDescription} multiline placeholder="Where are you and what do you see?" accessibilityLabel="Details" className="mb-0" />
      </Card>
      <Card className="mx-4 mt-3 flex-row items-center p-4">
        <IconTile icon={MapPin} tone={shareLocation ? 'brand' : 'neutral'} size={40} />
        <View className="ml-3 flex-1"><T variant="label">Share my location</T><T variant="caption" tone="subtle">Helps our team reach you faster</T></View>
        <Switch value={shareLocation} onValueChange={setShareLocation} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={shareLocation ? colors.brand[500] : '#fff'} />
      </Card>
      {send.error ? <T variant="bodySm" tone="danger" className="mx-4 mt-3">{send.error.message}</T> : null}
    </Screen>
  );
}

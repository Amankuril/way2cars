import { View, Image } from 'react-native';
import { Timer, KeyRound, Flag, Hourglass, CarFront, Star } from 'lucide-react-native';
import { T, Pill, cn, PressableScale, TripRoute, DashedDivider, Skeleton } from '@shared/native';
import { colors, shadows } from '@shared/theme/tokens';
import { dayLabel, timeLabel, money, duration } from '@shared/lib/format';
import { BOOKING_STATUS } from '@shared/lib/labels';
import { useCountdown, mmss } from '../hooks/useCountdown';

/** "25 min" / "5 hrs" / "8 days" for a positive span in ms. */
export function spanLabel(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${Math.round(hrs / 24)} days`;
}

const CHIP = {
  brand: ['bg-brand-50', 'text-brand-700', colors.brand[600]],
  warning: ['bg-warning-50', 'text-warning-700', colors.warning[600]],
  neutral: ['bg-ink-100', 'text-ink-700', colors.ink[600]],
};
const TimeChip = ({ icon: Icon, label, tone = 'brand' }) => {
  const [bg, fg, ic] = CHIP[tone];
  return (
    <View className={cn('flex-row items-center self-start rounded-full px-2.5 py-1.5', bg)}>
      <Icon size={13} color={ic} strokeWidth={2.4} />
      <T variant="caption" className={cn('ml-1.5 font-bold', fg)} numberOfLines={1}>{label}</T>
    </View>
  );
};

/** Time-sensitive hint for a trip, derived only from its own timestamps (hold, decision, pickup, return). */
function TripTiming({ t }) {
  const holdLeft = useCountdown(t.status === 'pending_payment' ? t.holdExpiresAt : null);
  const now = Date.now();
  if (t.status === 'pending_payment' && holdLeft > 0) return <TimeChip icon={Timer} tone="warning" label={`Pay within ${mmss(holdLeft)}`} />;
  if (t.status === 'pending_vendor_approval' && t.vendorDecisionDueAt) return <TimeChip icon={Hourglass} tone="neutral" label={`Host replies by ${timeLabel(t.vendorDecisionDueAt)}`} />;
  if (t.status === 'confirmed' && new Date(t.startAt) > now) return <TimeChip icon={KeyRound} label={`Pickup in ${spanLabel(new Date(t.startAt) - now)}`} />;
  if (t.status === 'ongoing') {
    const left = new Date(t.endAt) - now;
    return left > 0 ? <TimeChip icon={Flag} label={`Return in ${spanLabel(left)}`} /> : <TimeChip icon={Flag} tone="warning" label={`Return was due ${timeLabel(t.endAt)}`} />;
  }
  if (t.status === 'completed' && t.reviewed && !t.reviewed.byUser) return <TimeChip icon={Star} tone="neutral" label="Rate your trip" />;
  return null;
}

export function TripCard({ trip: t, onPress }) {
  const s = BOOKING_STATUS[t.status] || { label: t.status, tone: 'neutral' };
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t.vehicle?.title}, ${s.label}, ${dayLabel(t.startAt)} to ${dayLabel(t.endAt)}`}
      className="mx-4 mb-4 rounded-2xl bg-surface p-3"
      style={{ boxShadow: shadows.card }}
    >
      <View className="flex-row items-center">
        <View className="items-center justify-center overflow-hidden rounded-xl bg-ink-100" style={{ width: 92, height: 66 }}>
          {t.vehicle?.photoUrl ? <Image source={{ uri: t.vehicle.photoUrl }} style={{ width: 92, height: 66 }} resizeMode="cover" /> : <CarFront size={26} color={colors.ink[400]} />}
        </View>
        <View className="ml-3 flex-1">
          <T variant="body" className="font-extrabold" numberOfLines={1}>{t.vehicle?.title}</T>
          <T variant="caption" tone="subtle" className="mt-0.5" numberOfLines={1}>Ref {t.ref}</T>
          <Pill label={s.label} tone={s.tone} className="mt-1.5" />
        </View>
      </View>
      <View className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5">
        <TripRoute
          start={{ overline: 'Pickup', title: dayLabel(t.startAt), subtitle: timeLabel(t.startAt) }}
          end={{ overline: 'Return', title: dayLabel(t.endAt), subtitle: timeLabel(t.endAt) }}
          label={duration(t.startAt, t.endAt)}
        />
      </View>
      <DashedDivider className="mt-3" />
      <View className="mt-2.5 flex-row items-center justify-between px-0.5">
        <View className="mr-3 flex-1"><TripTiming t={t} /></View>
        <View className="items-end">
          <T variant="caption" tone="subtle">Total</T>
          <T variant="body" className="font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>{money(t.pricing.totalPaise)}</T>
        </View>
      </View>
    </PressableScale>
  );
}

/** Loading placeholder shaped like a TripCard. */
export function SkeletonTripCard() {
  return (
    <View className="mx-4 mb-4 rounded-2xl bg-surface p-3" style={{ boxShadow: shadows.card }}>
      <View className="flex-row items-center">
        <Skeleton className="rounded-xl" style={{ width: 92, height: 66 }} />
        <View className="ml-3 flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-2/5" /><Skeleton className="mt-2 h-5 w-24 rounded-full" /></View>
      </View>
      <Skeleton className="mt-3 h-16 w-full rounded-xl" />
      <View className="mt-3 flex-row items-center justify-between"><Skeleton className="h-7 w-32 rounded-full" /><Skeleton className="h-8 w-20" /></View>
    </View>
  );
}

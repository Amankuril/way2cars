import { View, Image, Pressable } from '@/mobile/rn';
import { T, Pill } from '@/mobile/ui';
import { dayLabel, timeLabel, money } from '@shared/lib/format';
import { BOOKING_STATUS } from '@shared/lib/labels';

export function TripCard({ trip: t, onPress }) {
  const s = BOOKING_STATUS[t.status];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mx-4 mb-3 rounded-lg border border-line bg-surface p-3.5 active:bg-ink-50">
      <View className="flex-row">
        {t.vehicle?.photoUrl ? <Image source={{ uri: t.vehicle.photoUrl }} style={{ width: 84, height: 60, borderRadius: 8 }} /> : <View style={{ width: 84, height: 60 }} className="rounded-md bg-ink-100" />}
        <View className="ml-3 flex-1">
          <T variant="body" className="font-bold" numberOfLines={1}>{t.vehicle?.title}</T>
          <T variant="caption" tone="muted">{dayLabel(t.startAt)}, {timeLabel(t.startAt)} → {dayLabel(t.endAt)}, {timeLabel(t.endAt)}</T>
          <T variant="caption" tone="subtle">Ref {t.ref}</T>
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-between border-t border-line pt-3">
        <Pill label={s.label} tone={s.tone} />
        <T variant="label">{money(t.pricing.totalPaise)}</T>
      </View>
    </Pressable>
  );
}

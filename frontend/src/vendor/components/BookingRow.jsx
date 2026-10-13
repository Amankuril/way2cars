import { View, Image, Pressable } from '@/mobile/rn';
import { T, Pill } from '@/mobile/ui';
import { dayLabel, timeLabel, money, pct } from '../lib';
import { BOOKING_STATUS } from '@shared/lib/labels';

/** Compact booking row for the host: car, renter, dates, status and expected earning. */
export function BookingRow({ booking: b, onPress, right }) {
  const s = BOOKING_STATUS[b.status];
  const earning = b.pricing.rentalPaise - pct(b.pricing.rentalPaise, b.pricing.commissionBps);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mx-4 mb-3 rounded-lg border border-line bg-surface p-3.5 active:bg-ink-50">
      <View className="flex-row">
        {b.vehicle?.photoUrl ? <Image source={{ uri: b.vehicle.photoUrl }} style={{ width: 72, height: 52, borderRadius: 8 }} /> : <View style={{ width: 72, height: 52 }} className="rounded-md bg-ink-100" />}
        <View className="ml-3 flex-1">
          <T variant="label" numberOfLines={1}>{b.vehicle?.title}</T>
          <T variant="caption" tone="muted">{dayLabel(b.startAt)}, {timeLabel(b.startAt)} → {dayLabel(b.endAt)}, {timeLabel(b.endAt)}</T>
          <T variant="caption" tone="subtle">{b.renter?.name || 'Renter'} · Ref {b.ref}</T>
        </View>
      </View>
      <View className="mt-3 flex-row items-center justify-between border-t border-line pt-3">
        <Pill label={s.label} tone={s.tone} />
        {right || <T variant="label">{money(earning)} <T variant="caption" tone="subtle">est. earning</T></T>}
      </View>
    </Pressable>
  );
}

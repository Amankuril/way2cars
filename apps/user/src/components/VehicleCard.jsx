import { View, Image, Pressable } from 'react-native';
import { Users, Fuel, Cog, Zap, Truck } from 'lucide-react-native';
import { T, Rating, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money, km } from '@shared/lib/format';
import { FUEL, TRANSMISSION } from '@shared/lib/labels';

const Spec = ({ icon: Icon, label }) => (
  <View className="mr-3.5 flex-row items-center">
    <Icon size={13} color={colors.ink[500]} />
    <T variant="caption" tone="muted" className="ml-1">{label}</T>
  </View>
);

/** Listing card: photo first, then identity, specs and price (estimate for the chosen dates). */
export function VehicleCard({ vehicle: v, onPress, compact }) {
  const price = v.estimate?.rentalPaise;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${v.title}, ${price ? money(price) : `${money(v.pricing.dailyPaise)} per day`}`} className={cn('overflow-hidden rounded-lg border border-line bg-surface active:opacity-90', compact ? 'w-64' : 'mx-4 mb-4')}>
      <View style={{ aspectRatio: compact ? 16 / 10 : 16 / 9 }} className="bg-ink-100">
        {v.photos?.[0] ? <Image source={{ uri: v.photos[0] }} className="h-full w-full" resizeMode="cover" /> : null}
        <View className="absolute left-2.5 top-2.5 flex-row">
          {v.instantBooking ? <View className="mr-1.5 flex-row items-center rounded-sm bg-white/95 px-2 py-1"><Zap size={12} color={colors.brand[600]} fill={colors.brand[600]} /><T variant="caption" className="ml-1 font-bold text-brand-700">Instant</T></View> : null}
          {v.delivery?.enabled ? <View className="flex-row items-center rounded-sm bg-white/95 px-2 py-1"><Truck size={12} color={colors.ink[700]} /><T variant="caption" className="ml-1 font-semibold text-ink-700">Delivery</T></View> : null}
        </View>
      </View>
      <View className="p-3.5">
        <View className="flex-row items-start justify-between">
          <View className="mr-3 flex-1">
            <T variant="body" className="font-bold" numberOfLines={1}>{v.title}</T>
            <T variant="caption" tone="subtle" numberOfLines={1}>{[v.year, v.location?.area, v.distanceMeters !== undefined ? `${km(v.distanceMeters)} away` : null].filter(Boolean).join(' · ')}</T>
          </View>
          <Rating value={v.rating?.avg} count={v.rating?.count} />
        </View>
        <View className="mt-2.5 flex-row">
          <Spec icon={Users} label={`${v.seats} seats`} />
          <Spec icon={Cog} label={TRANSMISSION[v.transmission]} />
          <Spec icon={v.fuelType === 'electric' ? Zap : Fuel} label={FUEL[v.fuelType]} />
        </View>
        <View className="mt-3 flex-row items-end justify-between border-t border-line pt-3">
          {price ? (
            <View>
              <T variant="price">{money(price)}</T>
              <T variant="caption" tone="subtle">for {v.estimate.hours} hrs · {v.estimate.includedKm} km free · excl. taxes</T>
            </View>
          ) : (
            <View className="flex-row items-end">
              <T variant="price">{money(v.pricing.dailyPaise)}</T>
              <T variant="bodySm" tone="subtle" className="mb-0.5 ml-1">/ day</T>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

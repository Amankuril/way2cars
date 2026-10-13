import { View, Image } from 'react-native';
import { Users, Fuel, Cog, Zap, Truck, Star, ArrowRight, MapPin } from 'lucide-react-native';
import { T, cn, PressableScale, SpecChip, GradientFill } from '@shared/native';
import { colors, shadows, gradients } from '@shared/theme/tokens';
import { money, km } from '@shared/lib/format';
import { FUEL, TRANSMISSION } from '@shared/lib/labels';

/** Glassy badge over the photo. */
const Badge = ({ icon: Icon, label, strong }) => (
  <View className="mr-1.5 flex-row items-center rounded-full bg-white/95 px-2 py-1">
    <Icon size={12} color={strong ? colors.brand[600] : colors.ink[700]} fill={strong ? colors.brand[600] : 'transparent'} strokeWidth={2.2} />
    <T variant="caption" className={cn('ml-1 font-bold', strong ? 'text-brand-700' : 'text-ink-700')}>{label}</T>
  </View>
);

/** Listing card: photo first, then identity, spec chips and price (estimate for the chosen dates). */
export function VehicleCard({ vehicle: v, onPress, compact }) {
  const price = v.estimate?.rentalPaise;
  const rated = v.rating?.count > 0;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${v.title}, ${price ? money(price) : `${money(v.pricing.dailyPaise)} per day`}`}
      className={cn('rounded-2xl bg-surface', compact ? 'w-64' : 'mx-4 mb-4')}
      style={{ boxShadow: shadows.card }}
    >
      <View className="p-2 pb-0">
        <View style={{ aspectRatio: compact ? 16 / 10 : 16 / 9 }} className="overflow-hidden rounded-xl bg-ink-100">
          {v.photos?.[0] ? <Image source={{ uri: v.photos[0] }} className="h-full w-full" resizeMode="cover" /> : null}
          <View className="absolute left-2 top-2 flex-row">
            {v.instantBooking ? <Badge icon={Zap} label="Instant" strong /> : null}
            {v.delivery?.enabled ? <Badge icon={Truck} label="Delivery" /> : null}
          </View>
          <View className="absolute bottom-2 right-2 flex-row items-center rounded-full bg-ink-900/75 px-2 py-1">
            {rated ? <Star size={11} color={colors.warning[500]} fill={colors.warning[500]} /> : null}
            <T variant="caption" tone="inverse" className={cn('font-bold', rated && 'ml-1')}>{rated ? Number(v.rating.avg).toFixed(1) : 'New'}</T>
            {rated ? <T variant="caption" className="ml-0.5 text-white/70">({v.rating.count})</T> : null}
          </View>
        </View>
      </View>
      <View className={compact ? 'px-3 pb-3 pt-2.5' : 'px-3.5 pb-3.5 pt-3'}>
        <T variant="body" className="font-extrabold" numberOfLines={1}>{v.title}</T>
        <View className="mt-0.5 flex-row items-center">
          <MapPin size={12} color={colors.ink[400]} />
          <T variant="caption" tone="subtle" className="ml-1 flex-1" numberOfLines={1}>{[v.year, compact ? FUEL[v.fuelType] : null, v.location?.area, v.distanceMeters !== undefined ? `${km(v.distanceMeters)} away` : null].filter(Boolean).join(' · ')}</T>
        </View>
        <View className="mt-2.5 flex-row flex-wrap">
          <SpecChip icon={Users} label={`${v.seats} seats`} />
          <SpecChip icon={Cog} label={TRANSMISSION[v.transmission]} />
          {compact ? null : <SpecChip icon={v.fuelType === 'electric' ? Zap : Fuel} label={FUEL[v.fuelType]} />}
        </View>
        <View className="mt-2 flex-row items-end justify-between">
          {price ? (
            <View className="mr-2 flex-1">
              <T variant="price" className="text-brand-700">{money(price)}</T>
              <T variant="caption" tone="subtle" numberOfLines={compact ? 1 : 2}>{compact ? `${v.estimate.hours} hrs · ${v.estimate.includedKm} km free` : `for ${v.estimate.hours} hrs · ${v.estimate.includedKm} km free · excl. taxes`}</T>
            </View>
          ) : (
            <View className="mr-2 flex-1 flex-row items-end">
              <T variant="price" className="text-brand-700">{money(v.pricing.dailyPaise)}</T>
              <T variant="bodySm" tone="subtle" className="mb-0.5 ml-1">/ day</T>
            </View>
          )}
          <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full" style={{ boxShadow: shadows.brand }}>
            <GradientFill stops={gradients.brand} />
            <ArrowRight size={18} color="#fff" strokeWidth={2.4} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

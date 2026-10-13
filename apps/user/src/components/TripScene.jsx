import { View, Image } from 'react-native';
import Svg, { Circle, Rect, Path } from 'react-native-svg';
import { T, CarArt, GradientFill, SpecChip, cn } from '@shared/native';
import { colors, gradients, shadows } from '@shared/theme/tokens';

const W = 248;
const H = 136;

/**
 * Still illustration for pickup/return waiting and "not available" states: the brand car parked on a
 * road under a soft sky, with a round status badge (icon) in the corner. Static — nothing loops.
 */
export function TripScene({ icon: Icon, tone = 'brand' }) {
  const badge = tone === 'warning' ? [colors.warning[500], '#F2A93B'] : tone === 'success' ? [colors.success[600], colors.success[500]] : gradients.brand;
  return (
    <View style={{ width: W, height: H }}>
      <View style={{ width: W, height: H, borderRadius: 28, overflow: 'hidden' }}>
        <GradientFill stops={[colors.brand[50], colors.accent[50]]} angle="vertical" />
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Circle cx={44} cy={34} r={16} fill={colors.accent[100]} />
          <Circle cx={44} cy={34} r={9} fill={colors.accent[200]} />
          <Path d="M150 30 a7 7 0 0 1 12 -5 a9 9 0 0 1 16 2 a6 6 0 0 1 4 10 h-30 a5 5 0 0 1 -2 -7 z" fill="#FFFFFF" />
          <Rect x={18} y={66} width={16} height={34} rx={2} fill={colors.brand[100]} />
          <Rect x={38} y={56} width={22} height={44} rx={2} fill={colors.brand[100]} />
          <Rect x={196} y={60} width={20} height={40} rx={2} fill={colors.brand[100]} />
          <Rect x={220} y={72} width={14} height={28} rx={2} fill={colors.brand[100]} />
          <Rect x={0} y={100} width={W} height={36} fill={colors.ink[700]} />
          {[12, 52, 92, 132, 172, 212].map((x) => <Rect key={x} x={x} y={119} width={22} height={3} rx={1.5} fill="#FFFFFF" fillOpacity={0.55} />)}
        </Svg>
        <View style={{ position: 'absolute', left: (W - 132) / 2, top: 52 }}><CarArt still /></View>
      </View>
      {Icon ? (
        <View style={{ position: 'absolute', right: 10, top: 10, width: 48, height: 48, borderRadius: 24, boxShadow: shadows.brand }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
            <GradientFill stops={badge} />
            <Icon size={20} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Compact vehicle row (photo, title, registration) for the top of pickup/return/roadside. */
export function VehicleStrip({ vehicle, caption, className }) {
  if (!vehicle) return null;
  return (
    <View className={cn('flex-row items-center', className)}>
      <View className="h-14 w-[76px] overflow-hidden rounded-xl bg-ink-100">
        {vehicle.photoUrl ? <Image source={{ uri: vehicle.photoUrl }} style={{ width: 76, height: 56 }} resizeMode="cover" /> : null}
      </View>
      <View className="ml-3 flex-1">
        <T variant="label" numberOfLines={1}>{vehicle.title}</T>
        {caption ? <T variant="caption" tone="subtle" numberOfLines={1} className="mt-0.5">{caption}</T> : null}
        {vehicle.registrationNumber ? <View className="mt-1 flex-row"><SpecChip label={vehicle.registrationNumber} tone="brand" className="mb-0" /></View> : null}
      </View>
    </View>
  );
}

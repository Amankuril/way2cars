import { View } from '../rn';

/**
 * react-native-maps stand-in: a Google Maps embed centred on region/initialRegion (no API key).
 * Overlays (Marker, Circle, Polyline) are not drawn. Set scrollEnabled={false} for a static preview.
 */
const zoomFor = (r) => Math.max(3, Math.min(18, Math.round(Math.log2(360 / Math.max(r?.latitudeDelta || 0.02, 0.0005)))));

export default function MapView({ region, initialRegion, className, style, scrollEnabled = true, zoomEnabled = true, accessibilityLabel = 'Map' }) {
  const r = region || initialRegion;
  if (!r) return <View className={className} style={style} />;
  const src = `https://maps.google.com/maps?q=${r.latitude},${r.longitude}&z=${zoomFor(r)}&output=embed`;
  const interactive = scrollEnabled !== false && zoomEnabled !== false;
  return (
    <View className={className} style={style}>
      <iframe
        title={accessibilityLabel}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 h-full w-full border-0"
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      />
    </View>
  );
}
export { MapView };
export const Marker = () => null;
export const Circle = () => null;
export const Polyline = () => null;
export const Polygon = () => null;
export const Callout = () => null;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

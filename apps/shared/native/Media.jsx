import { View, Image, Pressable, ActivityIndicator } from 'react-native';
import { Camera, CheckCircle2, RotateCcw } from 'lucide-react-native';
import { T } from './Text';
import { cn } from './cn';
import { colors } from '../theme/tokens';

const MARK = require('../assets/mark.png');

/** Brand lockup: car mark + wordmark set in the brand typeface. */
export function Logo({ size = 'md', subtitle }) {
  const w = size === 'lg' ? 132 : size === 'sm' ? 64 : 96;
  return (
    <View className="items-start">
      <Image source={MARK} style={{ width: w, height: w * 0.43 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <T variant={size === 'lg' ? 'display' : 'title'} className="mt-1 tracking-wide text-ink-900">WAY2CARS</T>
      {subtitle ? <T variant="overline" tone="brand" className="mt-0.5">{subtitle}</T> : null}
    </View>
  );
}

/**
 * Upload slot for documents/photos. state: idle | uploading | done | error.
 * Private files are displayed through an authenticated URI source ({ uri, headers }).
 */
export function PhotoTile({ label, source, state = 'idle', onPress, error, aspect = 1.4, className }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}${state === 'done' ? ', uploaded' : ''}`} className={cn('mb-3', className)}>
      <View style={{ aspectRatio: aspect }} className={cn('overflow-hidden rounded-md border', error ? 'border-danger-500' : state === 'done' ? 'border-ink-200' : 'border-dashed border-ink-300', 'bg-ink-50')}>
        {source ? <Image source={source} className="h-full w-full" resizeMode="cover" /> : (
          <View className="flex-1 items-center justify-center px-2">
            <Camera size={22} color={colors.ink[500]} />
            <T variant="caption" tone="muted" className="mt-1.5 text-center">{label}</T>
          </View>
        )}
        {state === 'uploading' ? <View className="absolute inset-0 items-center justify-center bg-white/70"><ActivityIndicator color={colors.brand[500]} /></View> : null}
        {state === 'done' && source ? <View className="absolute right-1.5 top-1.5 rounded-full bg-white"><CheckCircle2 size={20} color={colors.success[600]} fill="#fff" /></View> : null}
        {state === 'error' ? <View className="absolute inset-0 items-center justify-center bg-white/80"><RotateCcw size={20} color={colors.danger[600]} /><T variant="caption" tone="danger" className="mt-1">Tap to retry</T></View> : null}
      </View>
      {source ? <T variant="caption" tone="muted" className="mt-1">{label}</T> : null}
      {error ? <T variant="caption" tone="danger" className="mt-0.5">{error}</T> : null}
    </Pressable>
  );
}

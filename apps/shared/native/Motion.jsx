import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { T } from './Text';
import { cn } from './cn';
import { motion } from '../theme/tokens';

/*
 * Motion primitives. Rule: Reanimated components only ever get `style` (never `className`) —
 * NativeWind doesn't style Reanimated's Animated.View. Layout classes go on a plain inner View.
 * All animations run on the UI thread and honour the OS "reduce motion" setting.
 */

export { useReducedMotion };

/**
 * Pressable with spring "squish" feedback. `className`/`style` style the pressable itself;
 * `containerStyle` styles the animated wrapper (e.g. { flex: 1 } inside a row).
 */
export function PressableScale({ children, className, style, containerStyle, scaleTo = motion.pressScale, onPressIn, onPressOut, disabled, ...rest }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[containerStyle, anim]}>
      <Pressable
        {...rest}
        disabled={disabled}
        className={className}
        style={style}
        onPressIn={(e) => { if (!reduce) s.value = withSpring(scaleTo, motion.spring); onPressIn?.(e); }}
        onPressOut={(e) => { s.value = withSpring(1, motion.spring); onPressOut?.(e); }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const ENTER = { up: FadeInDown, down: FadeInUp, none: FadeIn };

/**
 * Entrance animation for cards and list items. `index` staggers siblings (capped so long lists
 * don't wait). `from`: 'up' (rises into place, default) | 'down' | 'none' (fade only).
 */
export function FadeInView({ children, index = 0, delay = 0, from = 'up', className, style }) {
  const reduce = useReducedMotion();
  const builder = ENTER[from] || FadeInDown;
  const entering = reduce ? undefined : builder.delay(delay + Math.min(index, 8) * motion.stagger).springify().damping(motion.springSoft.damping).stiffness(motion.springSoft.stiffness);
  return (
    <Animated.View entering={entering} style={style}>
      <View className={className}>{children}</View>
    </Animated.View>
  );
}

/**
 * Text that rolls to its new value (odometer feel) whenever `value` changes — for totals/prices.
 * `value` is the already-formatted string.
 */
export function AnimatedNumber({ value, variant = 'price', tone = 'default', className, style, testID }) {
  const reduce = useReducedMotion();
  return (
    <View className="overflow-hidden" testID={testID}>
      <Animated.View key={String(value)} entering={reduce ? undefined : FadeInDown.duration(motion.base)} exiting={reduce ? undefined : FadeOutUp.duration(motion.fast)}>
        <T variant={variant} tone={tone} className={className} style={[{ fontVariant: ['tabular-nums'] }, style]}>{value}</T>
      </Animated.View>
    </View>
  );
}

/** Page indicator: the active dot stretches into a pill. `tone`: 'brand' (on light) | 'inverse' (on photos). */
export function Dots({ count, index, tone = 'brand', className }) {
  if (count < 2) return null;
  return (
    <View className={cn('flex-row items-center justify-center', className)} accessibilityRole="progressbar" accessibilityLabel={`Page ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => <Dot key={i} active={i === index} tone={tone} />)}
    </View>
  );
}

function Dot({ active, tone }) {
  const w = useSharedValue(active ? 18 : 6);
  useEffect(() => { w.value = withTiming(active ? 18 : 6, { duration: motion.base }); }, [active, w]);
  const anim = useAnimatedStyle(() => ({ width: w.value }));
  const on = tone === 'inverse' ? '#FFFFFF' : '#1875B9';
  const off = tone === 'inverse' ? 'rgba(255,255,255,0.55)' : '#C3CCD1';
  return <Animated.View style={[{ height: 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: active ? on : off }, anim]} />;
}


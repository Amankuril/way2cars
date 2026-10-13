import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Rect, Line, G, Ellipse } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing, useReducedMotion, cancelAnimation } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import { T } from './Text';
import { cn } from './cn';
import { GradientFill, DashedDivider, FillSvg } from './Surfaces';
import { colors } from '../theme/tokens';

/*
 * Illustrated, animated scenes. Drawn once in SVG; motion is pure transform loops on the UI thread
 * (Reanimated withRepeat), frozen in place when the OS asks for reduced motion.
 */

const SCENE_H = 150;
const ROAD_H = 34;
const MAX_W = 520; // widest scene we cover (phones + the 480px web frame)

/** Infinite linear loop 0 → -distance (or a custom from/to) on a shared value. */
function useLoop(duration, distance, { reduce, from = 0 } = {}) {
  const v = useSharedValue(from);
  useEffect(() => {
    if (reduce) return undefined;
    v.value = from;
    v.value = withRepeat(withTiming(from - distance, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(v);
  }, [duration, distance, reduce, from, v]);
  return v;
}

/** A horizontally repeating strip of `tile`-wide SVG art scrolling left forever. */
function Strip({ tile, height, bottom, top, duration, reduce, children }) {
  const count = Math.ceil(MAX_W / tile) + 1;
  const x = useLoop(duration, tile, { reduce });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: tile * count, height, bottom, top }, style]}>
      <Svg width={tile * count} height={height}>
        {Array.from({ length: count }, (_, i) => <G key={i} transform={`translate(${i * tile}, 0)`}>{children}</G>)}
      </Svg>
    </Animated.View>
  );
}

function Wheel({ left, top, reduce }) {
  const r = useLoop(700, -360, { reduce });
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: 20, height: 20 }, style]}>
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Circle cx="10" cy="10" r="9.5" fill={colors.ink[900]} />
        <Circle cx="10" cy="10" r="5.5" fill={colors.ink[300]} />
        <Line x1="10" y1="4.5" x2="10" y2="15.5" stroke={colors.ink[600]} strokeWidth="1.4" />
        <Line x1="4.5" y1="10" x2="15.5" y2="10" stroke={colors.ink[600]} strokeWidth="1.4" />
        <Circle cx="10" cy="10" r="1.8" fill={colors.ink[700]} />
      </Svg>
    </Animated.View>
  );
}

/** Side-view hatchback in brand colours, 132×60. Wheels spin unless `still`. */
export function CarArt({ still, reduce }) {
  return (
    <View style={{ width: 132, height: 60 }}>
      <Svg width={132} height={60} viewBox="0 0 132 60">
        <Ellipse cx="66" cy="56" rx="58" ry="3.5" fill={colors.ink[900]} fillOpacity="0.18" />
        <Path d="M8 44 C6 36 10 30 20 28 L36 26 L47 13 C49.5 10 52.5 8.5 56 8.5 L86 8.5 C90 8.5 93 10 95 13 L104 26 L118 29 C125 31 128 35 128 41 L128 44 C128 46.5 126 48 123.5 48 L12.5 48 C10 48 8 46.5 8 44 Z" fill={colors.brand[500]} />
        <Path d="M8 40 L128 40 L128 44 C128 46.5 126 48 123.5 48 L12.5 48 C10 48 8 46.5 8 44 Z" fill={colors.brand[700]} />
        <Path d="M58 13 L85 13 C87.5 13 89 14 90.5 16 L98 26 L58 26 Z" fill={colors.accent[100]} />
        <Path d="M54 13 L54 26 L41 26 L49.5 15.5 C50.5 14 52 13 54 13 Z" fill={colors.accent[100]} />
        <Rect x="55" y="13" width="2.5" height="13" fill={colors.brand[600]} />
        <Line x1="76" y1="28" x2="76" y2="44" stroke={colors.brand[700]} strokeWidth="1.2" />
        <Rect x="80" y="31" width="7" height="2" rx="1" fill={colors.brand[200]} />
        <Rect x="121" y="32" width="7" height="4.5" rx="2" fill="#FFE7A3" />
        <Rect x="7" y="32" width="5" height="4.5" rx="2" fill={colors.danger[500]} />
        <Circle cx="34" cy="48" r="12" fill={colors.brand[800]} />
        <Circle cx="100" cy="48" r="12" fill={colors.brand[800]} />
      </Svg>
      <Wheel left={24} top={38} reduce={reduce || still} />
      <Wheel left={90} top={38} reduce={reduce || still} />
    </View>
  );
}

/**
 * Search loading scene: a car cruising past a skyline and trees on a road with moving lane dashes,
 * plus a title and optional subtitle/children (e.g. a <TripRoute>).
 */
export function CarLoader({ title = 'Finding the best rides…', subtitle, children, className, testID }) {
  const reduce = useReducedMotion();
  const bob = useSharedValue(0);
  const speed = useSharedValue(0);
  useEffect(() => {
    if (reduce) return undefined;
    bob.value = withRepeat(withSequence(withTiming(-1.8, { duration: 260 }), withTiming(0, { duration: 260 })), -1, false);
    speed.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
    return () => { cancelAnimation(bob); cancelAnimation(speed); };
  }, [reduce, bob, speed]);
  const carStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const lines = useAnimatedStyle(() => ({ opacity: 0.8 * (1 - speed.value), transform: [{ translateX: -speed.value * 22 }] }));

  return (
    <View className={cn('mx-4 overflow-hidden rounded-3xl bg-surface', className)} style={{ boxShadow: '0px 12px 32px -12px rgba(14, 23, 27, 0.24)' }} testID={testID} accessibilityRole="progressbar" accessibilityLabel={title}>
      <View style={{ height: SCENE_H, overflow: 'hidden' }}>
        <GradientFill stops={[colors.brand[50], '#FFFFFF']} angle="vertical" />
        <FillSvg>
          {({ w }) => (
            <>
              <Circle cx={w * 0.82} cy="34" r="18" fill={colors.accent[100]} />
              <Circle cx={w * 0.82} cy="34" r="11" fill={colors.accent[200]} />
            </>
          )}
        </FillSvg>
        <Strip tile={260} height={26} top={14} duration={22000} reduce={reduce}>
          <Path d="M20 18 a8 8 0 0 1 14 -6 a10 10 0 0 1 18 2 a7 7 0 0 1 4 12 h-36 a6 6 0 0 1 0 -8 z" fill="#FFFFFF" />
          <Path d="M150 12 a6 6 0 0 1 11 -4 a8 8 0 0 1 14 2 a5 5 0 0 1 3 9 h-28 a5 5 0 0 1 0 -7 z" fill="#FFFFFF" fillOpacity="0.9" />
        </Strip>
        <Strip tile={240} height={58} bottom={ROAD_H} duration={12000} reduce={reduce}>
          <Rect x="6" y="22" width="22" height="36" rx="2" fill={colors.brand[100]} />
          <Rect x="30" y="8" width="18" height="50" rx="2" fill={colors.brand[200]} fillOpacity="0.7" />
          <Rect x="52" y="30" width="26" height="28" rx="2" fill={colors.brand[100]} />
          <Rect x="96" y="14" width="16" height="44" rx="2" fill={colors.accent[100]} />
          <Rect x="114" y="26" width="30" height="32" rx="2" fill={colors.brand[100]} />
          <Rect x="160" y="4" width="20" height="54" rx="2" fill={colors.brand[200]} fillOpacity="0.6" />
          <Rect x="184" y="28" width="24" height="30" rx="2" fill={colors.accent[100]} />
          <Rect x="212" y="18" width="20" height="40" rx="2" fill={colors.brand[100]} />
        </Strip>
        <Strip tile={170} height={44} bottom={ROAD_H - 2} duration={4200} reduce={reduce}>
          <Rect x="28" y="26" width="3" height="18" fill={colors.ink[400]} />
          <Circle cx="29.5" cy="20" r="11" fill={colors.accent[500]} fillOpacity="0.85" />
          <Rect x="118" y="30" width="3" height="14" fill={colors.ink[400]} />
          <Circle cx="119.5" cy="26" r="8" fill={colors.success[500]} fillOpacity="0.75" />
        </Strip>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: ROAD_H, backgroundColor: colors.ink[800] }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: ROAD_H - 3, height: 3, backgroundColor: colors.ink[600] }} />
        <Strip tile={56} height={4} bottom={ROAD_H / 2 - 2} duration={520} reduce={reduce}>
          <Rect x="0" y="0" width="28" height="3.5" rx="1.75" fill="#FFFFFF" fillOpacity="0.85" />
        </Strip>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: ROAD_H / 2 - 4, alignItems: 'center' }} pointerEvents="none">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Animated.View style={[{ marginRight: 4 }, lines]}>
              <Svg width={30} height={26}>
                <Line x1="4" y1="6" x2="28" y2="6" stroke={colors.brand[300]} strokeWidth="2.5" strokeLinecap="round" />
                <Line x1="12" y1="14" x2="28" y2="14" stroke={colors.accent[400]} strokeWidth="2.5" strokeLinecap="round" />
                <Line x1="0" y1="22" x2="24" y2="22" stroke={colors.brand[200]} strokeWidth="2.5" strokeLinecap="round" />
              </Svg>
            </Animated.View>
            <Animated.View style={carStyle}><CarArt reduce={reduce} /></Animated.View>
            <View style={{ width: 34 }} />
          </View>
        </View>
      </View>
      <View className="items-center px-5 pb-5 pt-4">
        <T variant="headline" className="text-center">{title}</T>
        {subtitle ? <T variant="bodySm" tone="muted" className="mt-1 text-center">{subtitle}</T> : null}
        {children ? <View className="mt-4 w-full">{children}</View> : null}
      </View>
    </View>
  );
}

/**
 * Pickup → duration → return, with a dashed arrow (and a travelling dot when `animated`).
 * start/end: { overline, title, subtitle }.
 */
export function TripRoute({ start, end, label, animated, className }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!animated || reduce || !w) return undefined;
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [animated, reduce, w, p]);
  const dot = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * Math.max(0, w - 8) }], opacity: p.value < 0.9 ? 1 : (1 - p.value) * 10 }));
  const End = ({ v, right }) => (
    <View className={cn('w-[34%]', right && 'items-end')}>
      {v.overline ? <T variant="overline" tone="subtle">{v.overline}</T> : null}
      <T variant="body" className={cn('mt-0.5 font-bold', right && 'text-right')} numberOfLines={1}>{v.title}</T>
      {v.subtitle ? <T variant="bodySm" tone="muted" className={right ? 'text-right' : ''}>{v.subtitle}</T> : null}
    </View>
  );
  return (
    <View className={cn('flex-row items-center', className)}>
      <End v={start} />
      <View className="flex-1 items-center px-1.5">
        {label ? <View className="mb-1.5 rounded-full bg-brand-50 px-2.5 py-1"><T variant="caption" className="font-bold text-brand-700" numberOfLines={1}>{label}</T></View> : null}
        <View className="w-full flex-row items-center" onLayout={(e) => setW(e.nativeEvent.layout.width - 10)}>
          <View className="h-2 w-2 rounded-full bg-brand-500" />
          <View className="flex-1"><DashedDivider color={colors.brand[300]} dash="4 4" thickness={1.5} /></View>
          <ChevronRight size={14} color={colors.brand[500]} strokeWidth={2.6} style={{ marginLeft: -4 }} />
          {animated && w ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent[500] }, dot]} /> : null}
        </View>
      </View>
      <End v={end} right />
    </View>
  );
}


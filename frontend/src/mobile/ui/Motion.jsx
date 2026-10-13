import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from '../rn';
import { T } from './Text';
import { cn } from './cn';
import { motion } from '@shared/theme/tokens';
import './kit.css';

/*
 * Web port of apps/shared/native/Motion.jsx — same names and props. Reanimated springs become CSS
 * transitions/keyframes (kit.css); prefers-reduced-motion switches them off.
 */

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
/** Reanimated's useReducedMotion(): true when the OS asks for less motion. */
export function useReducedMotion() {
  const [r, setR] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return undefined;
    const on = () => setR(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, []);
  return r;
}

/** Pressable with spring "squish" feedback. `containerStyle` styles the wrapper (e.g. { flex: 1 }). */
export function PressableScale({ children, className, style, containerStyle, scaleTo = motion.pressScale, ...rest }) {
  return (
    <View style={containerStyle}>
      <Pressable {...rest} className={cn('w2c-press', className)} style={[{ '--w2c-press-scale': scaleTo }, style]}>
        {children}
      </Pressable>
    </View>
  );
}

const ENTER = { up: 'w2c-fade-up', down: 'w2c-fade-down', none: 'w2c-fade-in' };

/** Entrance animation for cards and list items; `index` staggers siblings (capped at 8). */
export function FadeInView({ children, index = 0, delay = 0, from = 'up', className, style }) {
  return (
    <View className={ENTER[from] || ENTER.up} style={[{ animationDelay: `${delay + Math.min(index, 8) * motion.stagger}ms` }, style]}>
      <View className={className}>{children}</View>
    </View>
  );
}

/** Text that rolls to its new value whenever `value` (a formatted string) changes. */
export function AnimatedNumber({ value, variant = 'price', tone = 'default', className, style, testID }) {
  const [prev, setPrev] = useState(null);
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return undefined;
    setPrev(last.current);
    last.current = value;
    const t = setTimeout(() => setPrev(null), 170);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <View className="relative overflow-hidden" testID={testID}>
      <View key={String(value)} className={prev !== null ? 'w2c-roll-in' : undefined}>
        <T variant={variant} tone={tone} className={className} style={[{ fontVariant: ['tabular-nums'] }, style]}>{value}</T>
      </View>
      {prev !== null ? (
        <View className="w2c-roll-out absolute left-0 top-0" aria-hidden>
          <T variant={variant} tone={tone} className={className} style={[{ fontVariant: ['tabular-nums'] }, style]}>{prev}</T>
        </View>
      ) : null}
    </View>
  );
}

/** Page indicator: the active dot stretches into a pill. `tone`: 'brand' | 'inverse'. */
export function Dots({ count, index, tone = 'brand', className }) {
  if (count < 2) return null;
  const on = tone === 'inverse' ? '#FFFFFF' : '#1875B9';
  const off = tone === 'inverse' ? 'rgba(255,255,255,0.55)' : '#C3CCD1';
  return (
    <View className={cn('flex-row items-center justify-center', className)} accessibilityRole="progressbar" accessibilityLabel={`Page ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="w2c-dot" style={{ height: 6, borderRadius: 3, marginHorizontal: 3, width: i === index ? 18 : 6, backgroundColor: i === index ? on : off }} />
      ))}
    </View>
  );
}

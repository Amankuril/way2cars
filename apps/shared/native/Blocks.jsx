import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withTiming, withRepeat, withDelay, Easing, cancelAnimation, useReducedMotion } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Check } from 'lucide-react-native';
import { T } from './Text';
import { IconButton } from './Button';
import { cn } from './cn';
import { PressableScale } from './Motion';
import { GradientHero, IconTile } from './Surfaces';
import { colors, shadows, motion } from '../theme/tokens';

/*
 * Phase-B building blocks: gradient screen header, step progress, status timeline and action tiles.
 * Same names/props on web (frontend/src/mobile/ui/Blocks.jsx). Reanimated components get `style` only.
 */

/**
 * Gradient header for stack screens (Account, Wallet, Trip…). Put it first in a `<Screen tone="hero">`
 * so the status bar area matches. `compact` puts the title in the top bar; otherwise it sits below
 * as a large title. `children` render under the title (balance, avatar row, stepper…).
 */
export function HeroHeader({ title, subtitle, eyebrow, back = true, onBack, right, compact, children, className, rounded = true }) {
  const nav = useNavigation();
  return (
    <GradientHero angle="vertical" rounded={rounded} className={cn('px-4 pb-6', className)}>
      <View className="h-14 flex-row items-center">
        {back ? <IconButton icon={ArrowLeft} tone="inverse" label="Go back" onPress={onBack || (() => nav.goBack())} className="bg-white/15 active:bg-white/25" /> : null}
        <View className={cn('flex-1', back && 'ml-2')}>
          {compact && title ? <T variant="headline" tone="inverse" numberOfLines={1} accessibilityRole="header">{title}</T> : null}
          {compact && subtitle ? <T variant="caption" className="text-white/75" numberOfLines={1}>{subtitle}</T> : null}
        </View>
        {right ? <View className="flex-row items-center">{right}</View> : null}
      </View>
      {!compact ? (
        <View className="mt-1">
          {eyebrow ? <T variant="overline" className="mb-1 text-accent-200" style={{ color: colors.accent[200] }}>{eyebrow}</T> : null}
          {title ? <T variant="title" tone="inverse" accessibilityRole="header">{title}</T> : null}
          {subtitle ? <T variant="bodySm" className="mt-1 text-white/80">{subtitle}</T> : null}
        </View>
      ) : null}
      {children}
    </GradientHero>
  );
}

function StepBar({ filled, hidden, inverse, reduce }) {
  const [w, setW] = useState(0);
  const p = useSharedValue(filled ? 1 : 0);
  useEffect(() => { p.value = reduce ? (filled ? 1 : 0) : withTiming(filled ? 1 : 0, { duration: motion.slow, easing: Easing.out(Easing.cubic) }); }, [filled, reduce, p]);
  const fill = useAnimatedStyle(() => ({ width: p.value * w }));
  if (hidden) return <View style={{ flex: 1 }} />;
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: inverse ? 'rgba(255,255,255,0.22)' : colors.ink[200] }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ height: 3, backgroundColor: inverse ? '#FFFFFF' : colors.brand[500] }, fill]} />
    </View>
  );
}

/**
 * Numbered step progress (KYC, pickup/return inspection, profile setup).
 * steps: string[]; current: index of the active step (steps before it show a check).
 */
export function StepProgress({ steps, current, tone = 'default', className }) {
  const reduce = useReducedMotion();
  const inv = tone === 'inverse';
  return (
    <View className={cn('flex-row', className)} accessibilityRole="progressbar" accessibilityLabel={`Step ${Math.min(current, steps.length - 1) + 1} of ${steps.length}: ${steps[Math.min(current, steps.length - 1)]}`}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const node = done
          ? { bg: inv ? '#FFFFFF' : colors.brand[500], border: 'transparent' }
          : active
            ? { bg: inv ? 'rgba(255,255,255,0.18)' : colors.brand[50], border: inv ? '#FFFFFF' : colors.brand[500] }
            : { bg: inv ? 'rgba(255,255,255,0.10)' : colors.ink[100], border: 'transparent' };
        const numColor = active ? (inv ? '#FFFFFF' : colors.brand[700]) : inv ? 'rgba(255,255,255,0.7)' : colors.ink[500];
        return (
          <View key={s} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <StepBar hidden={i === 0} filled={i <= current} inverse={inv} reduce={reduce} />
              <Animated.View key={done ? 'd' : active ? 'a' : 't'} entering={reduce || !(done || active) ? undefined : ZoomIn.springify().damping(14)}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: node.bg, borderWidth: 2, borderColor: node.border }}>
                  {done ? <Check size={15} color={inv ? colors.brand[600] : '#FFFFFF'} strokeWidth={3} /> : <T variant="caption" className="font-extrabold" style={{ color: numColor }}>{i + 1}</T>}
                </View>
              </Animated.View>
              <StepBar hidden={i === steps.length - 1} filled={i < current} inverse={inv} reduce={reduce} />
            </View>
            <T variant="caption" numberOfLines={1} className={cn('mt-1.5 px-1 text-center', active || done ? 'font-bold' : 'font-medium')} style={{ color: inv ? (active || done ? '#FFFFFF' : 'rgba(255,255,255,0.7)') : active ? colors.ink[900] : done ? colors.brand[700] : colors.ink[500] }}>{s}</T>
          </View>
        );
      })}
    </View>
  );
}

function PulseDot({ color, reduce }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return undefined;
    p.value = withDelay(500, withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), 3, false));
    return () => cancelAnimation(p);
  }, [reduce, p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.2 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: color }, ring]} />;
}

const TL = {
  done: { dot: colors.brand[500], line: colors.brand[300] },
  current: { dot: colors.accent[500], line: colors.ink[200] },
  todo: { dot: colors.ink[300], line: colors.ink[200] },
  stopped: { dot: colors.danger[500], line: colors.ink[200] },
};
/**
 * Vertical status timeline. items: [{ key, title, subtitle?, state: 'done'|'current'|'todo'|'stopped' }].
 * The current step's dot pulses three times, then rests.
 */
export function Timeline({ items, className }) {
  const reduce = useReducedMotion();
  return (
    <View className={className}>
      {items.map((it, i) => {
        const t = TL[it.state] || TL.todo;
        const last = i === items.length - 1;
        return (
          <View key={it.key || it.title} style={{ flexDirection: 'row' }}>
            <View style={{ width: 22, alignItems: 'center' }}>
              <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                {it.state === 'current' ? <PulseDot color={t.dot} reduce={reduce} /> : null}
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: it.state === 'todo' ? colors.surface : t.dot, borderWidth: 2, borderColor: t.dot, alignItems: 'center', justifyContent: 'center' }}>
                  {it.state === 'done' ? <Check size={8} color="#fff" strokeWidth={4} /> : null}
                </View>
              </View>
              {!last ? <View style={{ flex: 1, width: 2, borderRadius: 1, marginVertical: 3, backgroundColor: t.line, minHeight: 14 }} /> : null}
            </View>
            <View className={cn('ml-3 flex-1', !last && 'pb-4')}>
              <T variant="label" className={cn(it.state === 'todo' ? 'text-ink-500' : it.state === 'stopped' ? 'text-danger-700' : 'text-ink-900', it.state === 'current' && 'font-extrabold')}>{it.title}</T>
              {it.subtitle ? <T variant="caption" tone="subtle" className="mt-0.5">{it.subtitle}</T> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Square quick-action tile (icon + label) for action grids: "Start pickup", "Roadside help"…
 * Lay several out in a `flex-row` — each tile takes an equal share.
 */
export function ActionTile({ icon, label, caption, onPress, tone = 'brand', disabled, testID, accessibilityLabel, className }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      containerStyle={{ flex: 1 }}
      className={cn('min-h-[96px] items-center justify-center rounded-2xl bg-surface px-2 py-3', disabled && 'opacity-50', className)}
      style={{ boxShadow: shadows.card }}
    >
      <IconTile icon={icon} tone={tone} size={40} />
      <T variant="label" className="mt-2 text-center" numberOfLines={2}>{label}</T>
      {caption ? <T variant="caption" tone="subtle" className="text-center" numberOfLines={1}>{caption}</T> : null}
    </PressableScale>
  );
}

import { useCallback, useEffect, useId, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, Line } from 'react-native-svg';
import Animated, { FadeInDown, FadeOut, LinearTransition, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSpring, withDelay, Easing, useReducedMotion, cancelAnimation } from 'react-native-reanimated';
import { ChevronDown, ChevronRight, Copy, Check, TicketPercent } from 'lucide-react-native';
import { T } from './Text';
import { cn } from './cn';
import { PressableScale } from './Motion';
import { colors, gradients, shadows, motion } from '../theme/tokens';

const svgId = (id) => `g${id.replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Measures its absolute-fill box and reports exact pixel sizes. On Android, react-native-svg resolves
 * percentage sizes once and doesn't repaint them after a relayout (the hero gradient stopped short of
 * the right/bottom edge and left stale rectangles), so every full-bleed SVG layer is drawn at a
 * measured, numeric size and re-mounted when that size changes.
 */
export function useBoxSize() {
  const [box, setBox] = useState(null);
  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
  }, []);
  return [box, onLayout];
}

/** Absolute-fill SVG layer at the measured pixel size. `children` may be a function of { w, h }. */
export function FillSvg({ children, viewBox, preserveAspectRatio, style }) {
  const [box, onLayout] = useBoxSize();
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none" onLayout={onLayout}>
      {box && box.w > 0 && box.h > 0 ? (
        <Svg key={`${box.w}x${box.h}`} width={box.w} height={box.h} viewBox={viewBox || `0 0 ${box.w} ${box.h}`} preserveAspectRatio={preserveAspectRatio}>
          {typeof children === 'function' ? children(box) : children}
        </Svg>
      ) : null}
    </View>
  );
}

/** Fills its (relative) parent with a linear gradient. `angle`: 'diagonal' | 'horizontal' | 'vertical'. */
export function GradientFill({ stops = gradients.brand, angle = 'diagonal', opacity = 1 }) {
  const id = svgId(useId());
  const v = angle === 'horizontal' ? { x1: '0', y1: '0', x2: '1', y2: '0' } : angle === 'vertical' ? { x1: '0', y1: '0', x2: '0', y2: '1' } : { x1: '0', y1: '0', x2: '1', y2: '1' };
  // The base colour shows for the one frame before the layer is measured (no flash of white).
  return (
    <FillSvg style={opacity === 1 ? { backgroundColor: stops[Math.floor(stops.length / 2)] } : null}>
      {({ w, h }) => (
        <>
          <Defs>
            <LinearGradient id={id} {...v}>
              {stops.map((c, i) => <Stop key={i} offset={`${(i / Math.max(1, stops.length - 1)) * 100}%`} stopColor={c} stopOpacity={opacity} />)}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={w} height={h} fill={`url(#${id})`} />
        </>
      )}
    </FillSvg>
  );
}

/** Brand gradient backdrop with soft shapes and a dashed "road" — for hero headers. */
export function GradientHero({ children, className, style, rounded = true, angle = 'diagonal' }) {
  return (
    <View className={cn('relative overflow-hidden bg-brand-600', rounded && 'rounded-b-3xl', className)} style={style}>
      <GradientFill stops={gradients.hero} angle={angle} />
      <FillSvg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Circle cx="360" cy="30" r="120" fill="#FFFFFF" fillOpacity="0.06" />
        <Circle cx="360" cy="30" r="70" fill="#FFFFFF" fillOpacity="0.05" />
        <Circle cx="20" cy="250" r="90" fill="#1BA4C4" fillOpacity="0.22" />
        <Path d="M-20 270 C 90 220, 170 300, 260 240 S 400 200, 430 230" stroke="#FFFFFF" strokeOpacity="0.10" strokeWidth="26" fill="none" />
        <Path d="M-20 270 C 90 220, 170 300, 260 240 S 400 200, 430 230" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="8 10" fill="none" />
      </FillSvg>
      {children}
    </View>
  );
}

/** Elevated white surface (rounded-2xl + soft shadow). Use instead of bordered Panels on redesigned screens. */
export function Card({ children, className, style, flat }) {
  return (
    <View className={cn('rounded-2xl bg-surface', flat && 'border border-line', className)} style={[!flat && { boxShadow: shadows.card }, style]}>
      {children}
    </View>
  );
}

/** Horizontal dashed rule (works on Android, where single-side dashed borders don't). Drawn at the measured width. */
export function DashedDivider({ color = colors.ink[200], dash = '6 5', thickness = 1.25, className }) {
  const [box, onLayout] = useBoxSize();
  return (
    <View className={cn('w-full', className)} style={{ height: thickness }} pointerEvents="none" onLayout={onLayout}>
      {box && box.w > 0 ? (
        <Svg key={box.w} width={box.w} height={thickness}>
          <Line x1="0" y1={thickness / 2} x2={box.w} y2={thickness / 2} stroke={color} strokeWidth={thickness} strokeDasharray={dash} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Section title row with optional eyebrow, subtitle and a "See all" style action. */
export function SectionHeader({ title, subtitle, eyebrow, actionLabel = 'See all', onAction, className, tone = 'default' }) {
  return (
    <View className={cn('mb-3 flex-row items-end justify-between px-4', className)}>
      <View className="mr-3 flex-1">
        {eyebrow ? <T variant="overline" tone={tone === 'inverse' ? 'inverse' : 'brand'} className="mb-0.5">{eyebrow}</T> : null}
        <T variant="headline" tone={tone} accessibilityRole="header">{title}</T>
        {subtitle ? <T variant="caption" tone={tone === 'inverse' ? 'inverse' : 'subtle'} className="mt-0.5">{subtitle}</T> : null}
      </View>
      {onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${title}`} className="-mb-2.5 min-h-[44px] flex-row items-center justify-center rounded-full pl-3 active:opacity-60">
          <T variant="label" tone={tone === 'inverse' ? 'inverse' : 'brand'}>{actionLabel}</T>
          <ChevronRight size={16} color={tone === 'inverse' ? '#fff' : colors.brand[600]} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

const SPEC_TONE = {
  neutral: { box: 'bg-ink-50 border border-ink-100', text: 'text-ink-700', icon: colors.ink[600] },
  brand: { box: 'bg-brand-50 border border-brand-100', text: 'text-brand-700', icon: colors.brand[600] },
  solid: { box: 'bg-brand-500', text: 'text-white', icon: '#FFFFFF' },
  inverse: { box: 'bg-white/15 border border-white/25', text: 'text-white', icon: '#FFFFFF' },
  success: { box: 'bg-success-50 border border-success-100', text: 'text-success-700', icon: colors.success[600] },
};
/** Small non-interactive spec chip with an icon: "5 seats", "Automatic", "Petrol". */
export function SpecChip({ icon: Icon, label, tone = 'neutral', className }) {
  const t = SPEC_TONE[tone] || SPEC_TONE.neutral;
  return (
    <View className={cn('mb-1.5 mr-1.5 h-7 flex-row items-center rounded-full px-2.5', t.box, className)}>
      {Icon ? <Icon size={13} color={t.icon} strokeWidth={2.2} /> : null}
      <T variant="caption" className={cn('font-semibold', Icon && 'ml-1', t.text)} numberOfLines={1}>{label}</T>
    </View>
  );
}

const TILE = {
  brand: ['bg-brand-50', colors.brand[600]], accent: ['bg-accent-50', colors.accent[600]], success: ['bg-success-50', colors.success[600]],
  warning: ['bg-warning-50', colors.warning[600]], danger: ['bg-danger-50', colors.danger[600]], neutral: ['bg-ink-100', colors.ink[700]], inverse: ['bg-white/15', '#FFFFFF'],
};
/** Rounded square icon holder (feature lists, value props, summary rows). */
export function IconTile({ icon: Icon, tone = 'brand', size = 44, className }) {
  const [bg, fg] = TILE[tone] || TILE.brand;
  return (
    <View className={cn('items-center justify-center rounded-xl', bg, className)} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.47)} color={fg} strokeWidth={2} />
    </View>
  );
}

/**
 * Coupon ticket: gradient stub with the offer value and code, scalloped top edge, perforation with
 * side notches, body copy and a "Copy code" action. `notchColor` must match the page background.
 */
export function TicketCard({ value, code, title, description, meta, onCopy, onPress, width, notchColor = colors.canvas, className, testID }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const Box = onPress ? PressableScale : View;
  return (
    <Box onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} className={cn('rounded-2xl bg-surface', className)} style={[{ boxShadow: shadows.card }, width ? { width } : null]} testID={testID}>
      <View className="overflow-hidden rounded-2xl">
        <View className="relative h-[92px] justify-center px-4">
          <GradientFill stops={gradients.deep} />
          <View className="absolute left-0 right-0 flex-row justify-around" style={{ top: -6 }} pointerEvents="none">
            {Array.from({ length: 7 }, (_, i) => <View key={i} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: notchColor }} />)}
          </View>
          <View className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-white/15"><TicketPercent size={22} color="#fff" strokeWidth={2} /></View>
            <View className="ml-3 flex-1">
              {value ? <T variant="title" tone="inverse" numberOfLines={1}>{value}</T> : null}
              <View className="mt-1 flex-row">
                <View className="rounded-md border border-dashed border-white/60 bg-white/10 px-2 py-0.5"><T variant="label" tone="inverse" className="tracking-widest">{code}</T></View>
              </View>
            </View>
          </View>
        </View>
        <View className="relative h-4 justify-center px-3">
          <DashedDivider color={colors.ink[200]} dash="5 5" />
          <View className="absolute h-4 w-4 rounded-full" style={{ left: -8, backgroundColor: notchColor }} />
          <View className="absolute h-4 w-4 rounded-full" style={{ right: -8, backgroundColor: notchColor }} />
        </View>
        <View className="px-4 pb-1">
          <T variant="body" className="font-bold" numberOfLines={2}>{title}</T>
          {description ? <T variant="caption" tone="muted" className="mt-0.5" numberOfLines={2}>{description}</T> : null}
          {meta ? <T variant="caption" tone="subtle" className="mt-1.5" numberOfLines={2}>{meta}</T> : null}
        </View>
        {onCopy ? (
          <Pressable onPress={() => { onCopy(code); setCopied(true); }} accessibilityRole="button" accessibilityLabel={`Copy code ${code}`} className="mt-2 h-12 flex-row items-center justify-center border-t border-line active:bg-ink-50">
            {copied ? <Check size={16} color={colors.success[600]} strokeWidth={2.6} /> : <Copy size={15} color={colors.brand[600]} strokeWidth={2.2} />}
            <T variant="label" className={cn('ml-1.5', copied ? 'text-success-700' : 'text-brand-700')}>{copied ? 'Copied' : 'Copy code'}</T>
          </Pressable>
        ) : <View className="h-3" />}
      </View>
    </Box>
  );
}

/** FAQ-style expanding list. items: [{ id, title, content }]. One item open at a time. */
export function Accordion({ items, className, defaultOpen = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn('mx-4 px-4', className)}>
      {items.map((it, i) => <AccordionItem key={it.id} item={it} open={open === it.id} last={i === items.length - 1} onToggle={() => setOpen(open === it.id ? null : it.id)} />)}
    </Card>
  );
}

function AccordionItem({ item, open, last, onToggle }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => { r.value = reduce ? (open ? 1 : 0) : withSpring(open ? 1 : 0, motion.spring); }, [open, r, reduce]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 180}deg` }] }));
  return (
    <Animated.View layout={reduce ? undefined : LinearTransition.duration(motion.base)}>
      <View className={cn(!last && 'border-b border-line')}>
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} className="min-h-[56px] flex-row items-center py-3.5">
          <T variant="label" className="flex-1 pr-3 text-[14px]">{item.title}</T>
          <Animated.View style={chevron}><ChevronDown size={18} color={open ? colors.brand[600] : colors.ink[500]} strokeWidth={2.2} /></Animated.View>
        </Pressable>
        {open ? (
          <Animated.View entering={reduce ? undefined : FadeInDown.duration(motion.base)} exiting={reduce ? undefined : FadeOut.duration(motion.fast)}>
            <T variant="bodySm" tone="muted" className="pb-4">{item.content}</T>
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * Floating round action button (e.g. call support), bottom-right by default. Springs in and
 * sends out a soft pulse ring a few times to draw the eye (skipped with reduce motion).
 */
export function FAB({ icon: Icon, onPress, label, className, style, pulse = true, testID }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!pulse || reduce) return undefined;
    p.value = withDelay(900, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), 4, false));
    return () => cancelAnimation(p);
  }, [pulse, reduce, p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.6 }] }));
  return (
    <View pointerEvents="box-none" className={cn('absolute bottom-5 right-4', className)} style={style}>
      <Animated.View entering={reduce ? undefined : ZoomIn.delay(400).springify().damping(14)}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent[400] }, ring]} />
        <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} scaleTo={0.92} containerStyle={{ borderRadius: 28, boxShadow: shadows.brand }} className="h-14 w-14 items-center justify-center overflow-hidden rounded-full">
          <GradientFill stops={gradients.brand} />
          <Icon size={24} color="#fff" strokeWidth={2.2} />
        </PressableScale>
      </Animated.View>
    </View>
  );
}


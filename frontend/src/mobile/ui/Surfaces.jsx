import { useCallback, useEffect, useId, useState } from 'react';
import { View, Pressable } from '../rn';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, Line } from '../svg';
import { ChevronDown, ChevronRight, Copy, Check, TicketPercent } from 'lucide-react';
import { T } from './Text';
import { cn } from './cn';
import { PressableScale } from './Motion';
import { colors, gradients, shadows } from '@shared/theme/tokens';
import './kit.css';

/* Web port of apps/shared/native/Surfaces.jsx — same names, props and artwork. */

const svgId = (id) => `g${id.replace(/[^a-zA-Z0-9]/g, '')}`;
const FILL = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' };

/** Measured box size via onLayout (API twin of native; web SVGs could use % sizes, native can't). */
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
    <View style={[FILL, style]} pointerEvents="none" onLayout={onLayout}>
      {box && box.w > 0 && box.h > 0 ? (
        <Svg width={box.w} height={box.h} viewBox={viewBox || `0 0 ${box.w} ${box.h}`} preserveAspectRatio={preserveAspectRatio}>
          {typeof children === 'function' ? children(box) : children}
        </Svg>
      ) : null}
    </View>
  );
}

export function GradientFill({ stops = gradients.brand, angle = 'diagonal', opacity = 1 }) {
  const id = svgId(useId());
  const v = angle === 'horizontal' ? { x1: '0', y1: '0', x2: '1', y2: '0' } : angle === 'vertical' ? { x1: '0', y1: '0', x2: '0', y2: '1' } : { x1: '0', y1: '0', x2: '1', y2: '1' };
  return (
    <Svg style={FILL} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} {...v}>
          {stops.map((c, i) => <Stop key={i} offset={`${(i / Math.max(1, stops.length - 1)) * 100}%`} stopColor={c} stopOpacity={opacity} />)}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function GradientHero({ children, className, style, rounded = true, angle = 'diagonal' }) {
  return (
    <View className={cn('relative overflow-hidden bg-brand-600', rounded && 'rounded-b-3xl', className)} style={style}>
      <GradientFill stops={gradients.hero} angle={angle} />
      <Svg style={FILL} width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Circle cx="360" cy="30" r="120" fill="#FFFFFF" fillOpacity="0.06" />
        <Circle cx="360" cy="30" r="70" fill="#FFFFFF" fillOpacity="0.05" />
        <Circle cx="20" cy="250" r="90" fill="#1BA4C4" fillOpacity="0.22" />
        <Path d="M-20 270 C 90 220, 170 300, 260 240 S 400 200, 430 230" stroke="#FFFFFF" strokeOpacity="0.10" strokeWidth="26" fill="none" />
        <Path d="M-20 270 C 90 220, 170 300, 260 240 S 400 200, 430 230" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="8 10" fill="none" />
      </Svg>
      {children}
    </View>
  );
}

export function Card({ children, className, style, flat }) {
  return (
    <View className={cn('rounded-2xl bg-surface', flat && 'border border-line', className)} style={[!flat && { boxShadow: shadows.card }, style]}>
      {children}
    </View>
  );
}

export function DashedDivider({ color = colors.ink[200], dash = '6 5', thickness = 1.25, className }) {
  return (
    <View className={cn('w-full', className)} style={{ height: thickness }} pointerEvents="none">
      <Svg width="100%" height={thickness}>
        <Line x1="0" y1={thickness / 2} x2="100%" y2={thickness / 2} stroke={color} strokeWidth={thickness} strokeDasharray={dash} />
      </Svg>
    </View>
  );
}

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
export function IconTile({ icon: Icon, tone = 'brand', size = 44, className }) {
  const [bg, fg] = TILE[tone] || TILE.brand;
  return (
    <View className={cn('items-center justify-center rounded-xl', bg, className)} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.47)} color={fg} strokeWidth={2} />
    </View>
  );
}

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

export function Accordion({ items, className, defaultOpen = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn('mx-4 px-4', className)}>
      {items.map((it, i) => <AccordionItem key={it.id} item={it} open={open === it.id} last={i === items.length - 1} onToggle={() => setOpen(open === it.id ? null : it.id)} />)}
    </Card>
  );
}

function AccordionItem({ item, open, last, onToggle }) {
  return (
    <View className={cn(!last && 'border-b border-line')}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} className="min-h-[56px] flex-row items-center py-3.5">
        <T variant="label" className="flex-1 pr-3 text-[14px]">{item.title}</T>
        <View className="w2c-rotate" style={{ transform: open ? 'rotate(180deg)' : 'none' }}><ChevronDown size={18} color={open ? colors.brand[600] : colors.ink[500]} strokeWidth={2.2} /></View>
      </Pressable>
      <div className="w2c-acc-body" data-open={open ? 'true' : 'false'} aria-hidden={!open}>
        <div>
          <T variant="bodySm" tone="muted" className="pb-4">{item.content}</T>
        </div>
      </div>
    </View>
  );
}

export function FAB({ icon: Icon, onPress, label, className, style, pulse = true, testID }) {
  return (
    <View pointerEvents="box-none" className={cn('absolute bottom-5 right-4 z-30', className)} style={style}>
      <View className="w2c-zoom-in">
        {pulse ? <View pointerEvents="none" className="w2c-pulse" style={{ position: 'absolute', left: 0, top: 0, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent[400] }} /> : null}
        <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} scaleTo={0.92} containerStyle={{ borderRadius: 28, boxShadow: shadows.brand }} className="h-14 w-14 items-center justify-center overflow-hidden rounded-full">
          <GradientFill stops={gradients.brand} />
          <Icon size={24} color="#fff" strokeWidth={2.2} style={{ position: 'relative' }} />
        </PressableScale>
      </View>
    </View>
  );
}

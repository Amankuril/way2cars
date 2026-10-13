import { useState } from 'react';
import { View } from '../rn';
import Svg, { Path, Circle, Rect, Line, G, Ellipse } from '../svg';
import { ChevronRight } from 'lucide-react';
import { T } from './Text';
import { cn } from './cn';
import { GradientFill, DashedDivider } from './Surfaces';
import { colors } from '@shared/theme/tokens';
import './kit.css';

/* Web port of apps/shared/native/Scenes.jsx — identical SVG art; loops are CSS keyframes (kit.css). */

const SCENE_H = 150;
const ROAD_H = 34;
const MAX_W = 520;

function Strip({ tile, height, bottom, top, duration, children }) {
  const count = Math.ceil(MAX_W / tile) + 1;
  return (
    <View pointerEvents="none" className="w2c-strip" style={{ position: 'absolute', left: 0, width: tile * count, height, bottom, top, '--tile': `${tile}px`, '--dur': `${duration}ms` }}>
      <Svg width={tile * count} height={height}>
        {Array.from({ length: count }, (_, i) => <G key={i} transform={`translate(${i * tile}, 0)`}>{children}</G>)}
      </Svg>
    </View>
  );
}

function Wheel({ left, top, still }) {
  return (
    <View className={still ? undefined : 'w2c-wheel'} style={{ position: 'absolute', left, top, width: 20, height: 20 }}>
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Circle cx="10" cy="10" r="9.5" fill={colors.ink[900]} />
        <Circle cx="10" cy="10" r="5.5" fill={colors.ink[300]} />
        <Line x1="10" y1="4.5" x2="10" y2="15.5" stroke={colors.ink[600]} strokeWidth="1.4" />
        <Line x1="4.5" y1="10" x2="15.5" y2="10" stroke={colors.ink[600]} strokeWidth="1.4" />
        <Circle cx="10" cy="10" r="1.8" fill={colors.ink[700]} />
      </Svg>
    </View>
  );
}

export function CarArt({ still }) {
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
      <Wheel left={24} top={38} still={still} />
      <Wheel left={90} top={38} still={still} />
    </View>
  );
}

export function CarLoader({ title = 'Finding the best rides…', subtitle, children, className, testID }) {
  return (
    <View className={cn('mx-4 overflow-hidden rounded-3xl bg-surface', className)} style={{ boxShadow: '0px 12px 32px -12px rgba(14, 23, 27, 0.24)' }} testID={testID} accessibilityRole="progressbar" accessibilityLabel={title}>
      <View style={{ height: SCENE_H, overflow: 'hidden' }}>
        <GradientFill stops={[colors.brand[50], '#FFFFFF']} angle="vertical" />
        <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height={SCENE_H}>
          <Circle cx="82%" cy="34" r="18" fill={colors.accent[100]} />
          <Circle cx="82%" cy="34" r="11" fill={colors.accent[200]} />
        </Svg>
        <Strip tile={260} height={26} top={14} duration={22000}>
          <Path d="M20 18 a8 8 0 0 1 14 -6 a10 10 0 0 1 18 2 a7 7 0 0 1 4 12 h-36 a6 6 0 0 1 0 -8 z" fill="#FFFFFF" />
          <Path d="M150 12 a6 6 0 0 1 11 -4 a8 8 0 0 1 14 2 a5 5 0 0 1 3 9 h-28 a5 5 0 0 1 0 -7 z" fill="#FFFFFF" fillOpacity="0.9" />
        </Strip>
        <Strip tile={240} height={58} bottom={ROAD_H} duration={12000}>
          <Rect x="6" y="22" width="22" height="36" rx="2" fill={colors.brand[100]} />
          <Rect x="30" y="8" width="18" height="50" rx="2" fill={colors.brand[200]} fillOpacity="0.7" />
          <Rect x="52" y="30" width="26" height="28" rx="2" fill={colors.brand[100]} />
          <Rect x="96" y="14" width="16" height="44" rx="2" fill={colors.accent[100]} />
          <Rect x="114" y="26" width="30" height="32" rx="2" fill={colors.brand[100]} />
          <Rect x="160" y="4" width="20" height="54" rx="2" fill={colors.brand[200]} fillOpacity="0.6" />
          <Rect x="184" y="28" width="24" height="30" rx="2" fill={colors.accent[100]} />
          <Rect x="212" y="18" width="20" height="40" rx="2" fill={colors.brand[100]} />
        </Strip>
        <Strip tile={170} height={44} bottom={ROAD_H - 2} duration={4200}>
          <Rect x="28" y="26" width="3" height="18" fill={colors.ink[400]} />
          <Circle cx="29.5" cy="20" r="11" fill={colors.accent[500]} fillOpacity="0.85" />
          <Rect x="118" y="30" width="3" height="14" fill={colors.ink[400]} />
          <Circle cx="119.5" cy="26" r="8" fill={colors.success[500]} fillOpacity="0.75" />
        </Strip>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: ROAD_H, backgroundColor: colors.ink[800] }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: ROAD_H - 3, height: 3, backgroundColor: colors.ink[600] }} />
        <Strip tile={56} height={4} bottom={ROAD_H / 2 - 2} duration={520}>
          <Rect x="0" y="0" width="28" height="3.5" rx="1.75" fill="#FFFFFF" fillOpacity="0.85" />
        </Strip>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: ROAD_H / 2 - 4, alignItems: 'center' }} pointerEvents="none">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View className="w2c-speed" style={{ marginRight: 4 }}>
              <Svg width={30} height={26}>
                <Line x1="4" y1="6" x2="28" y2="6" stroke={colors.brand[300]} strokeWidth="2.5" strokeLinecap="round" />
                <Line x1="12" y1="14" x2="28" y2="14" stroke={colors.accent[400]} strokeWidth="2.5" strokeLinecap="round" />
                <Line x1="0" y1="22" x2="24" y2="22" stroke={colors.brand[200]} strokeWidth="2.5" strokeLinecap="round" />
              </Svg>
            </View>
            <View className="w2c-bob"><CarArt /></View>
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

export function TripRoute({ start, end, label, animated, className }) {
  const [w, setW] = useState(0);
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
          {animated && w ? <View pointerEvents="none" className="w2c-travel" style={{ position: 'absolute', left: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent[500], '--dist': `${Math.max(0, w - 8)}px` }} /> : null}
        </View>
      </View>
      <End v={end} right />
    </View>
  );
}

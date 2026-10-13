import { View } from '@/mobile/rn';
import Svg, { Path, Circle, Line } from '@/mobile/svg';
import { colors } from '@shared/theme/tokens';

const W = 220;
const H = 122;
const CX = W / 2;
const CY = 110;
const R = 92;
const SEGMENTS = 8;
const GAP = 0.035; // radians between segments

const pt = (a, r = R) => [CX + r * Math.cos(a), CY - r * Math.sin(a)];
const arc = (a1, a2) => {
  const [x1, y1] = pt(a1);
  const [x2, y2] = pt(a2);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const angleOf = (f) => Math.PI - Math.max(0, Math.min(1, f)) * Math.PI;

/**
 * Half-dial fuel / battery gauge (display only — the input stays the level picker below it).
 * `value`: 0..1 or null (no reading yet). `marker`: optional 0..1 reference (e.g. the level at pickup).
 */
export function FuelGauge({ value, marker }) {
  const has = value !== null && value !== undefined && !Number.isNaN(value);
  const filled = has ? Math.round(value * SEGMENTS) : 0;
  const tint = !has ? colors.ink[300] : value <= 0.125 ? colors.danger[500] : value <= 0.25 ? colors.warning[500] : colors.brand[500];
  const needle = angleOf(has ? value : 0);
  const [nx, ny] = pt(needle, R - 26);
  const markerAngle = marker === null || marker === undefined ? null : angleOf(marker);
  return (
    <View style={{ width: W, height: H }} pointerEvents="none">
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const a1 = Math.PI - (i / SEGMENTS) * Math.PI - (i === 0 ? 0 : GAP / 2);
          const a2 = Math.PI - ((i + 1) / SEGMENTS) * Math.PI + (i === SEGMENTS - 1 ? 0 : GAP / 2);
          return <Path key={i} d={arc(a1, a2)} stroke={i < filled ? tint : colors.ink[100]} strokeWidth={14} strokeLinecap="butt" fill="none" />;
        })}
        {[0.25, 0.5, 0.75].map((f) => {
          const a = angleOf(f);
          const [x1, y1] = pt(a, R - 12);
          const [x2, y2] = pt(a, R - 18);
          return <Line key={f} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.ink[300]} strokeWidth={2} strokeLinecap="round" />;
        })}
        {markerAngle !== null ? (() => {
          const [x1, y1] = pt(markerAngle, R + 11);
          const [x2, y2] = pt(markerAngle, R - 11);
          return <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.ink[700]} strokeWidth={2.5} strokeDasharray="3 2.5" strokeLinecap="round" />;
        })() : null}
        {has ? <Line x1={CX} y1={CY} x2={nx} y2={ny} stroke={colors.ink[900]} strokeWidth={3.5} strokeLinecap="round" /> : null}
        <Circle cx={CX} cy={CY} r={9} fill={has ? colors.ink[900] : colors.ink[200]} />
        <Circle cx={CX} cy={CY} r={3.5} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

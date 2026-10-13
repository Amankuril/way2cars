/**
 * `react-native-svg` on the DOM: same component names and props, rendered as inline SVG.
 * Port `import Svg, { Path, Circle } from 'react-native-svg'` → `from '@/mobile/svg'`.
 * React DOM already accepts the camelCase SVG attributes (strokeWidth, stopColor, strokeDasharray…).
 */
import { forwardRef } from 'react';
import { flattenStyle } from './rn';

const clean = ({ style, testID, accessibilityLabel, ...rest }) => ({
  ...rest,
  style: flattenStyle(style),
  ...(testID ? { 'data-testid': testID } : null),
  ...(accessibilityLabel ? { 'aria-label': accessibilityLabel, role: 'img' } : { 'aria-hidden': true }),
});

const Svg = forwardRef(function Svg({ children, width, height, viewBox, preserveAspectRatio, className, ...rest }, ref) {
  return (
    <svg ref={ref} width={width} height={height} viewBox={viewBox} preserveAspectRatio={preserveAspectRatio} className={className} {...clean(rest)} style={{ display: 'block', overflow: 'visible', flexShrink: 0, ...flattenStyle(rest.style) }}>
      {children}
    </svg>
  );
});

const el = (Tag) => forwardRef(function SvgEl(props, ref) {
  return <Tag ref={ref} {...clean(props)} />;
});

export default Svg;
export { Svg };
export const Path = el('path');
export const Circle = el('circle');
export const Rect = el('rect');
export const Line = el('line');
export const Ellipse = el('ellipse');
export const Polygon = el('polygon');
export const Polyline = el('polyline');
export const G = el('g');
export const Defs = el('defs');
export const LinearGradient = el('linearGradient');
export const RadialGradient = el('radialGradient');
export const Stop = el('stop');
export const ClipPath = el('clipPath');
export const Pattern = el('pattern');

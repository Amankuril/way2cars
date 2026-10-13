/** Tailwind preset shared by the native apps (NativeWind) and the admin web app. */
const { colors, type, radius, shadows } = require('./tokens');

const fontSize = Object.fromEntries(
  Object.entries(type).map(([k, [size, line, weight]]) => [k, [`${size}px`, { lineHeight: `${line}px`, fontWeight: weight }]]),
);

module.exports = {
  theme: {
    extend: {
      colors,
      fontSize,
      borderRadius: Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, `${v}px`])),
      // Web only (admin/landing); native screens use style={{ boxShadow: shadows.x }} instead.
      boxShadow: shadows,
      fontFamily: { sans: ['Manrope', 'system-ui', 'sans-serif'] },
    },
  },
};

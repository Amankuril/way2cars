/** Tailwind preset shared by the native apps (NativeWind) and the admin web app. */
const { colors, type, radius } = require('./tokens');

const fontSize = Object.fromEntries(
  Object.entries(type).map(([k, [size, line, weight]]) => [k, [`${size}px`, { lineHeight: `${line}px`, fontWeight: weight }]]),
);

module.exports = {
  theme: {
    extend: {
      colors,
      fontSize,
      borderRadius: { sm: `${radius.sm}px`, md: `${radius.md}px`, lg: `${radius.lg}px`, xl: `${radius.xl}px` },
      fontFamily: { sans: ['Manrope', 'system-ui', 'sans-serif'] },
    },
  },
};

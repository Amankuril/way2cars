/**
 * WAY2CARS design tokens, derived from the logo: charcoal wordmark (#1D2C32), blue→cyan
 * "technology" strokes (#1875B9 → #1BA4C4) and a light, airy background.
 * Single source for the Tailwind preset (all apps) and for JS that needs raw values
 * (navigation themes, status bar, charts, map markers).
 */
const colors = {
  ink: {
    950: '#0E171B', 900: '#1D2C32', 800: '#2B3B42', 700: '#3E4F57', 600: '#56666E',
    500: '#728189', 400: '#98A5AC', 300: '#C3CCD1', 200: '#DDE3E7', 100: '#EDF1F4', 50: '#F5F8FA',
  },
  brand: {
    50: '#EAF3FA', 100: '#D3E6F4', 200: '#A8CDE9', 300: '#74AFDA', 400: '#3F8FC9',
    500: '#1875B9', 600: '#12609A', 700: '#0F4D7B', 800: '#0D3D60', 900: '#0A2E48',
  },
  accent: { 50: '#E8F7FB', 100: '#C9EDF5', 200: '#9CDDEB', 300: '#6FCCE0', 400: '#3FB7D2', 500: '#1BA4C4', 600: '#158AA6', 700: '#127189' },
  success: { 50: '#E7F5EF', 100: '#C8E9DA', 500: '#1B9468', 600: '#12805C', 700: '#0E6449' },
  warning: { 50: '#FDF3E4', 100: '#FAE2BD', 500: '#D9780F', 600: '#B25E09', 700: '#8A4807' },
  danger: { 50: '#FCECEA', 100: '#F7D2CE', 500: '#DC4339', 600: '#C6342C', 700: '#9E2922' },
  canvas: '#F5F8FA',
  surface: '#FFFFFF',
  line: '#E3E8EC',
};

const fontFamily = { sans: 'Manrope' };

/** Type scale: [fontSize, lineHeight, weight]. Prices use tabular numerals where supported. */
const type = {
  display: [28, 34, '800'],
  title: [22, 28, '700'],
  headline: [18, 24, '700'],
  body: [15, 22, '500'],
  bodySm: [14, 20, '500'],
  label: [13, 18, '600'],
  caption: [12, 16, '500'],
  overline: [11, 14, '700'],
  price: [20, 24, '800'],
};

const radius = { sm: 6, md: 10, lg: 14, xl: 18, '2xl': 22, '3xl': 28 };

/**
 * Elevation as CSS box-shadow strings. RN 0.81 (new architecture) supports the `boxShadow` style
 * prop on Android and iOS, and the web layer passes it through unchanged — so the same
 * `style={{ boxShadow: shadows.card }}` renders identically on both. (Don't use Tailwind shadow-*
 * classes on native: NativeWind maps them to iOS-only shadow props.)
 */
const shadows = {
  card: '0px 6px 18px -8px rgba(14, 23, 27, 0.16)',
  raised: '0px 12px 32px -12px rgba(14, 23, 27, 0.24)',
  float: '0px 18px 40px -14px rgba(13, 61, 96, 0.38)',
  brand: '0px 10px 24px -10px rgba(24, 117, 185, 0.60)',
  bar: '0px -6px 24px -12px rgba(14, 23, 27, 0.18)',
};

/** Gradient stops (brand → accent) used by GradientHero, buttons and ticket stubs. */
const gradients = {
  hero: ['#0D3D60', '#12609A', '#1875B9', '#1BA4C4'],
  brand: ['#1875B9', '#1BA4C4'],
  deep: ['#0A2E48', '#12609A'],
  sunrise: ['#12609A', '#3FB7D2'],
};

/** Motion tokens (ms / spring configs) shared by Reanimated (native) and CSS (web). */
const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  stagger: 60,
  pressScale: 0.97,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 140, mass: 1 },
};

module.exports = { colors, fontFamily, type, radius, shadows, gradients, motion };

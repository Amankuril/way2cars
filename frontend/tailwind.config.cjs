/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../apps/shared/theme/tailwind-preset')],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'] },
      boxShadow: { pop: '0 8px 24px -8px rgba(14, 23, 27, 0.18)' },
    },
  },
  plugins: [],
};

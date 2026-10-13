/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}', '../shared/native/**/*.{js,jsx}'],
  presets: [require('nativewind/preset'), require('../shared/theme/tailwind-preset')],
};

import { extendTailwindMerge } from 'tailwind-merge';
import { type } from '../theme/tokens';

/**
 * Same as the web twin (frontend/src/mobile/tw.js): resolves conflicting Tailwind classes so the
 * last one wins (`cn('pb-6', 'pb-20')` → 'pb-20'), which NativeWind alone doesn't guarantee.
 * Custom font sizes (text-body, text-label…) are registered so they aren't mistaken for colours.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: Object.keys(type) }],
    },
  },
});

/** Joins class names (falsy skipped, arrays flattened) and resolves Tailwind conflicts, last wins. */
export function cn(...xs) {
  const s = xs.flat(Infinity).filter(Boolean).join(' ');
  return s ? twMerge(s) : '';
}

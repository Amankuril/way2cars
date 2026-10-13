import { extendTailwindMerge } from 'tailwind-merge';
import { type } from '@shared/theme/tokens';

/**
 * NativeWind resolves conflicting classes by ORDER IN THE STRING (last wins), CSS resolves them by
 * order in the stylesheet. tailwind-merge restores NativeWind semantics: `cn('h-12', 'h-14')` → 'h-14'.
 * Our custom font sizes (text-body, text-label…) must be registered, otherwise tailwind-merge would
 * treat them as colours and drop `text-ink-900` next to `text-body`.
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

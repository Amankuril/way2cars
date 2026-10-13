import { Text as RNText } from '../rn';
import { cn } from './cn';

const VARIANT = {
  display: 'text-display font-extrabold',
  title: 'text-title font-bold',
  headline: 'text-headline font-bold',
  body: 'text-body font-medium',
  bodySm: 'text-bodySm font-medium',
  label: 'text-label font-semibold',
  caption: 'text-caption font-medium',
  overline: 'text-overline font-bold uppercase tracking-wider',
  price: 'text-price font-extrabold',
};
const TONE = {
  default: 'text-ink-900',
  muted: 'text-ink-600',
  subtle: 'text-ink-500',
  brand: 'text-brand-600',
  inverse: 'text-white',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-600',
};

/** A text-colour utility in className (text-white, text-white/75, text-accent-200…) overrides `tone`. */
const COLOR_CLASS = /(^|\s)text-(white|black|transparent|(ink|brand|accent|success|warning|danger)-\d{2,3})(\/\d+)?(?=\s|$)/;

/**
 * All app text goes through this component so typography stays consistent. When className sets a
 * text colour, the tone class is dropped: NativeWind doesn't reliably let the later class win, which
 * left e.g. `text-accent-200` overlines rendering ink-900 (dark-on-dark) on Android.
 */
export function T({ variant = 'body', tone = 'default', className, children, ...rest }) {
  const toneClass = className && COLOR_CLASS.test(className) ? null : TONE[tone];
  return (
    <RNText className={cn('font-sans', VARIANT[variant], toneClass, className)} {...rest}>
      {children}
    </RNText>
  );
}

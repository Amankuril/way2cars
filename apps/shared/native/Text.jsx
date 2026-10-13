import { Text as RNText } from 'react-native';
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

/** All app text goes through this component so typography stays consistent. */
export function T({ variant = 'body', tone = 'default', className, children, ...rest }) {
  return (
    <RNText className={cn('font-sans', VARIANT[variant], TONE[tone], className)} maxFontSizeMultiplier={1.4} {...rest}>
      {children}
    </RNText>
  );
}

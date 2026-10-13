import { Pressable, ActivityIndicator, View } from '../rn';
import { T } from './Text';
import { cn } from './cn';
import { colors } from '@shared/theme/tokens';

const VARIANTS = {
  primary: { box: 'bg-brand-500 active:bg-brand-600', text: 'inverse', spinner: '#fff' },
  secondary: { box: 'bg-surface border border-ink-200 active:bg-ink-50', text: 'default', spinner: colors.ink[900] },
  tonal: { box: 'bg-brand-50 active:bg-brand-100', text: 'brand', spinner: colors.brand[600] },
  ghost: { box: 'bg-transparent active:bg-ink-100', text: 'brand', spinner: colors.brand[600] },
  danger: { box: 'bg-danger-600 active:bg-danger-700', text: 'inverse', spinner: '#fff' },
  dangerGhost: { box: 'bg-transparent active:bg-danger-50', text: 'danger', spinner: colors.danger[600] },
};
const SIZES = { sm: 'h-10 px-4', md: 'h-12 px-5', lg: 'h-14 px-6' };

export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, icon: Icon, iconRight: IconRight, block, className, accessibilityLabel, testID }) {
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  const iconColor = v.text === 'inverse' ? '#fff' : v.text === 'danger' ? colors.danger[600] : v.text === 'brand' ? colors.brand[600] : colors.ink[900];
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      className={cn('flex-row items-center justify-center rounded-md', SIZES[size], v.box, block && 'w-full', inactive && 'opacity-50', className)}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <View className="flex-row items-center">
          {Icon ? <Icon size={18} color={iconColor} strokeWidth={2.2} /> : null}
          <T variant="label" tone={v.text} className={cn(size === 'lg' && 'text-body font-bold', Icon && 'ml-2', IconRight && 'mr-2')}>{title}</T>
          {IconRight ? <IconRight size={18} color={iconColor} strokeWidth={2.2} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/** Square icon-only button with a 44px touch target. */
export function IconButton({ icon: Icon, onPress, label, tone = 'default', size = 22, className, disabled }) {
  const color = tone === 'inverse' ? '#fff' : tone === 'brand' ? colors.brand[600] : colors.ink[900];
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} className={cn('h-11 w-11 items-center justify-center rounded-full active:bg-ink-100', disabled && 'opacity-40', className)}>
      <Icon size={size} color={color} strokeWidth={2} />
    </Pressable>
  );
}

import { forwardRef, useState } from 'react';
import { TextInput, View, Pressable } from 'react-native';
import { T } from './Text';
import { cn } from './cn';
import { colors } from '../theme/tokens';

/** Labelled text input with helper/error text and optional prefix/suffix. */
export const Field = forwardRef(function Field({ label, hint, error, prefix, suffix, multiline, className, inputClassName, editable = true, onPress, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-danger-500' : focused ? 'border-brand-500' : 'border-ink-200';
  const ring = focused && !error ? { boxShadow: '0px 0px 0px 3px rgba(24, 117, 185, 0.14)' } : null;
  const Box = onPress ? Pressable : View;
  return (
    <View className={cn('mb-4', className)}>
      {label ? <T variant="label" tone="muted" className="mb-1.5">{label}</T> : null}
      <Box onPress={onPress} style={ring} className={cn('flex-row items-center rounded-xl border bg-surface px-3.5', multiline ? 'min-h-[96px] py-2' : 'h-[52px]', border, !editable && !onPress && 'bg-ink-50')}>
        {prefix ? <T variant="body" tone="muted" className="mr-2">{prefix}</T> : null}
        <TextInput
          ref={ref}
          editable={editable && !onPress}
          pointerEvents={onPress ? 'none' : 'auto'}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          placeholderTextColor={colors.ink[400]}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          className={cn('flex-1 font-sans text-body font-medium text-ink-900', multiline && 'min-h-[80px]', inputClassName)}
          accessibilityLabel={label}
          {...rest}
        />
        {suffix}
      </Box>
      {error ? <T variant="caption" tone="danger" className="mt-1.5">{error}</T> : hint ? <T variant="caption" tone="subtle" className="mt-1.5">{hint}</T> : null}
    </View>
  );
});

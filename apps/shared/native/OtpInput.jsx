import { useRef } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import Animated, { ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { T } from './Text';
import { cn } from './cn';
import { colors } from '../theme/tokens';

/**
 * One hidden input rendered as digit boxes; accepts exactly `boxes` (6) digits.
 * Supports SMS autofill (one-time-code).
 */
export function OtpInput({ value, onChange, boxes = 6, error, autoFocus = true }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const digits = value.split('');
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Verification code">
      <View className="flex-row justify-between">
        {Array.from({ length: boxes }).map((_, i) => {
          const active = i === value.length;
          return (
            <View key={i} style={active && !error ? { boxShadow: '0px 0px 0px 3px rgba(24, 117, 185, 0.14)' } : null} className={cn('h-14 w-12 items-center justify-center rounded-xl border-2', error ? 'border-danger-500 bg-danger-50' : active ? 'border-brand-500 bg-surface' : digits[i] ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-surface')}>
              {digits[i] ? (
                <Animated.View key={`${i}${digits[i]}`} entering={reduce ? undefined : ZoomIn.springify().damping(14)}>
                  <T variant="title" className={error ? 'text-danger-700' : 'text-ink-900'}>{digits[i]}</T>
                </Animated.View>
              ) : active ? <View style={{ width: 2, height: 22, borderRadius: 1, backgroundColor: colors.brand[500] }} /> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, boxes))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus={autoFocus}
        maxLength={boxes}
        caretHidden
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

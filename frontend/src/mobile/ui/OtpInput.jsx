import { useRef } from 'react';
import { View, TextInput, Pressable } from '../rn';
import { T } from './Text';
import { cn } from './cn';
import { colors } from '@shared/theme/tokens';

/**
 * One hidden input rendered as digit boxes; accepts exactly `boxes` (6) digits.
 * Supports SMS autofill (autocomplete=one-time-code).
 * Web: the transparent input covers the boxes so a tap focuses it directly (opens the keyboard on iOS).
 */
export function OtpInput({ value, onChange, boxes = 6, error, autoFocus = true }) {
  const ref = useRef(null);
  const digits = value.split('');
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Verification code">
      <View className="flex-row justify-between">
        {Array.from({ length: boxes }).map((_, i) => {
          const active = i === value.length;
          return (
            <View key={i} style={active && !error ? { boxShadow: '0px 0px 0px 3px rgba(24, 117, 185, 0.14)' } : null} className={cn('h-14 w-12 items-center justify-center rounded-xl border-2', error ? 'border-danger-500 bg-danger-50' : active ? 'border-brand-500 bg-surface' : digits[i] ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-surface')}>
              {digits[i] ? (
                <View key={`${i}${digits[i]}`} className="w2c-pop-in">
                  <T variant="title" className={error ? 'text-danger-700' : 'text-ink-900'}>{digits[i]}</T>
                </View>
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
        accessibilityLabel="Verification code"
        testID="otp-input"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, fontSize: 16, color: 'transparent' }}
      />
    </Pressable>
  );
}

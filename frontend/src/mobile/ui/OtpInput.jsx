import { useRef } from 'react';
import { View, TextInput, Pressable } from '../rn';
import { T } from './Text';
import { cn } from './cn';

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
            <View key={i} className={cn('h-14 w-12 items-center justify-center rounded-md border bg-surface', error ? 'border-danger-500' : active ? 'border-brand-500' : digits[i] ? 'border-ink-300' : 'border-ink-200')}>
              <T variant="title">{digits[i] || ''}</T>
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

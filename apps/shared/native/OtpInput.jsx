import { useRef } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { T } from './Text';
import { cn } from './cn';

/**
 * One hidden input rendered as digit boxes; accepts exactly `boxes` (6) digits.
 * Supports SMS autofill (one-time-code).
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
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}

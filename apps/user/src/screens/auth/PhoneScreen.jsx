import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Screen, T, Field, Button, Logo } from '@shared/native';
import { api } from '../../api';

const valid = (p) => /^[6-9]\d{9}$/.test(p);

export function PhoneScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const send = useMutation({
    mutationFn: () => api.post('/api/v1/auth/user/otp/request', { phone }),
    onSuccess: (data) => navigation.navigate('Otp', { phone, resendAfterSeconds: data.resendAfterSeconds }),
    onError: (e) => setError(e.message),
  });

  return (
    <Screen
      bg="surface"
      footer={
        <View>
          <Button title="Get verification code" size="lg" block disabled={!valid(phone)} loading={send.isPending} onPress={() => send.mutate()} testID="send-otp" />
          <T variant="caption" tone="subtle" className="mt-3 text-center">
            By continuing you agree to our{' '}
            <T variant="caption" tone="brand" onPress={() => navigation.navigate('CmsPage', { slug: 'terms-and-conditions' })}>Terms</T> and{' '}
            <T variant="caption" tone="brand" onPress={() => navigation.navigate('CmsPage', { slug: 'privacy-policy' })}>Privacy Policy</T>.
          </T>
        </View>
      }
    >
      <View className="px-5 pt-10">
        <Logo size="lg" />
        <T variant="display" className="mt-12">Self-drive cars,{'\n'}ready when you are.</T>
        <T variant="body" tone="muted" className="mt-3">Sign in with your mobile number. We’ll send a one-time code.</T>
        <View className="mt-8">
          <Field
            label="Mobile number"
            prefix="+91"
            value={phone}
            onChangeText={(t) => { setPhone(t.replace(/\D/g, '').slice(0, 10)); setError(null); }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="98765 43210"
            maxLength={10}
            error={error}
            autoFocus
            testID="phone-input"
          />
        </View>
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react-native';
import { Screen } from '../Layout';
import { T } from '../Text';
import { Field } from '../Field';
import { Button } from '../Button';
import { Logo } from '../Media';
import { Notice } from '../Feedback';
import { GradientHero, Card } from '../Surfaces';
import { FadeInView } from '../Motion';
import { CarArt } from '../Scenes';
import { useApp } from '../app/AppContext';
import { colors, shadows } from '../../theme/tokens';

const valid = (p) => /^[6-9]\d{9}$/.test(p);

/** Mobile-number sign-in (both apps). Copy differs per app via `brand` from AppContext. */
export function PhoneScreen({ navigation, route }) {
  const { api, realm, brand } = useApp();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const send = useMutation({
    mutationFn: () => api.post(`/api/v1/auth/${realm}/otp/request`, { phone }),
    onSuccess: (data) => navigation.navigate('Otp', { phone, resendAfterSeconds: data.resendAfterSeconds }),
    onError: (e) => setError(e.message),
  });
  return (
    <Screen
      tone="hero"
      bg="canvas"
      footer={
        <View>
          <Button title="Get verification code" size="lg" block disabled={!valid(phone)} loading={send.isPending} onPress={() => send.mutate()} testID="send-otp" />
          <T variant="caption" tone="subtle" className="mt-3 text-center">
            By continuing you agree to our{' '}
            <T variant="caption" tone="brand" className="font-bold" onPress={() => navigation.navigate('CmsPage', { slug: brand.termsSlug || 'terms-and-conditions' })}>Terms</T> and{' '}
            <T variant="caption" tone="brand" className="font-bold" onPress={() => navigation.navigate('CmsPage', { slug: 'privacy-policy' })}>Privacy Policy</T>.
          </T>
        </View>
      }
    >
      <GradientHero angle="vertical" className="px-4 pb-20 pt-4">
        {/* Logo on a white badge so the dark wordmark stays legible on the gradient. */}
        <View className="self-start rounded-2xl bg-surface px-3.5 pb-2.5 pt-3" style={{ boxShadow: shadows.raised }}>
          <Logo size="sm" subtitle={brand.subtitle} />
        </View>
        <FadeInView index={1}>
          <T variant="display" tone="inverse" className="mt-8">{brand.headline}</T>
          <T variant="body" className="mt-3 text-white/80">{brand.tagline}</T>
        </FadeInView>
        <FadeInView index={2} from="none" className="mt-4 items-end pr-2">
          <CarArt still />
        </FadeInView>
      </GradientHero>

      <FadeInView index={2} className="mx-4" style={{ marginTop: -52 }}>
        <Card className="p-4 pb-1" style={{ boxShadow: shadows.raised }}>
          <Field
            label="Mobile number" prefix="+91" value={phone}
            onChangeText={(t) => { setPhone(t.replace(/\D/g, '').slice(0, 10)); setError(null); }}
            keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98765 43210" maxLength={10}
            error={error} autoFocus testID="phone-input"
          />
        </Card>
      </FadeInView>

      <FadeInView index={3} className="mx-4 mt-4 flex-row items-center px-1">
        <ShieldCheck size={16} color={colors.success[600]} strokeWidth={2.2} />
        <T variant="caption" tone="muted" className="ml-2 flex-1">We’ll text a 6-digit verification code to this number.</T>
      </FadeInView>

      {route?.params?.notice ? <Notice tone="warning" className="mx-4 mt-4">{route.params.notice}</Notice> : null}
    </Screen>
  );
}

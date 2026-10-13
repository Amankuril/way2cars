import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Gift, MapPin, UserRound } from 'lucide-react-native';
import { Screen, T, Field, Button, Card, IconTile, HeroHeader, StepProgress, FadeInView, PressableScale, Skeleton, Notice } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';

/** The sign-up flow so far: phone → code → this profile step. */
const STEPS = ['Mobile', 'Verify', 'Profile'];

function CityChip({ label, selected, onPress }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      containerStyle={{ marginRight: 8, marginBottom: 8 }}
      className={selected ? 'h-11 flex-row items-center rounded-full border border-brand-500 bg-brand-500 px-4' : 'h-11 flex-row items-center rounded-full border border-ink-200 bg-surface px-4'}
    >
      {selected ? <Check size={15} color="#FFFFFF" strokeWidth={3} style={{ marginRight: 6 }} /> : null}
      <T variant="label" className={selected ? 'text-white' : 'text-ink-700'}>{label}</T>
    </PressableScale>
  );
}

function CardTitle({ icon, title, subtitle }) {
  return (
    <View className="mb-4 flex-row items-center">
      <IconTile icon={icon} tone="brand" size={40} />
      <View className="ml-3 flex-1">
        <T variant="headline">{title}</T>
        {subtitle ? <T variant="caption" tone="subtle" className="mt-0.5">{subtitle}</T> : null}
      </View>
    </View>
  );
}

export function ProfileSetupScreen() {
  const { setAccount, signOut } = useAuth();
  const plan = useTripPlan();
  const [form, setForm] = useState({ name: '', email: '', referralCode: '', cityId: null });
  const [errors, setErrors] = useState({});
  const [showReferral, setShowReferral] = useState(false);
  const cities = useQuery({ queryKey: ['cities'], queryFn: () => api.get('/api/v1/public/cities') });

  const save = useMutation({
    mutationFn: () => api.post('/api/v1/user/me/onboarding', {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      referralCode: form.referralCode.trim() || undefined,
      homeCityId: form.cityId || undefined,
    }),
    onSuccess: (account) => {
      const city = cities.data?.find((c) => c.id === form.cityId);
      if (city) plan.setCity(city);
      setAccount(account);
    },
    onError: (e) => setErrors(e.code === 'VALIDATION_FAILED' ? e.fieldErrors : e.code === 'REFERRAL_INVALID' ? { referralCode: e.message } : { form: e.message }),
  });
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  return (
    <Screen tone="hero" bg="canvas" footer={<Button title="Continue" size="lg" block disabled={form.name.trim().length < 2} loading={save.isPending} onPress={() => save.mutate()} />}>
      <HeroHeader
        back={false}
        className="pb-20"
        eyebrow="Welcome to WAY2CARS"
        title="Tell us about yourself"
        subtitle="Use your name exactly as it appears on your driving licence."
      >
        <StepProgress steps={STEPS} current={2} tone="inverse" className="mt-6" />
      </HeroHeader>

      <FadeInView className="mx-4" style={{ marginTop: -56 }}>
        <Card className="p-4 pb-0">
          <CardTitle icon={UserRound} title="Your details" />
          <Field label="Full name" value={form.name} onChangeText={set('name')} autoCapitalize="words" autoComplete="name" error={errors.name} placeholder="As on your licence" />
          <Field label="Email (optional)" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} hint="For invoices and trip receipts" />
        </Card>
      </FadeInView>

      <FadeInView index={1} className="mx-4 mt-4">
        <Card className="p-4 pb-2">
          <CardTitle icon={MapPin} title="Where will you usually rent?" />
          <View className="flex-row flex-wrap">
            {cities.isLoading
              ? [88, 72, 104, 80].map((w, i) => <Skeleton key={i} className="mb-2 mr-2 h-11 rounded-full" style={{ width: w }} />)
              : (cities.data || []).map((c) => <CityChip key={c.id} label={c.name} selected={form.cityId === c.id} onPress={() => set('cityId')(c.id)} />)}
          </View>
        </Card>
      </FadeInView>

      <FadeInView index={2} className="mx-4 mt-4">
        {showReferral ? (
          <Card className="p-4 pb-0">
            <Field label="Referral code" value={form.referralCode} onChangeText={(t) => set('referralCode')(t.toUpperCase())} autoCapitalize="characters" placeholder="W2CXXXXXX" error={errors.referralCode} autoFocus />
          </Card>
        ) : (
          <PressableScale onPress={() => setShowReferral(true)} accessibilityRole="button" className="min-h-[52px] flex-row items-center rounded-2xl border border-dashed border-brand-300 bg-brand-50 px-4">
            <Gift size={18} color={colors.brand[600]} strokeWidth={2.2} />
            <T variant="label" className="ml-2.5 text-brand-700">Have a referral code?</T>
          </PressableScale>
        )}
      </FadeInView>

      {errors.form ? <Notice tone="danger" className="mx-4 mt-4">{errors.form}</Notice> : null}

      <Pressable onPress={signOut} accessibilityRole="button" className="mt-5 min-h-[44px] self-center justify-center px-4">
        <T variant="label" tone="subtle">Use a different number</T>
      </Pressable>
    </Screen>
  );
}

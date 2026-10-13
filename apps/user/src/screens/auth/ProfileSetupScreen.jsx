import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen, T, Field, Button, Chip } from '@shared/native';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTripPlan } from '../../hooks/useTripPlan';

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
    <Screen bg="surface" footer={<Button title="Continue" size="lg" block disabled={form.name.trim().length < 2} loading={save.isPending} onPress={() => save.mutate()} />}>
      <View className="px-5 pt-8">
        <T variant="overline" tone="brand">Welcome to WAY2CARS</T>
        <T variant="title" className="mt-2">Tell us about yourself</T>
        <T variant="body" tone="muted" className="mt-2">Use your name exactly as it appears on your driving licence.</T>
        <View className="mt-7">
          <Field label="Full name" value={form.name} onChangeText={set('name')} autoCapitalize="words" autoComplete="name" error={errors.name} placeholder="As on your licence" />
          <Field label="Email (optional)" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} hint="For invoices and trip receipts" />
          <T variant="label" tone="muted" className="mb-2">Where will you usually rent?</T>
          <View className="mb-4 flex-row flex-wrap">
            {(cities.data || []).map((c) => <Chip key={c.id} label={c.name} selected={form.cityId === c.id} onPress={() => set('cityId')(c.id)} className="mb-2" />)}
          </View>
          {showReferral ? (
            <Field label="Referral code" value={form.referralCode} onChangeText={(t) => set('referralCode')(t.toUpperCase())} autoCapitalize="characters" placeholder="W2CXXXXXX" error={errors.referralCode} />
          ) : (
            <Pressable onPress={() => setShowReferral(true)} className="mb-4 self-start py-1"><T variant="label" tone="brand">Have a referral code?</T></Pressable>
          )}
          {errors.form ? <T variant="bodySm" tone="danger">{errors.form}</T> : null}
          <Pressable onPress={signOut} className="mt-2 self-start py-2"><T variant="label" tone="subtle">Use a different number</T></Pressable>
        </View>
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, CalendarDays } from 'lucide-react-native';
import { Screen, HeroHeader, Card, SectionHeader, FadeInView, SpecChip, Avatar, Field, Button, T, useToast } from '@shared/native';
import { maskPhone } from '@shared/lib/format';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

export function EditProfileScreen({ navigation }) {
  const { account, setAccount } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [errors, setErrors] = useState({});
  const kycLocked = account.kyc?.status === 'approved' || account.kyc?.status === 'pending';
  const save = useMutation({
    mutationFn: () => api.patch('/api/v1/user/me', { ...(kycLocked ? {} : { name: name.trim() }), email: email.trim() }),
    onSuccess: (me) => { setAccount(me); toast('Profile updated', 'success'); navigation.goBack(); },
    onError: (e) => setErrors(e.fieldErrors || {}),
  });
  return (
    <Screen tone="hero" footer={<Button title="Save" size="lg" block loading={save.isPending} onPress={() => save.mutate()} />}>
      <HeroHeader compact title="Edit profile">
        <View className="mt-3 items-center pb-2">
          <View className="rounded-full border-2 border-white/40 p-1"><Avatar name={name || account.name} size={76} /></View>
          <T variant="headline" tone="inverse" className="mt-3 text-center" numberOfLines={1}>{name || account.name}</T>
          <View className="mt-2 flex-row flex-wrap justify-center">
            {account.kyc?.status === 'approved' ? <SpecChip icon={ShieldCheck} tone="inverse" label="Verified" /> : null}
            <SpecChip icon={CalendarDays} tone="inverse" label={`Member since ${new Date(account.createdAt).getFullYear()}`} />
          </View>
        </View>
      </HeroHeader>

      <FadeInView className="mt-6">
        <SectionHeader title="Personal details" />
        <Card className="mx-4 px-4 pb-1 pt-4">
          <Field label="Full name" value={name} onChangeText={setName} editable={!kycLocked} hint={kycLocked ? 'Locked after verification — contact support to change it.' : 'As on your driving licence'} error={errors.name} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        </Card>
      </FadeInView>

      <FadeInView index={1} className="mt-6">
        <SectionHeader title="Sign-in" />
        <Card className="mx-4 px-4 pb-1 pt-4">
          <Field label="Mobile number" value={maskPhone(account.phone)} editable={false} hint="Your number is your sign-in. To change it, contact support." />
        </Card>
      </FadeInView>
    </Screen>
  );
}

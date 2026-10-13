import { useState } from 'react';
import { View } from '@/mobile/rn';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header, Field, Button, T, useToast } from '@/mobile/ui';
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
    <Screen bg="surface" header={<Header title="Edit profile" />} footer={<Button title="Save" size="lg" block loading={save.isPending} onPress={() => save.mutate()} />}>
      <View className="px-5 pt-5">
        <Field label="Full name" value={name} onChangeText={setName} editable={!kycLocked} hint={kycLocked ? 'Locked after verification — contact support to change it.' : 'As on your driving licence'} error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        <Field label="Mobile number" value={maskPhone(account.phone)} editable={false} hint="Your number is your sign-in. To change it, contact support." />
        <T variant="caption" tone="subtle">Member since {new Date(account.createdAt).getFullYear()}</T>
      </View>
    </Screen>
  );
}

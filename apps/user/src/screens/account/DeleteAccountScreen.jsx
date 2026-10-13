import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header, T, Field, Button, Notice } from '@shared/native';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

export function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const del = useMutation({ mutationFn: () => api.del('/api/v1/user/me', { confirm: 'DELETE' }), onSuccess: () => signOut() });
  return (
    <Screen bg="surface" header={<Header title="Delete account" />} footer={<Button title="Permanently delete my account" variant="danger" block size="lg" disabled={confirm !== 'DELETE'} loading={del.isPending} onPress={() => del.mutate()} />}>
      <View className="px-5 pt-5">
        <T variant="title">We’re sorry to see you go</T>
        <T variant="body" tone="muted" className="mt-3">Deleting your account removes your profile, saved addresses and wallet credit. Booking, payment and tax records are kept as required by law.</T>
        <Notice tone="warning" className="mt-5">You can’t delete your account while you have upcoming or active trips.</Notice>
        <Field className="mt-6" label='Type DELETE to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" error={del.error?.message} />
      </View>
    </Screen>
  );
}

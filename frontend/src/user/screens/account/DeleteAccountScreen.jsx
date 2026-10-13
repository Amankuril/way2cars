import { useState } from 'react';
import { View } from '@/mobile/rn';
import { useMutation } from '@tanstack/react-query';
import { UserX, UserRound, MapPin, Wallet, FileText } from 'lucide-react';
import { Screen, Header, T, Field, Button, Notice, Card, IconTile, FadeInView, Confirm } from '@/mobile/ui';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

const REMOVED = [
  { icon: UserRound, label: 'Your profile' },
  { icon: MapPin, label: 'Saved addresses' },
  { icon: Wallet, label: 'Wallet credit' },
];

export function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [asking, setAsking] = useState(false);
  const del = useMutation({ mutationFn: () => api.del('/api/v1/user/me', { confirm: 'DELETE' }), onSuccess: () => signOut() });
  return (
    <Screen header={<Header title="Delete account" />} footer={<Button title="Permanently delete my account" variant="danger" block size="lg" disabled={confirm !== 'DELETE'} loading={del.isPending} onPress={() => setAsking(true)} />}>
      <FadeInView className="items-center px-6 pt-6">
        <IconTile icon={UserX} tone="danger" size={64} />
        <T variant="title" className="mt-4 text-center">We’re sorry to see you go</T>
        <T variant="bodySm" tone="muted" className="mt-2 text-center">Here’s what happens when you delete your account.</T>
      </FadeInView>

      <FadeInView index={1} className="mt-6">
        <Card className="mx-4 p-4">
          <T variant="overline" tone="danger">Removed</T>
          {REMOVED.map((r) => (
            <View key={r.label} className="mt-3 flex-row items-center">
              <IconTile icon={r.icon} tone="neutral" size={36} />
              <T variant="body" className="ml-3 font-semibold">{r.label}</T>
            </View>
          ))}
          <View className="my-4 h-px bg-line" />
          <T variant="overline" tone="subtle">Kept</T>
          <View className="mt-3 flex-row items-center">
            <IconTile icon={FileText} tone="neutral" size={36} />
            <T variant="bodySm" tone="muted" className="ml-3 flex-1">Booking, payment and tax records, as required by law</T>
          </View>
        </Card>
      </FadeInView>

      <FadeInView index={2} className="mx-4 mt-5">
        <Notice tone="warning">You can’t delete your account while you have upcoming or active trips.</Notice>
        <Field className="mt-5" label='Type DELETE to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" error={del.error?.message} />
      </FadeInView>

      <Confirm visible={asking} tone="danger" title="Delete your account?" message="This can’t be undone. Your profile, saved addresses and wallet credit will be removed." confirmLabel="Delete" loading={del.isPending} onCancel={() => setAsking(false)} onConfirm={() => del.mutate(undefined, { onSettled: () => setAsking(false) })} />
    </Screen>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header, Field, Button, T } from '@shared/native';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

export function ProfileStepScreen({ navigation }) {
  const { account, setAccount } = useAuth();
  const [name, setName] = useState(account.name || '');
  const [email, setEmail] = useState(account.email || '');
  const [errors, setErrors] = useState({});
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/vendor/me/profile', { name: name.trim(), email: email.trim() }),
    onSuccess: (v) => { setAccount(v); navigation.goBack(); },
    onError: (e) => setErrors(e.fieldErrors?.name || e.fieldErrors?.email ? e.fieldErrors : { form: e.message }),
  });
  return (
    <Screen bg="surface" header={<Header title="Your details" />} footer={<Button title="Save and continue" size="lg" block disabled={name.trim().length < 2 || !email.includes('@')} loading={save.isPending} onPress={() => save.mutate()} />}>
      <View className="px-5 pt-5">
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" hint="As on your government ID" error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="For payout receipts and important account updates" error={errors.email} />
        {errors.form ? <T variant="bodySm" tone="danger">{errors.form}</T> : null}
      </View>
    </Screen>
  );
}

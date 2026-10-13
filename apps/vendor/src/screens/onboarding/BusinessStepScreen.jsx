import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Screen, Header, Field, Button, T, Chip } from '@shared/native';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useCities } from '../../hooks/queries';

export function BusinessStepScreen({ navigation }) {
  const { account, setAccount } = useAuth();
  const cities = useCities();
  const a = account.address || {};
  const [f, setF] = useState({ businessType: account.businessType || 'individual', businessName: account.businessName || '', gstin: account.gstin || '', cityId: account.cityId || null, line1: a.line1 || '', line2: a.line2 || '', city: a.city || '', state: a.state || '', pincode: a.pincode || '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/vendor/me/business', {
      businessType: f.businessType,
      businessName: f.businessName.trim() || undefined,
      gstin: f.gstin.trim().toUpperCase() || '',
      cityId: f.cityId,
      address: { line1: f.line1.trim(), line2: f.line2.trim() || undefined, city: f.city.trim(), state: f.state.trim(), pincode: f.pincode },
    }),
    onSuccess: (v) => { setAccount(v); navigation.goBack(); },
    onError: (e) => {
      const fe = e.fieldErrors || {};
      setErrors({ businessName: fe.businessName, gstin: fe.gstin, line1: fe['address.line1'], city: fe['address.city'], state: fe['address.state'], pincode: fe['address.pincode'], form: Object.keys(fe).length ? null : e.message });
    },
  });
  const ready = f.cityId && f.line1.trim().length >= 3 && f.city.trim() && f.state.trim() && /^\d{6}$/.test(f.pincode) && (f.businessType === 'individual' || f.businessName.trim());
  return (
    <Screen bg="surface" header={<Header title="Business & address" />} footer={<Button title="Save and continue" size="lg" block disabled={!ready} loading={save.isPending} onPress={() => save.mutate()} />}>
      <View className="px-5 pt-5">
        <T variant="label" tone="muted" className="mb-2">You are listing as</T>
        <View className="mb-4 flex-row"><Chip label="An individual" selected={f.businessType === 'individual'} onPress={() => set('businessType')('individual')} /><Chip label="A company" selected={f.businessType === 'company'} onPress={() => set('businessType')('company')} /></View>
        {f.businessType === 'company' ? <Field label="Registered company name" value={f.businessName} onChangeText={set('businessName')} error={errors.businessName} /> : null}
        <Field label="GSTIN (optional)" value={f.gstin} onChangeText={(t) => set('gstin')(t.toUpperCase())} autoCapitalize="characters" maxLength={15} error={errors.gstin} hint="Required only if you are GST-registered" />
        <T variant="label" tone="muted" className="mb-2">City you operate in</T>
        <View className="mb-4 flex-row flex-wrap">{(cities.data || []).map((c) => <Chip key={c.id} label={c.name} className="mb-2" selected={f.cityId === c.id} onPress={() => { set('cityId')(c.id); if (!f.city) set('city')(c.name); if (!f.state) set('state')(c.state || ''); }} />)}</View>
        <Field label="Address line 1" value={f.line1} onChangeText={set('line1')} error={errors.line1} />
        <Field label="Address line 2 (optional)" value={f.line2} onChangeText={set('line2')} />
        <View className="flex-row"><Field className="mr-3 flex-1" label="City" value={f.city} onChangeText={set('city')} error={errors.city} /><Field className="flex-1" label="State" value={f.state} onChangeText={set('state')} error={errors.state} /></View>
        <Field label="PIN code" value={f.pincode} onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" error={errors.pincode} />
        {errors.form ? <T variant="bodySm" tone="danger">{errors.form}</T> : null}
      </View>
    </Screen>
  );
}

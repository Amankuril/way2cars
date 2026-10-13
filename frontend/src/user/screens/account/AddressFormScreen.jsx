import { useState } from 'react';
import { View, Switch } from '@/mobile/rn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, MapPinCheck, Home, Briefcase, Star } from 'lucide-react';
import { Screen, Header, Field, Button, T, Chip, useToast, Confirm, Card, SectionHeader, FadeInView, IconTile, Loading, ErrorState } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';
import { AddressPicker } from '../../components/AddressPicker';

/** Web: the address object only lives in history state, so a pasted link (?id=…) loads it from the profile. */
export function AddressFormScreen({ route, navigation }) {
  const id = route.params?.id;
  const passed = route.params?.address;
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/api/v1/user/me'), enabled: !!id && !passed });
  if (id && !passed) {
    if (me.isLoading) return <Screen header={<Header title="Edit address" />} scroll={false}><Loading /></Screen>;
    if (me.error) return <Screen header={<Header title="Edit address" />} scroll={false}><ErrorState error={me.error} onRetry={me.refetch} /></Screen>;
    const found = (me.data?.addresses || []).find((a) => String(a.id) === String(id));
    return <AddressForm key={id} existing={found} navigation={navigation} />;
  }
  return <AddressForm existing={passed} navigation={navigation} />;
}

function AddressForm({ existing, navigation }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    label: existing?.label || 'Home', line1: existing?.line1 || '', line2: existing?.line2 || '', landmark: existing?.landmark || '',
    city: existing?.city || '', state: existing?.state || '', pincode: existing?.pincode || '',
    lat: existing?.location?.lat, lng: existing?.location?.lng, isDefault: existing?.isDefault || false,
  });
  const [errors, setErrors] = useState({});
  const [picker, setPicker] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const done = () => { qc.invalidateQueries({ queryKey: ['me'] }); navigation.goBack(); };
  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined));
      return existing ? api.patch(`/api/v1/user/me/addresses/${existing.id}`, body) : api.post('/api/v1/user/me/addresses', body);
    },
    onSuccess: () => { toast('Address saved', 'success'); done(); },
    onError: (e) => { setErrors(e.fieldErrors || {}); if (!e.fieldErrors || !Object.keys(e.fieldErrors).length) toast(e.message, 'danger'); },
  });
  const del = useMutation({ mutationFn: () => api.del(`/api/v1/user/me/addresses/${existing.id}`), onSuccess: done, onError: (e) => toast(e.message, 'danger') });

  return (
    <Screen header={<Header title={existing ? 'Edit address' : 'Add address'} />} footer={<Button title="Save address" block size="lg" loading={save.isPending} onPress={() => save.mutate()} />}>
      <FadeInView className="mx-4 mt-4">
        <Card className="flex-row items-center p-3.5">
          <IconTile icon={f.lat ? MapPinCheck : MapPin} tone={f.lat ? 'success' : 'brand'} size={44} />
          <View className="ml-3 flex-1">
            <T variant="label">{f.lat ? 'Location pinned' : 'Pin the exact spot'}</T>
            <T variant="caption" tone="subtle" className="mt-0.5">{f.lat ? 'Change it if the pin is off' : 'Helps us deliver to the right place'}</T>
          </View>
          <Button title={f.lat ? 'Change' : 'Find on map'} accessibilityLabel={f.lat ? 'Location pinned — change' : 'Find on map'} variant="tonal" size="sm" onPress={() => setPicker(true)} />
        </Card>
      </FadeInView>

      <FadeInView index={1} className="mt-6">
        <SectionHeader title="Save as" />
        <View className="mb-1 flex-row px-4">{['Home', 'Work', 'Other'].map((l) => <Chip key={l} label={l} icon={l === 'Home' ? Home : l === 'Work' ? Briefcase : MapPin} selected={f.label === l} onPress={() => set('label')(l)} />)}</View>
      </FadeInView>

      <FadeInView index={2} className="mt-5">
        <SectionHeader title="Address" />
        <Card className="mx-4 px-4 pb-1 pt-4">
          <Field label="Flat / house, building" value={f.line1} onChangeText={set('line1')} error={errors.line1} />
          <Field label="Street, area" value={f.line2} onChangeText={set('line2')} error={errors.line2} />
          <Field label="Landmark (optional)" value={f.landmark} onChangeText={set('landmark')} />
          <View className="flex-row">
            <Field className="mr-3 flex-1" label="City" value={f.city} onChangeText={set('city')} error={errors.city} />
            <Field className="flex-1" label="PIN code" value={f.pincode} onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" error={errors.pincode} />
          </View>
        </Card>
      </FadeInView>

      <FadeInView index={3} className="mx-4 mt-4">
        <Card className="flex-row items-center px-4 py-3">
          <IconTile icon={Star} tone="warning" size={36} />
          <T variant="body" className="ml-3 flex-1 font-semibold">Set as default</T>
          <Switch value={f.isDefault} onValueChange={set('isDefault')} trackColor={{ true: colors.brand[300], false: colors.ink[200] }} thumbColor={f.isDefault ? colors.brand[500] : '#fff'} accessibilityLabel="Set as default" />
        </Card>
        {existing ? <Button title="Delete address" variant="dangerGhost" className="mt-4 self-start" onPress={() => setConfirmDel(true)} /> : null}
      </FadeInView>
      <AddressPicker visible={picker} onClose={() => setPicker(false)} onSelect={(p) => setF((x) => ({ ...x, lat: p.lat, lng: p.lng, line2: x.line2 || p.address.split(',').slice(0, 2).join(',').trim() }))} />
      <Confirm visible={confirmDel} title="Delete this address?" confirmLabel="Delete" tone="danger" loading={del.isPending} onCancel={() => setConfirmDel(false)} onConfirm={() => del.mutate()} />
    </Screen>
  );
}

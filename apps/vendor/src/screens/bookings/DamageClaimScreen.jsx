import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { Screen, Header, T, Field, Button, Notice, PhotoTile, useUploader, useToast } from '@shared/native';
import { api } from '../../api';

const SLOTS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];

export function DamageClaimScreen({ route, navigation }) {
  const { id, title } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const uploader = useUploader();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [shown, setShown] = useState(2);
  const submit = useMutation({
    mutationFn: () => api.post(`/api/v1/vendor/bookings/${id}/return-review`, { decision: 'claim_damage', damagePaise: Math.round(Number(amount) * 100), description: description.trim(), photoFileIds: uploader.ids(SLOTS) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['booking', id] }); toast('Claim submitted for review', 'success'); navigation.goBack(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const ready = Number(amount) >= 1 && description.trim().length >= 10 && uploader.ids(SLOTS).length >= 1;
  return (
    <Screen bg="surface" header={<Header title="Report damage" subtitle={title} />} footer={<Button title="Submit claim" size="lg" block disabled={!ready || uploader.busy} loading={submit.isPending} onPress={() => submit.mutate()} />}>
      <View className="px-5 pt-4">
        <Notice tone="info">Our team compares your photos with the renter’s pickup and return photos, then decides the amount. Approved amounts are paid to you from the renter’s deposit (and any dues).</Notice>
        <Field className="mt-5" label="Estimated repair cost (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint="Attach a repair quote photo if you have one" />
        <Field label="What’s damaged?" value={description} onChangeText={setDescription} multiline placeholder="Location on the car, what changed since pickup" />
        <T variant="label" tone="muted" className="mb-2">Photos</T>
        <View className="-mx-1.5 flex-row flex-wrap">
          {SLOTS.slice(0, shown).map((k, i) => (
            <View key={k} className="w-1/2 px-1.5">
              <PhotoTile label={`Photo ${i + 1}`} source={uploader.slots[k]?.uri ? { uri: uploader.slots[k].uri } : undefined} state={uploader.slots[k]?.state} error={uploader.slots[k]?.error} onPress={() => uploader.take(k, 'damage_photo')} />
            </View>
          ))}
        </View>
        {shown < SLOTS.length ? <Button title="Add another photo" icon={Plus} variant="ghost" size="sm" className="self-start" onPress={() => setShown((n) => n + 1)} /> : null}
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, Field, Loading, ErrorState, Notice, PhotoTile, Chip, IconButton, useToast } from '@shared/native';
import { dateTime } from '@shared/lib/format';
import { api } from '../../api';
import { useUploader } from '../../hooks/useUploader';
import { currentPosition } from '../../services/location';
import { InspectionForm, validateInspection, inspectionPayload, emptyInspection } from '../../components/InspectionForm';

export function ReturnScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const uploader = useUploader();
  const [form, setForm] = useState(emptyInspection);
  const [damages, setDamages] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}`) });

  if (trip.isLoading) return <Screen header={<Header title="Return car" />} scroll={false}><Loading /></Screen>;
  if (trip.error) return <Screen header={<Header title="Return car" />} scroll={false}><ErrorState error={trip.error} onRetry={trip.refetch} /></Screen>;
  const b = trip.data;
  const isElectric = b.vehicle?.fuelType === 'electric';
  const late = Date.now() > new Date(b.endAt).getTime();

  const addDamage = () => setDamages((d) => [...d, { key: `dmg${Date.now()}`, area: '', description: '', severity: 'minor' }]);
  const update = (key, patch) => setDamages((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const submit = async () => {
    const e = validateInspection(form, uploader, isElectric);
    if (form.odometerKm && Number(form.odometerKm) < (b.trip?.startOdometerKm || 0)) e.odometerKm = `Must be at least the pickup reading (${b.trip.startOdometerKm} km).`;
    if (damages.some((d) => d.area.trim().length < 2 || d.description.trim().length < 3)) e.damages = 'Describe each damage you added, or remove it.';
    setErrors(e);
    if (Object.keys(e).length) return toast('Some details are missing', 'danger');
    setSubmitting(true);
    try {
      const pos = await currentPosition({ timeout: 4000 }).catch(() => null);
      await api.post(`/api/v1/user/bookings/${id}/return`, {
        ...inspectionPayload(form, uploader, isElectric),
        ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
        damages: damages.map((d) => ({ area: d.area.trim(), description: d.description.trim(), severity: d.severity, photoFileIds: uploader.ids([d.key]) })),
      });
      qc.invalidateQueries({ queryKey: ['trip', id] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      toast('Return submitted. The host will review the car.', 'success');
      navigation.goBack();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen header={<Header title="Return car" subtitle={b.vehicle?.title} />} footer={<Button title="Submit return" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}>
      {late ? <Notice tone="warning" className="mx-4 mt-4" title="Returning late">Your trip was due back at {dateTime(b.endAt)}. Late hours beyond the grace period are charged from your deposit.</Notice> : (
        <Notice tone="info" className="mx-4 mt-4" title="Almost done">Park safely, lock the car and photograph it from all sides. Pickup reading was {b.trip?.startOdometerKm} km.</Notice>
      )}
      <InspectionForm uploader={uploader} form={form} setForm={setForm} isElectric={isElectric} errors={errors} />
      <Section title="Damage during the trip" action={<Button title="Add" icon={Plus} variant="ghost" size="sm" onPress={addDamage} />}>
        {damages.length === 0 ? <T variant="bodySm" tone="subtle" className="px-4">Nothing to report? Leave this empty.</T> : damages.map((d) => (
          <Panel key={d.key} className="mb-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row">
                <Chip label="Minor" selected={d.severity === 'minor'} onPress={() => update(d.key, { severity: 'minor' })} />
                <Chip label="Major" selected={d.severity === 'major'} onPress={() => update(d.key, { severity: 'major' })} />
              </View>
              <IconButton icon={Trash2} label="Remove damage" onPress={() => { setDamages((x) => x.filter((y) => y.key !== d.key)); uploader.remove(d.key); }} />
            </View>
            <Field label="Where on the car" value={d.area} onChangeText={(t) => update(d.key, { area: t })} placeholder="e.g. rear bumper" className="mt-3" />
            <Field label="What happened" value={d.description} onChangeText={(t) => update(d.key, { description: t })} multiline />
            <PhotoTile label="Photo of the damage" aspect={2} source={uploader.slots[d.key]?.uri ? { uri: uploader.slots[d.key].uri } : undefined} state={uploader.slots[d.key]?.state} error={uploader.slots[d.key]?.error} onPress={() => uploader.take(d.key, 'damage_photo')} />
          </Panel>
        ))}
        {errors.damages ? <T variant="caption" tone="danger" className="px-4">{errors.damages}</T> : null}
      </Section>
    </Screen>
  );
}

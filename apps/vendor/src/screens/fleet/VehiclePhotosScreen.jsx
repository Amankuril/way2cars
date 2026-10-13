import { useEffect, useState } from 'react';
import { View, Image, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star } from 'lucide-react-native';
import { Screen, Header, T, Button, Notice, Loading, IconButton, useUploader, useToast, cn } from '@shared/native';
import { SourceChooser } from '@shared/native/screens';
import { colors } from '@shared/theme/tokens';
import { api } from '../../api';

/** Ordered photo set; the first photo is the cover shown in search. */
export function VehiclePhotosScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const uploader = useUploader();
  const q = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`/api/v1/vendor/vehicles/${id}`) });
  const [items, setItems] = useState(null); // [{ fileId, url }]
  const [chooser, setChooser] = useState(false);
  useEffect(() => { if (q.data && !items) setItems(q.data.photoFiles || []); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (source) => {
    const key = `p${Date.now()}`;
    const f = await uploader.take(key, 'vehicle_photo', { source });
    if (f) setItems((x) => [...x, { fileId: f.id, url: f.url }]);
  };
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/vendor/vehicles/${id}/photos`, { fileIds: items.map((p) => p.fileId) }),
    onSuccess: (v) => { qc.setQueryData(['vehicle', id], (o) => ({ ...o, ...v })); qc.invalidateQueries({ queryKey: ['vehicles'] }); toast('Photos saved', 'success'); navigation.goBack(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  if (!items) return <Screen header={<Header title="Photos" />} scroll={false}><Loading /></Screen>;
  const changed = JSON.stringify(items.map((p) => p.fileId)) !== JSON.stringify((q.data?.photoFiles || []).map((p) => String(p.fileId)));
  return (
    <Screen header={<Header title="Photos" subtitle={`${items.length} of 15`} />} footer={<Button title="Save photos" size="lg" block disabled={!changed || items.length < 1 || uploader.busy} loading={save.isPending} onPress={() => save.mutate()} />}>
      <Notice tone="info" className="mx-4 mt-4">Add at least 4 clear photos: front, back, both sides and the interior. Landscape, daylight, no people or number-plate edits. The first photo is your cover.</Notice>
      <View className="mt-4 flex-row flex-wrap px-2.5">
        {items.map((p, i) => (
          <View key={String(p.fileId)} className="mb-3 w-1/2 px-1.5">
            <View className={cn('overflow-hidden rounded-md border', i === 0 ? 'border-brand-500' : 'border-line')}>
              <Image source={{ uri: p.url }} style={{ aspectRatio: 1.4 }} className="w-full bg-ink-100" />
              <View className="flex-row items-center justify-between bg-surface px-1">
                {i === 0 ? <T variant="caption" tone="brand" className="pl-2 font-bold">Cover</T> : (
                  <Pressable onPress={() => setItems((x) => [x[i], ...x.filter((_, j) => j !== i)])} className="flex-row items-center px-2 py-2" accessibilityLabel="Make cover"><Star size={14} color={colors.ink[500]} /><T variant="caption" tone="muted" className="ml-1">Make cover</T></Pressable>
                )}
                <IconButton icon={Trash2} label="Remove photo" size={18} onPress={() => setItems((x) => x.filter((_, j) => j !== i))} />
              </View>
            </View>
          </View>
        ))}
        {Object.entries(uploader.slots).filter(([, s]) => s.state === 'uploading' || s.state === 'error').map(([k, s]) => (
          <View key={k} className="mb-3 w-1/2 px-1.5">
            <View style={{ aspectRatio: 1.4 }} className="items-center justify-center rounded-md border border-dashed border-ink-300 bg-ink-50">
              <T variant="caption" tone={s.state === 'error' ? 'danger' : 'muted'} className="px-2 text-center">{s.state === 'error' ? s.error : 'Uploading…'}</T>
            </View>
          </View>
        ))}
        {items.length < 15 ? (
          <View className="mb-3 w-1/2 px-1.5">
            <Pressable onPress={() => setChooser(true)} style={{ aspectRatio: 1.4 }} className="items-center justify-center rounded-md border border-dashed border-ink-300 bg-surface active:bg-ink-50" accessibilityRole="button">
              <Plus size={22} color={colors.brand[600]} /><T variant="label" tone="brand" className="mt-1">Add photo</T>
            </Pressable>
          </View>
        ) : null}
      </View>
      <SourceChooser visible={chooser} onClose={() => setChooser(false)} onPick={add} />
    </Screen>
  );
}

import { useState } from 'react';
import { View, Image } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Screen, Header, T, Button, Section, Panel, Field, Chip, PhotoTile, Loading, Pill, useUploader, useToast } from '@shared/native';
import { SourceChooser } from '@shared/native/screens';
import { INSURANCE } from '@shared/lib/labels';
import { dateLong } from '../../lib';
import { api, privateSource } from '../../api';

const DOCS = [
  { key: 'rc', title: 'Registration certificate (RC)', expiry: false, number: true },
  { key: 'insurance', title: 'Insurance policy', expiry: true, number: true, insurance: true },
  { key: 'puc', title: 'Pollution certificate (PUC)', expiry: true },
  { key: 'fitness', title: 'Fitness certificate (commercial vehicles)', expiry: true, optional: true },
];

export function VehicleDocumentsScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const uploader = useUploader();
  const q = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.get(`/api/v1/vendor/vehicles/${id}`) });
  const [meta, setMeta] = useState({});
  const [chooser, setChooser] = useState(null);
  const setM = (k, patch) => setMeta((m) => ({ ...m, [k]: { ...m[k], ...patch } }));

  const save = useMutation({
    mutationFn: () => {
      const body = {};
      for (const d of DOCS) {
        const fileId = uploader.slots[d.key]?.fileId;
        if (!fileId) continue;
        const m = meta[d.key] || {};
        body[d.key] = { fileId, ...(m.number ? { number: m.number } : {}), ...(m.expiry ? { expiry: m.expiry.toISOString() } : {}), ...(d.insurance ? { provider: m.provider, type: m.type } : {}) };
      }
      return api.put(`/api/v1/vendor/vehicles/${id}/documents`, body);
    },
    onSuccess: (v) => { qc.setQueryData(['vehicle', id], (o) => ({ ...o, ...v })); qc.invalidateQueries({ queryKey: ['vehicles'] }); toast('Documents saved', 'success'); navigation.goBack(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  if (q.isLoading) return <Screen header={<Header title="Documents" />} scroll={false}><Loading /></Screen>;
  const existing = q.data?.documents || {};
  const newKeys = DOCS.filter((d) => uploader.slots[d.key]?.fileId).map((d) => d.key);
  const invalid = newKeys.some((k) => {
    const d = DOCS.find((x) => x.key === k);
    const m = meta[k] || {};
    return (d.expiry && !m.expiry) || (d.insurance && (!m.provider || !m.type));
  });

  return (
    <Screen header={<Header title="Documents" />} footer={<Button title="Save documents" size="lg" block disabled={!newKeys.length || invalid || uploader.busy} loading={save.isPending} onPress={() => save.mutate()} />}>
      <T variant="caption" tone="subtle" className="mx-4 mt-4">Documents are private — only our verification team sees them. Updating documents on a live car sends it for a quick re-review.</T>
      {DOCS.filter((d) => d.key !== 'puc' || q.data?.fuelType !== 'electric').map((d) => {
        const cur = existing[d.key];
        const m = meta[d.key] || {};
        const slot = uploader.slots[d.key];
        return (
          <Section key={d.key} title={d.title}>
            <Panel>
              {cur?.fileId && !slot ? (
                <View className="mb-3 flex-row items-center">
                  <Image source={privateSource(`/api/v1/files/${cur.fileId}`)} style={{ width: 72, height: 52, borderRadius: 6 }} className="bg-ink-100" />
                  <View className="ml-3 flex-1">
                    <Pill label={cur.expiry && new Date(cur.expiry) < new Date() ? 'Expired' : 'Uploaded'} tone={cur.expiry && new Date(cur.expiry) < new Date() ? 'danger' : 'success'} />
                    {cur.expiry ? <T variant="caption" tone="subtle" className="mt-1">Valid till {dateLong(cur.expiry)}</T> : null}
                  </View>
                </View>
              ) : null}
              <View className="w-1/2"><PhotoTile label={cur?.fileId ? 'Replace' : `Upload${d.optional ? ' (optional)' : ''}`} source={slot?.uri ? { uri: slot.uri } : undefined} state={slot?.state} error={slot?.error} onPress={() => setChooser(d.key)} /></View>
              {slot?.fileId ? (
                <>
                  {d.number ? <Field label={d.insurance ? 'Policy number (optional)' : 'Number (optional)'} value={m.number || ''} onChangeText={(t) => setM(d.key, { number: t })} /> : null}
                  {d.insurance ? (
                    <>
                      <Field label="Insurer" value={m.provider || ''} onChangeText={(t) => setM(d.key, { provider: t })} placeholder="e.g. ICICI Lombard" />
                      <View className="mb-3 flex-row flex-wrap">{Object.entries(INSURANCE).map(([k, l]) => <Chip key={k} label={l} className="mb-2" selected={m.type === k} onPress={() => setM(d.key, { type: k })} />)}</View>
                    </>
                  ) : null}
                  {d.expiry ? <Field label="Valid till" value={m.expiry ? dateLong(m.expiry) : ''} placeholder="Select date" onPress={() => DateTimePickerAndroid.open({ value: m.expiry || new Date(), mode: 'date', minimumDate: new Date(), onChange: (e, dt) => e.type === 'set' && dt && setM(d.key, { expiry: dt }) })} className="mb-0" /> : null}
                </>
              ) : null}
            </Panel>
          </Section>
        );
      })}
      <SourceChooser visible={!!chooser} onClose={() => setChooser(null)} onPick={(source) => chooser && uploader.take(chooser, 'vehicle_document', { source })} />
    </Screen>
  );
}

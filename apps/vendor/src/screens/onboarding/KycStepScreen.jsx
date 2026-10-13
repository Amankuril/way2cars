import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ShieldCheck, Clock3 } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, Field, Chip, PhotoTile, Notice, Loading, ErrorState, EmptyState, useToast, useUploader } from '@shared/native';
import { SourceChooser } from '@shared/native/screens';
import { dateLong } from '@shared/lib/format';
import { ID_PROOF } from '@shared/lib/labels';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

export function KycStepScreen({ navigation }) {
  const { refreshAccount } = useAuth();
  const toast = useToast();
  const uploader = useUploader();
  const status = useQuery({ queryKey: ['vendor-kyc'], queryFn: () => api.get('/api/v1/vendor/me/kyc') });
  const [f, setF] = useState({ idProofType: 'aadhaar', idProofNumber: '', panNumber: '', dateOfBirth: null });
  const [errors, setErrors] = useState({});
  const [chooser, setChooser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  if (status.isLoading) return <Screen header={<Header title="Identity verification" />} scroll={false}><Loading /></Screen>;
  if (status.error) return <Screen header={<Header title="Identity verification" />} scroll={false}><ErrorState error={status.error} onRetry={status.refetch} /></Screen>;
  const st = status.data.status;
  if (st === 'pending' || st === 'approved') {
    return (
      <Screen header={<Header title="Identity verification" />}>
        <EmptyState icon={st === 'approved' ? ShieldCheck : Clock3} title={st === 'approved' ? 'Identity verified' : 'Submitted for review'} message={st === 'approved' ? 'Your identity is verified.' : 'You can continue with the remaining steps while we review your documents.'} action={<Button title="Back to checklist" variant="secondary" onPress={() => navigation.goBack()} />} />
      </Screen>
    );
  }
  const slot = (key, label, purpose = 'kyc_document') => (
    <PhotoTile label={label} source={uploader.slots[key]?.uri ? { uri: uploader.slots[key].uri } : undefined} state={uploader.slots[key]?.state} error={uploader.slots[key]?.error || errors[key]} onPress={() => (purpose === 'kyc_selfie' ? uploader.take(key, purpose, { front: true }) : setChooser({ key, purpose }))} />
  );
  const submit = async () => {
    const e = {};
    if (!f.idProofNumber.trim()) e.idProofNumber = 'Enter the ID number';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.panNumber.trim().toUpperCase())) e.panNumber = 'Enter a valid PAN, e.g. ABCDE1234F';
    if (!f.dateOfBirth) e.dateOfBirth = 'Select your date of birth';
    for (const k of ['idFront', 'pan', 'selfie']) if (!uploader.slots[k]?.fileId) e[k] = 'Required';
    setErrors(e);
    if (Object.keys(e).length) return toast('Please complete the highlighted fields', 'danger');
    setSubmitting(true);
    try {
      await api.post('/api/v1/vendor/me/kyc', {
        idProofType: f.idProofType,
        idProofNumber: f.idProofNumber.replace(/\s/g, '').toUpperCase(),
        idProofFrontFileId: uploader.slots.idFront.fileId,
        idProofBackFileId: uploader.slots.idBack?.fileId,
        panNumber: f.panNumber.trim().toUpperCase(),
        panFileId: uploader.slots.pan.fileId,
        selfieFileId: uploader.slots.selfie.fileId,
        dateOfBirth: f.dateOfBirth.toISOString(),
      });
      await refreshAccount();
      toast('Submitted for verification', 'success');
      navigation.goBack();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };
  const today = new Date();
  return (
    <Screen header={<Header title="Identity verification" />} footer={<Button title="Submit documents" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}>
      {st === 'rejected' ? <Notice tone="danger" title="Please re-submit" className="mx-4 mt-4">{status.data.rejectionReason}</Notice> : <Notice tone="info" className="mx-4 mt-4">Documents are encrypted and seen only by our verification team. Aadhaar: only the last 4 digits are stored.</Notice>}
      <Section title="Government ID">
        <Panel>
          <View className="mb-4 flex-row">{Object.entries(ID_PROOF).map(([k, l]) => <Chip key={k} label={l} selected={f.idProofType === k} onPress={() => set('idProofType')(k)} />)}</View>
          <Field label={`${ID_PROOF[f.idProofType]} number`} value={f.idProofNumber} onChangeText={set('idProofNumber')} autoCapitalize="characters" keyboardType={f.idProofType === 'aadhaar' ? 'number-pad' : 'default'} error={errors.idProofNumber} />
          <View className="flex-row"><View className="mr-3 flex-1">{slot('idFront', 'Front side')}</View><View className="flex-1">{slot('idBack', 'Back side (if any)')}</View></View>
        </Panel>
      </Section>
      <Section title="PAN">
        <Panel>
          <Field label="PAN number" value={f.panNumber} onChangeText={(t) => set('panNumber')(t.toUpperCase())} autoCapitalize="characters" maxLength={10} error={errors.panNumber} hint="Needed for payouts and tax records" />
          <View className="w-1/2">{slot('pan', 'Photo of PAN card')}</View>
        </Panel>
      </Section>
      <Section title="You">
        <Panel>
          <Field label="Date of birth" value={f.dateOfBirth ? dateLong(f.dateOfBirth) : ''} placeholder="Select date" onPress={() => DateTimePickerAndroid.open({ value: f.dateOfBirth || new Date(1985, 0, 1), mode: 'date', maximumDate: new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()), onChange: (ev, d) => ev.type === 'set' && d && set('dateOfBirth')(d) })} error={errors.dateOfBirth} />
          <View className="w-1/2">{slot('selfie', 'Take a selfie', 'kyc_selfie')}</View>
          <T variant="caption" tone="subtle">Face the camera in good light.</T>
        </Panel>
      </Section>
      <SourceChooser visible={!!chooser} onClose={() => setChooser(null)} onPick={(source) => chooser && uploader.take(chooser.key, chooser.purpose, { source })} />
    </Screen>
  );
}

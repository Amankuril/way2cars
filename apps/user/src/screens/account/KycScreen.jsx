import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ShieldCheck, Clock3 } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, Field, Chip, PhotoTile, Notice, Loading, ErrorState, Pill, useToast, EmptyState } from '@shared/native';
import { dateLong } from '@shared/lib/format';
import { ID_PROOF, KYC_STATUS } from '@shared/lib/labels';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useUploader } from '../../hooks/useUploader';
import { SourceChooser } from '../../components/SourceChooser';

const pickDate = (value, { minimumDate, maximumDate }, onSet) =>
  DateTimePickerAndroid.open({ value, mode: 'date', minimumDate, maximumDate, onChange: (e, d) => e.type === 'set' && d && onSet(d) });

export function KycScreen({ navigation }) {
  const { refreshAccount } = useAuth();
  const toast = useToast();
  const uploader = useUploader();
  const status = useQuery({ queryKey: ['kyc'], queryFn: () => api.get('/api/v1/user/me/kyc') });
  const [form, setForm] = useState({ licenceNumber: '', licenceExpiry: null, idProofType: 'aadhaar', idProofNumber: '', dateOfBirth: null });
  const [errors, setErrors] = useState({});
  const [chooser, setChooser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  if (status.isLoading) return <Screen header={<Header title="Verification" />} scroll={false}><Loading /></Screen>;
  if (status.error) return <Screen header={<Header title="Verification" />} scroll={false}><ErrorState error={status.error} onRetry={status.refetch} /></Screen>;
  const st = status.data.status;

  if (st === 'approved' || st === 'pending') {
    const s = KYC_STATUS[st];
    return (
      <Screen header={<Header title="Verification" />}>
        <EmptyState icon={st === 'approved' ? ShieldCheck : Clock3} title={st === 'approved' ? 'You’re verified' : 'Documents under review'} message={st === 'approved' ? 'Your licence and ID are verified. You can book any car on WAY2CARS.' : 'Our team usually reviews documents within a few hours. We’ll notify you as soon as it’s done.'} />
        <Panel>
          <View className="mb-2 flex-row items-center justify-between"><T variant="label">Status</T><Pill label={s.label} tone={s.tone} /></View>
          {status.data.submission?.licence ? <T variant="bodySm" tone="muted">Licence {status.data.submission.licence.numberMasked} · valid till {dateLong(status.data.submission.licence.expiry)}</T> : null}
          {status.data.submission?.idProof ? <T variant="bodySm" tone="muted" className="mt-1">{ID_PROOF[status.data.submission.idProof.type]} {status.data.submission.idProof.numberMasked}</T> : null}
        </Panel>
      </Screen>
    );
  }

  const slot = (key, label, purpose = 'kyc_document') => (
    <PhotoTile label={label} source={uploader.slots[key]?.uri ? { uri: uploader.slots[key].uri } : undefined} state={uploader.slots[key]?.state} error={uploader.slots[key]?.error || errors[key]} onPress={() => (purpose === 'kyc_selfie' ? uploader.take(key, purpose, { front: true }) : setChooser({ key, purpose }))} />
  );

  const submit = async () => {
    const e = {};
    if (!/^[A-Z]{2}[0-9]{2}[ -]?[0-9]{4}[0-9]{7}$/.test(form.licenceNumber.trim().toUpperCase())) e.licenceNumber = 'Enter the licence number as printed, e.g. MH1420110012345';
    if (!form.licenceExpiry) e.licenceExpiry = 'Select the expiry date';
    if (!form.dateOfBirth) e.dateOfBirth = 'Select your date of birth';
    if (!form.idProofNumber.trim()) e.idProofNumber = 'Enter the ID number';
    for (const k of ['licenceFront', 'licenceBack', 'idFront', 'selfie']) if (!uploader.slots[k]?.fileId) e[k] = 'Required';
    setErrors(e);
    if (Object.keys(e).length) return toast('Please complete the highlighted fields', 'danger');
    setSubmitting(true);
    try {
      await api.post('/api/v1/user/me/kyc', {
        licenceNumber: form.licenceNumber.trim().toUpperCase(),
        licenceExpiry: form.licenceExpiry.toISOString(),
        licenceFrontFileId: uploader.slots.licenceFront.fileId,
        licenceBackFileId: uploader.slots.licenceBack.fileId,
        idProofType: form.idProofType,
        idProofNumber: form.idProofNumber.replace(/\s/g, '').toUpperCase(),
        idProofFrontFileId: uploader.slots.idFront.fileId,
        idProofBackFileId: uploader.slots.idBack?.fileId,
        selfieFileId: uploader.slots.selfie.fileId,
        dateOfBirth: form.dateOfBirth.toISOString(),
      });
      await Promise.all([status.refetch(), refreshAccount()]);
      toast('Submitted for verification', 'success');
    } catch (err) {
      if (err.code === 'VALIDATION_FAILED') setErrors(err.fieldErrors);
      toast(err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date();
  return (
    <Screen header={<Header title="Verify your licence" />} footer={<Button title="Submit for verification" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}>
      {st === 'rejected' ? <Notice tone="danger" title="Please re-submit" className="mx-4 mt-4">{status.data.rejectionReason || 'We could not verify your documents.'}</Notice> : (
        <Notice tone="info" className="mx-4 mt-4">Your documents are encrypted and only seen by our verification team. You must be 21+ with a valid Indian driving licence.</Notice>
      )}

      <Section title="Driving licence">
        <Panel>
          <Field label="Licence number" value={form.licenceNumber} onChangeText={(t) => set('licenceNumber')(t.toUpperCase())} autoCapitalize="characters" placeholder="MH1420110012345" error={errors.licenceNumber} />
          <Field label="Valid till" value={form.licenceExpiry ? dateLong(form.licenceExpiry) : ''} placeholder="Select date" onPress={() => pickDate(form.licenceExpiry || today, { minimumDate: today }, set('licenceExpiry'))} error={errors.licenceExpiry} />
          <View className="flex-row"><View className="mr-3 flex-1">{slot('licenceFront', 'Front side')}</View><View className="flex-1">{slot('licenceBack', 'Back side')}</View></View>
        </Panel>
      </Section>

      <Section title="Government ID">
        <Panel>
          <View className="mb-4 flex-row">{Object.entries(ID_PROOF).map(([k, l]) => <Chip key={k} label={l} selected={form.idProofType === k} onPress={() => set('idProofType')(k)} />)}</View>
          <Field label={`${ID_PROOF[form.idProofType]} number`} value={form.idProofNumber} onChangeText={set('idProofNumber')} autoCapitalize="characters" keyboardType={form.idProofType === 'aadhaar' ? 'number-pad' : 'default'} error={errors.idProofNumber} hint={form.idProofType === 'aadhaar' ? 'Only the last 4 digits are stored. A masked Aadhaar is fine.' : undefined} />
          <View className="flex-row"><View className="mr-3 flex-1">{slot('idFront', 'Front side')}</View><View className="flex-1">{slot('idBack', 'Back side (if any)')}</View></View>
        </Panel>
      </Section>

      <Section title="You">
        <Panel>
          <Field label="Date of birth" value={form.dateOfBirth ? dateLong(form.dateOfBirth) : ''} placeholder="Select date" onPress={() => pickDate(form.dateOfBirth || new Date(1995, 0, 1), { maximumDate: new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()) }, set('dateOfBirth'))} error={errors.dateOfBirth} />
          <T variant="label" tone="muted" className="mb-2">Selfie</T>
          <View className="w-1/2">{slot('selfie', 'Take a selfie', 'kyc_selfie')}</View>
          <T variant="caption" tone="subtle">Face the camera in good light, without sunglasses or a cap.</T>
        </Panel>
      </Section>

      <Pressable onPress={() => navigation.navigate('CmsPage', { slug: 'privacy-policy' })} className="mx-4 mt-5 self-start"><T variant="caption" tone="brand">How we protect your documents</T></Pressable>
      <SourceChooser visible={!!chooser} onClose={() => setChooser(null)} onPick={(source) => chooser && uploader.take(chooser.key, chooser.purpose, { source })} />
    </Screen>
  );
}

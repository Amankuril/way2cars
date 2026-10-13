import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ShieldCheck, Clock3, IdCard, FileCheck, ScanFace, LockKeyhole, ChevronRight } from 'lucide-react-native';
import { Screen, Header, HeroHeader, T, Button, Field, Chip, PhotoTile, Notice, ErrorState, Pill, useToast, Card, SectionHeader, FadeInView, IconTile, StepProgress, Skeleton, SkeletonCard } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { dateLong } from '@shared/lib/format';
import { ID_PROOF, KYC_STATUS } from '@shared/lib/labels';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useUploader } from '@shared/native';
import { SourceChooser } from '@shared/native/screens';

const pickDate = (value, { minimumDate, maximumDate }, onSet) =>
  DateTimePickerAndroid.open({ value, mode: 'date', minimumDate, maximumDate, onChange: (e, d) => e.type === 'set' && d && onSet(d) });

const REVIEW_STEPS = ['Submitted', 'In review', 'Verified'];
const FORM_STEPS = ['Licence', 'Government ID', 'You'];
const NEXT = ['Next: your driving licence', 'Next: a government ID', 'Next: your date of birth and a selfie'];

/** A numbered form section: eyebrow step + title, content in an elevated card. */
function Step({ n, title, done, index, children }) {
  return (
    <FadeInView index={index} className="mt-6">
      <SectionHeader eyebrow={`Step ${n}${done ? ' · done' : ''}`} title={title} />
      <Card className="mx-4 px-4 pb-1 pt-4">{children}</Card>
    </FadeInView>
  );
}

/** One submitted document line on the status screen. */
function DocRow({ icon, title, subtitle, last }) {
  return (
    <View className={last ? 'flex-row items-center py-3' : 'flex-row items-center border-b border-line py-3'}>
      <IconTile icon={icon} tone="brand" size={40} />
      <View className="ml-3 flex-1">
        <T variant="label">{title}</T>
        {subtitle ? <T variant="caption" tone="subtle" className="mt-0.5">{subtitle}</T> : null}
      </View>
    </View>
  );
}

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

  if (status.isLoading) {
    return (
      <Screen tone="hero" scroll={false}>
        <HeroHeader compact title="Verification">
          <View className="mt-2 pb-2"><Skeleton className="h-6 w-3/5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} /><Skeleton className="mt-3 h-4 w-4/5" style={{ backgroundColor: 'rgba(255,255,255,0.14)' }} /></View>
        </HeroHeader>
        <SkeletonCard height={150} className="mt-6" />
        <SkeletonCard height={110} className="mt-4" />
      </Screen>
    );
  }
  if (status.error) return <Screen header={<Header title="Verification" />} scroll={false}><ErrorState error={status.error} onRetry={status.refetch} /></Screen>;
  const st = status.data.status;

  if (st === 'approved' || st === 'pending') {
    const s = KYC_STATUS[st];
    const approved = st === 'approved';
    const sub = status.data.submission;
    const docs = [
      sub?.licence ? { key: 'licence', icon: IdCard, title: 'Driving licence', subtitle: `Licence ${sub.licence.numberMasked} · valid till ${dateLong(sub.licence.expiry)}` } : null,
      sub?.idProof ? { key: 'id', icon: FileCheck, title: 'Government ID', subtitle: `${ID_PROOF[sub.idProof.type]} ${sub.idProof.numberMasked}` } : null,
    ].filter(Boolean);
    return (
      <Screen tone="hero">
        <HeroHeader compact title="Verification">
          <FadeInView className="mt-2 flex-row items-center">
            <IconTile icon={approved ? ShieldCheck : Clock3} tone="inverse" size={52} />
            <View className="ml-3.5 flex-1">
              <T variant="title" tone="inverse">{approved ? 'You’re verified' : 'Documents under review'}</T>
            </View>
          </FadeInView>
          <T variant="bodySm" className="mt-3 text-white/85">{approved ? 'Your licence and ID are verified. You can book any car on WAY2CARS.' : 'Our team usually reviews documents within a few hours. We’ll notify you as soon as it’s done.'}</T>
          <StepProgress steps={REVIEW_STEPS} current={approved ? REVIEW_STEPS.length : 1} tone="inverse" className="mb-1 mt-5" />
        </HeroHeader>
        <FadeInView index={1} className="mt-6">
          <SectionHeader title="Your documents" />
          <Card className="mx-4 px-4 py-1">
            <View className="flex-row items-center justify-between border-b border-line py-3"><T variant="label">Status</T><Pill label={s.label} tone={s.tone} /></View>
            {docs.map((d, i) => <DocRow key={d.key} icon={d.icon} title={d.title} subtitle={d.subtitle} last={i === docs.length - 1} />)}
          </Card>
        </FadeInView>
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
  const slotDone = (k) => !!uploader.slots[k]?.fileId;
  const licenceDone = !!(form.licenceNumber.trim() && form.licenceExpiry && slotDone('licenceFront') && slotDone('licenceBack'));
  const idDone = !!(form.idProofNumber.trim() && slotDone('idFront'));
  const youDone = !!(form.dateOfBirth && slotDone('selfie'));
  const current = !licenceDone ? 0 : !idDone ? 1 : !youDone ? 2 : FORM_STEPS.length;
  return (
    <Screen tone="hero" footer={<Button title="Submit for verification" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}>
      <HeroHeader compact title="Verify your licence">
        <T variant="bodySm" className="mt-1 text-white/85">{NEXT[current] || 'All set — submit for verification'}</T>
        <StepProgress steps={FORM_STEPS} current={current} tone="inverse" className="mb-1 mt-4" />
      </HeroHeader>

      {st === 'rejected' ? <Notice tone="danger" title="Please re-submit" className="mx-4 mt-5">{status.data.rejectionReason || 'We could not verify your documents.'}</Notice> : (
        <Notice tone="info" className="mx-4 mt-5">Your documents are encrypted and only seen by our verification team. You must be 21+ with a valid Indian driving licence.</Notice>
      )}

      <Step n={1} title="Driving licence" done={licenceDone} index={0}>
        <Field label="Licence number" value={form.licenceNumber} onChangeText={(t) => set('licenceNumber')(t.toUpperCase())} autoCapitalize="characters" placeholder="MH1420110012345" error={errors.licenceNumber} />
        <Field label="Valid till" value={form.licenceExpiry ? dateLong(form.licenceExpiry) : ''} placeholder="Select date" onPress={() => pickDate(form.licenceExpiry || today, { minimumDate: today }, set('licenceExpiry'))} error={errors.licenceExpiry} />
        <View className="flex-row"><View className="mr-3 flex-1">{slot('licenceFront', 'Front side')}</View><View className="flex-1">{slot('licenceBack', 'Back side')}</View></View>
      </Step>

      <Step n={2} title="Government ID" done={idDone} index={1}>
        <View className="mb-4 flex-row">{Object.entries(ID_PROOF).map(([k, l]) => <Chip key={k} label={l} selected={form.idProofType === k} onPress={() => set('idProofType')(k)} />)}</View>
        <Field label={`${ID_PROOF[form.idProofType]} number`} value={form.idProofNumber} onChangeText={set('idProofNumber')} autoCapitalize="characters" keyboardType={form.idProofType === 'aadhaar' ? 'number-pad' : 'default'} error={errors.idProofNumber} hint={form.idProofType === 'aadhaar' ? 'Only the last 4 digits are stored. A masked Aadhaar is fine.' : undefined} />
        <View className="flex-row"><View className="mr-3 flex-1">{slot('idFront', 'Front side')}</View><View className="flex-1">{slot('idBack', 'Back side (if any)')}</View></View>
      </Step>

      <Step n={3} title="You" done={youDone} index={2}>
        <Field label="Date of birth" value={form.dateOfBirth ? dateLong(form.dateOfBirth) : ''} placeholder="Select date" onPress={() => pickDate(form.dateOfBirth || new Date(1995, 0, 1), { maximumDate: new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()) }, set('dateOfBirth'))} error={errors.dateOfBirth} />
        <T variant="label" tone="muted" className="mb-1.5">Selfie</T>
        <View className="flex-row items-start">
          <View className="mr-3 w-1/2">{slot('selfie', 'Take a selfie', 'kyc_selfie')}</View>
          <View className="flex-1 flex-row items-start pt-1">
            <ScanFace size={16} color={colors.ink[500]} strokeWidth={2} />
            <T variant="caption" tone="subtle" className="ml-1.5 flex-1">Face the camera in good light, without sunglasses or a cap.</T>
          </View>
        </View>
      </Step>

      <PressableRow onPress={() => navigation.navigate('CmsPage', { slug: 'privacy-policy' })} />
      <SourceChooser visible={!!chooser} onClose={() => setChooser(null)} onPick={(source) => chooser && uploader.take(chooser.key, chooser.purpose, { source })} />
    </Screen>
  );
}

/** "How we protect your documents" link row. */
function PressableRow({ onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="mx-4 mt-5 min-h-[44px] flex-row items-center self-start rounded-full active:opacity-60">
      <LockKeyhole size={15} color={colors.brand[600]} strokeWidth={2.2} />
      <T variant="label" tone="brand" className="ml-1.5">How we protect your documents</T>
      <ChevronRight size={15} color={colors.brand[600]} strokeWidth={2.4} />
    </Pressable>
  );
}

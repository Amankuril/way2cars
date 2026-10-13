import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Screen, Header, T, Button, Section, Panel, Field, Loading, ErrorState, Notice, useToast, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money, dateTime } from '@shared/lib/format';
import { api } from '../../api';
import { useUploader } from '@shared/native';
import { currentPosition } from '@shared/native/app/location';
import { InspectionForm, validateInspection, inspectionPayload, emptyInspection } from '../../components/InspectionForm';

export function PickupScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const uploader = useUploader();
  const [form, setForm] = useState(emptyInspection);
  const [agree, setAgree] = useState(false);
  const [fullName, setFullName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}`) });
  const agreement = useQuery({ queryKey: ['agreement', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}/agreement`) });

  if (trip.isLoading || agreement.isLoading) return <Screen header={<Header title="Start trip" />} scroll={false}><Loading /></Screen>;
  if (trip.error || agreement.error) return <Screen header={<Header title="Start trip" />} scroll={false}><ErrorState error={trip.error || agreement.error} onRetry={() => { trip.refetch(); agreement.refetch(); }} /></Screen>;
  const isElectric = trip.data.vehicle?.fuelType === 'electric';
  const a = agreement.data;

  const submit = async () => {
    const e = validateInspection(form, uploader, isElectric);
    if (!agree || fullName.trim().length < 2) e.agreement = 'Type your full name and accept the agreement.';
    setErrors(e);
    if (Object.keys(e).length) return toast('Some details are missing', 'danger');
    setSubmitting(true);
    try {
      const pos = await currentPosition({ timeout: 4000 }).catch(() => null);
      await api.post(`/api/v1/user/bookings/${id}/pickup`, {
        ...inspectionPayload(form, uploader, isElectric),
        ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
        agreement: { accept: true, fullName: fullName.trim(), contentHash: a.contentHash },
      });
      qc.invalidateQueries({ queryKey: ['trip', id] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      toast('Trip started. Drive safe!', 'success');
      navigation.goBack();
    } catch (err) {
      if (err.code === 'AGREEMENT_CHANGED') agreement.refetch();
      toast(err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen header={<Header title="Start trip" subtitle={trip.data.vehicle?.title} />} footer={<Button title="Confirm pickup & start trip" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}>
      <Notice tone="info" className="mx-4 mt-4" title="Before you drive">Walk around the car and photograph each side. Note any existing scratches so you’re not charged for them later.</Notice>
      <InspectionForm uploader={uploader} form={form} setForm={setForm} isElectric={isElectric} errors={errors} />

      <Section title="Rental agreement">
        <Panel>
          <T variant="label">{a.title} · v{a.version}</T>
          <T variant="caption" tone="muted" className="mt-1">{a.summary.vehicle} ({a.summary.registrationNumber}) · {dateTime(a.summary.startAt)} → {dateTime(a.summary.endAt)} · deposit {money(a.summary.depositPaise)} · {a.summary.includedKm} km included, then {money(a.summary.extraKmChargePaise)}/km</T>
          <View className={cn('mt-3 overflow-hidden', !expanded && 'max-h-40')}>
            {a.blocks.map((blk, i) => blk.type === 'heading' ? <T key={i} variant="label" className="mt-3">{blk.text}</T> : blk.type === 'list' ? (
              <View key={i} className="mt-1">{blk.items.map((it, j) => <T key={j} variant="bodySm" tone="muted" className="mt-1">•  {it}</T>)}</View>
            ) : <T key={i} variant="bodySm" tone="muted" className="mt-1.5">{blk.text}</T>)}
          </View>
          <Pressable onPress={() => setExpanded((x) => !x)} className="mt-2 flex-row items-center self-start py-1">
            <T variant="label" tone="brand">{expanded ? 'Show less' : 'Read full agreement'}</T>
            {expanded ? <ChevronUp size={16} color={colors.brand[600]} /> : <ChevronDown size={16} color={colors.brand[600]} />}
          </Pressable>
          <View className="mt-3 border-t border-line pt-4">
            <Field label="Type your full name to sign" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <Pressable onPress={() => setAgree((x) => !x)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} className="flex-row items-start">
              <View className={cn('mt-0.5 h-5 w-5 items-center justify-center rounded-sm border-2', agree ? 'border-brand-500 bg-brand-500' : 'border-ink-300')}>{agree ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
              <T variant="bodySm" className="ml-3 flex-1">I have read and accept the rental agreement. I confirm the photos and readings above reflect the car’s condition at pickup.</T>
            </Pressable>
            {errors.agreement ? <T variant="caption" tone="danger" className="mt-2">{errors.agreement}</T> : null}
          </View>
        </Panel>
      </Section>
    </Screen>
  );
}

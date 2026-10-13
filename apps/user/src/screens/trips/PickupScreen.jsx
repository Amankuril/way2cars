import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, FileSignature, ShieldCheck, Clock, KeyRound, CircleSlash } from 'lucide-react-native';
import { Screen, T, Button, Field, ErrorState, EmptyState, useToast, cn, Card, HeroHeader, StepProgress, IconTile, FadeInView, GradientFill, Skeleton, SkeletonCard, TripRoute, DashedDivider } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { money, dateTime, dayLabel, timeLabel, duration } from '@shared/lib/format';
import { BOOKING_STATUS } from '@shared/lib/labels';
import { api } from '../../api';
import { useUploader } from '@shared/native';
import { currentPosition } from '@shared/native/app/location';
import { usePublicConfig } from '../../hooks/queries';
import { InspectionForm, validateInspection, inspectionPayload, emptyInspection, inspectionProgress, StepHeader } from '../../components/InspectionForm';
import { TripScene, VehicleStrip } from '../../components/TripScene';

const STEPS = ['Photos', 'Readings', 'Checklist', 'Sign'];

function Fact({ label, value, sub }) {
  return (
    <View className="mb-3 w-1/2 pr-2">
      <T variant="caption" tone="subtle">{label}</T>
      <T variant="label" className="mt-0.5" numberOfLines={2}>{value}</T>
      {sub ? <T variant="caption" tone="muted" numberOfLines={1}>{sub}</T> : null}
    </View>
  );
}

export function PickupScreen({ route, navigation }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const toast = useToast();
  const uploader = useUploader();
  const config = usePublicConfig();
  const [form, setForm] = useState(emptyInspection);
  const [agree, setAgree] = useState(false);
  const [fullName, setFullName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}`) });
  const agreement = useQuery({ queryKey: ['agreement', id], queryFn: () => api.get(`/api/v1/user/bookings/${id}/agreement`) });

  if (trip.isLoading || agreement.isLoading) {
    return (
      <Screen tone="hero" header={<HeroHeader compact title="Start trip" />}>
        <SkeletonCard height={92} className="mx-4 mt-4" />
        <Skeleton className="mx-4 mt-7 h-5 w-40 rounded-md" />
        <View className="mt-3 flex-row flex-wrap px-2.5">{[0, 1, 2, 3].map((i) => <View key={i} className="w-1/2 px-1.5"><Skeleton className="mb-3 h-28 rounded-xl" /></View>)}</View>
      </Screen>
    );
  }
  if (trip.error || agreement.error) return <Screen tone="hero" header={<HeroHeader compact title="Start trip" />} scroll={false}><ErrorState error={trip.error || agreement.error} onRetry={() => { trip.refetch(); agreement.refetch(); }} /></Screen>;
  const b = trip.data;
  const isElectric = b.vehicle?.fuelType === 'electric';
  const a = agreement.data;

  // Same gates as the trip screen / server: only a confirmed trip, from the pickup window until the end time.
  const windowMin = config.data?.booking?.pickupWindowMinutesBefore ?? 30;
  const opensAt = new Date(new Date(b.startAt).getTime() - windowMin * 60000);
  const now = Date.now();
  const blocked = b.status !== 'confirmed' ? 'status' : now < opensAt.getTime() ? 'early' : now > new Date(b.endAt).getTime() ? 'closed' : null;
  if (blocked) {
    const started = ['ongoing', 'return_pending', 'completed'].includes(b.status);
    const copy = blocked === 'early'
      ? { icon: Clock, title: `Pickup opens ${dayLabel(opensAt)}, ${timeLabel(opensAt)}`, message: `You can start the trip from ${windowMin} minutes before your start time. Come back then to inspect the car and sign the agreement.` }
      : blocked === 'closed'
        ? { icon: CircleSlash, tone: 'warning', title: 'This booking window has ended', message: 'Pickup is no longer available for this trip.' }
        : started
          ? { icon: KeyRound, tone: 'success', title: 'Pickup already done', message: `This trip is ${BOOKING_STATUS[b.status]?.label.toLowerCase()}. The pickup inspection was recorded when it started.` }
          : { icon: CircleSlash, tone: 'warning', title: 'This trip is not ready to start', message: `Status: ${BOOKING_STATUS[b.status]?.label || b.status}.` };
    return (
      <Screen tone="hero" header={<HeroHeader compact title="Start trip" subtitle={b.vehicle?.title} />} footer={<Button title="Back to trip" variant="secondary" size="lg" block onPress={() => navigation.goBack()} />}>
        <EmptyState art={<TripScene icon={copy.icon} tone={copy.tone} />} title={copy.title} message={copy.message} className="pb-6 pt-10" />
        <FadeInView index={2}>
          <Card className="mx-4 p-4">
            <VehicleStrip vehicle={b.vehicle} caption={`Ref ${b.ref}`} />
            <DashedDivider className="my-4" />
            <TripRoute
              start={{ overline: 'Pickup', title: dayLabel(b.startAt), subtitle: timeLabel(b.startAt) }}
              end={{ overline: 'Return', title: dayLabel(b.endAt), subtitle: timeLabel(b.endAt) }}
              label={duration(b.startAt, b.endAt)}
            />
          </Card>
        </FadeInView>
      </Screen>
    );
  }

  const prog = inspectionProgress(form, uploader, isElectric);
  const signed = agree && fullName.trim().length >= 2;
  const current = !prog.photos ? 0 : !prog.readings ? 1 : !prog.checklist ? 2 : !signed ? 3 : 4;

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
    <Screen
      tone="hero"
      header={(
        <HeroHeader compact title="Start trip" subtitle={b.vehicle?.title}>
          <StepProgress steps={STEPS} current={current} tone="inverse" className="mt-1" />
        </HeroHeader>
      )}
      footer={<Button title="Confirm pickup & start trip" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}
    >
      <FadeInView>
        <Card className="mx-4 mt-4 p-4">
          <VehicleStrip vehicle={b.vehicle} caption={`${dateTime(b.startAt)} → ${dateTime(b.endAt)}`} />
          <View className="mt-4 flex-row rounded-xl bg-brand-50 p-3">
            <ShieldCheck size={18} color={colors.brand[600]} strokeWidth={2.2} />
            <View className="ml-2.5 flex-1">
              <T variant="label" className="text-brand-800">Before you drive</T>
              <T variant="caption" tone="muted" className="mt-0.5">Walk around the car and photograph each side. Note any existing scratches so you’re not charged for them later.</T>
            </View>
          </View>
        </Card>
      </FadeInView>

      <InspectionForm uploader={uploader} form={form} setForm={setForm} isElectric={isElectric} errors={errors} />

      <StepHeader step={4} icon={FileSignature} title="Rental agreement" subtitle="Read it, then sign with your full name." />
      <Card className="mx-4 p-4">
        <View className="flex-row items-center">
          <IconTile icon={FileSignature} tone="accent" size={36} />
          <View className="ml-3 flex-1">
            <T variant="label">{a.title}</T>
            <T variant="caption" tone="subtle">Version {a.version}</T>
          </View>
        </View>

        <View className="mt-4 flex-row flex-wrap rounded-xl bg-canvas px-3 pt-3">
          <Fact label="Vehicle" value={a.summary.vehicle} sub={a.summary.registrationNumber} />
          <Fact label="Deposit" value={money(a.summary.depositPaise)} />
          <Fact label="Trip" value={`${dateTime(a.summary.startAt)} →`} sub={dateTime(a.summary.endAt)} />
          <Fact label="Kilometres" value={`${a.summary.includedKm} km included`} sub={`then ${money(a.summary.extraKmChargePaise)}/km`} />
        </View>

        <View className={cn('mt-3 overflow-hidden', !expanded && 'max-h-40')}>
          {a.blocks.map((blk, i) => blk.type === 'heading' ? <T key={i} variant="label" className="mt-3">{blk.text}</T> : blk.type === 'list' ? (
            <View key={i} className="mt-1">{blk.items.map((it, j) => <T key={j} variant="bodySm" tone="muted" className="mt-1">•  {it}</T>)}</View>
          ) : <T key={i} variant="bodySm" tone="muted" className="mt-1.5">{blk.text}</T>)}
          {!expanded ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 }}><GradientFill stops={['rgba(255,255,255,0)', '#FFFFFF']} angle="vertical" /></View> : null}
        </View>
        <Pressable onPress={() => setExpanded((x) => !x)} accessibilityRole="button" className="mt-1 min-h-[44px] flex-row items-center self-start">
          <T variant="label" tone="brand">{expanded ? 'Show less' : 'Read full agreement'}</T>
          {expanded ? <ChevronUp size={16} color={colors.brand[600]} /> : <ChevronDown size={16} color={colors.brand[600]} />}
        </Pressable>

        <DashedDivider className="my-3" />
        <Field label="Type your full name to sign" value={fullName} onChangeText={setFullName} autoCapitalize="words" inputClassName={fullName ? 'font-bold italic' : undefined} />
        <Pressable onPress={() => setAgree((x) => !x)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} className={cn('flex-row items-start rounded-xl border p-3', agree ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-surface')}>
          <View className={cn('mt-0.5 h-6 w-6 items-center justify-center rounded-[7px] border-2', agree ? 'border-brand-500 bg-brand-500' : 'border-ink-300 bg-surface')}>{agree ? <Check size={15} color="#fff" strokeWidth={3} /> : null}</View>
          <T variant="bodySm" className="ml-3 flex-1">I have read and accept the rental agreement. I confirm the photos and readings above reflect the car’s condition at pickup.</T>
        </Pressable>
        {errors.agreement ? <T variant="caption" tone="danger" className="mt-2">{errors.agreement}</T> : null}
      </Card>
    </Screen>
  );
}

import { useState } from 'react';
import { View } from '@/mobile/rn';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Info, AlarmClock, ShieldAlert, Hourglass, CircleSlash, Gauge, Fuel, ShieldCheck } from 'lucide-react';
import { Screen, T, Button, Field, ErrorState, EmptyState, PhotoTile, IconButton, Segmented, useToast, cn, Card, HeroHeader, StepProgress, FadeInView, Skeleton, SkeletonCard, Timeline, AnimatedNumber, IconTile, SectionHeader } from '@/mobile/ui';
import { colors } from '@shared/theme/tokens';
import { dateTime } from '@shared/lib/format';
import { BOOKING_STATUS, fuelLabel } from '@shared/lib/labels';
import { api } from '../../api';
import { useUploader } from '@/mobile/ui';
import { currentPosition } from '@/mobile/app/location';
import { InspectionForm, validateInspection, inspectionPayload, emptyInspection, inspectionProgress, StepHeader } from '../../components/InspectionForm';
import { TripScene, VehicleStrip } from '../../components/TripScene';

const STEPS = ['Photos', 'Readings', 'Checklist', 'Damage'];
const SEVERITY = [{ value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }];
const fmtKm = (n) => `${Number(n).toLocaleString('en-IN')} km`;

/** Shown once the return is submitted (status return_pending): what was recorded and what happens next. */
function UnderReview({ b, navigation }) {
  const t = b.trip || {};
  const hasKm = t.startOdometerKm !== undefined && t.endOdometerKm !== undefined;
  const hasFuel = t.startFuelEighths !== undefined && t.endFuelEighths !== undefined;
  return (
    <Screen tone="hero" header={<HeroHeader compact title="Return car" subtitle={b.vehicle?.title} />} footer={<Button title="Back to trip" variant="secondary" size="lg" block onPress={() => navigation.goBack()} />}>
      <EmptyState art={<TripScene icon={Hourglass} tone="warning" />} title="Return under review" message="The host is checking the car. Your deposit refund is calculated after their review." className="pb-6 pt-10" />
      {hasKm || hasFuel ? (
        <FadeInView index={1}>
          <SectionHeader title="What you recorded" />
          <Card className="mx-4 p-4">
            {hasKm ? (
              <View className="flex-row items-center">
                <IconTile icon={Gauge} tone="brand" size={40} />
                <View className="ml-3 flex-1">
                  <T variant="caption" tone="subtle">Odometer</T>
                  <T variant="label" className="mt-0.5">{fmtKm(t.startOdometerKm)} → {fmtKm(t.endOdometerKm)}</T>
                </View>
                <View className="items-end">
                  <AnimatedNumber value={fmtKm(t.endOdometerKm - t.startOdometerKm)} variant="headline" className="text-brand-700" />
                  <T variant="caption" tone="subtle">driven</T>
                </View>
              </View>
            ) : null}
            {hasKm && hasFuel ? <View className="my-3.5 h-px bg-line" /> : null}
            {hasFuel ? (
              <View className="flex-row items-center">
                <IconTile icon={Fuel} tone="accent" size={40} />
                <View className="ml-3 flex-1">
                  <T variant="caption" tone="subtle">Fuel</T>
                  <T variant="label" className="mt-0.5">{fuelLabel(t.startFuelEighths)} → {fuelLabel(t.endFuelEighths)}</T>
                </View>
                <View className="items-end">
                  <AnimatedNumber value={t.endFuelEighths === t.startFuelEighths ? 'Same' : `${Math.abs(t.endFuelEighths - t.startFuelEighths)}/8`} variant="headline" className={t.endFuelEighths < t.startFuelEighths ? 'text-warning-700' : 'text-success-700'} />
                  <T variant="caption" tone="subtle">{t.endFuelEighths === t.startFuelEighths ? 'as pickup' : t.endFuelEighths < t.startFuelEighths ? 'less' : 'more'}</T>
                </View>
              </View>
            ) : null}
          </Card>
        </FadeInView>
      ) : null}
      <FadeInView index={2}>
        <SectionHeader title="What happens next" className="mt-6" />
        <Card className="mx-4 p-4">
          <Timeline
            items={[
              { key: 'start', title: 'Trip started', subtitle: t.startedAt ? dateTime(t.startedAt) : undefined, state: 'done' },
              { key: 'ret', title: 'Car returned', subtitle: t.returnSubmittedAt ? dateTime(t.returnSubmittedAt) : undefined, state: 'done' },
              { key: 'review', title: 'Host reviews the car', state: 'current' },
              { key: 'settle', title: 'Deposit refund calculated', state: 'todo' },
            ]}
          />
        </Card>
      </FadeInView>
    </Screen>
  );
}

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

  if (trip.isLoading) {
    return (
      <Screen tone="hero" header={<HeroHeader compact title="Return car" />}>
        <SkeletonCard height={92} className="mx-4 mt-4" />
        <Skeleton className="mx-4 mt-7 h-5 w-40 rounded-md" />
        <View className="mt-3 flex-row flex-wrap px-2.5">{[0, 1, 2, 3].map((i) => <View key={i} className="w-1/2 px-1.5"><Skeleton className="mb-3 h-28 rounded-xl" /></View>)}</View>
      </Screen>
    );
  }
  if (trip.error) return <Screen tone="hero" header={<HeroHeader compact title="Return car" />} scroll={false}><ErrorState error={trip.error} onRetry={trip.refetch} /></Screen>;
  const b = trip.data;
  if (b.status === 'return_pending') return <UnderReview b={b} navigation={navigation} />;
  if (b.status !== 'ongoing') {
    return (
      <Screen tone="hero" header={<HeroHeader compact title="Return car" subtitle={b.vehicle?.title} />} footer={<Button title="Back to trip" variant="secondary" size="lg" block onPress={() => navigation.goBack()} />}>
        <EmptyState art={<TripScene icon={CircleSlash} tone="warning" />} title="This trip is not in progress" message={`Status: ${BOOKING_STATUS[b.status]?.label || b.status}. You can return the car only during an ongoing trip.`} className="pt-10" />
      </Screen>
    );
  }
  const isElectric = b.vehicle?.fuelType === 'electric';
  const late = Date.now() > new Date(b.endAt).getTime();

  const addDamage = () => setDamages((d) => [...d, { key: `dmg${Date.now()}`, area: '', description: '', severity: 'minor' }]);
  const update = (key, patch) => setDamages((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const prog = inspectionProgress(form, uploader, isElectric);
  const current = !prog.photos ? 0 : !prog.readings ? 1 : !prog.checklist ? 2 : 3;

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
    <Screen
      tone="hero"
      header={(
        <HeroHeader compact title="Return car" subtitle={b.vehicle?.title}>
          <StepProgress steps={STEPS} current={current} tone="inverse" className="mt-1" />
        </HeroHeader>
      )}
      footer={<Button title="Submit return" size="lg" block loading={submitting} disabled={uploader.busy} onPress={submit} />}
    >
      <FadeInView>
        <Card className="mx-4 mt-4 p-4">
          <VehicleStrip vehicle={b.vehicle} caption={`Due back ${dateTime(b.endAt)}`} />
          {late ? (
            <View className="mt-4 flex-row rounded-xl bg-warning-50 p-3">
              <AlarmClock size={18} color={colors.warning[600]} strokeWidth={2.2} />
              <View className="ml-2.5 flex-1">
                <T variant="label" className="text-warning-700">Returning late</T>
                <T variant="caption" tone="muted" className="mt-0.5">Your trip was due back at {dateTime(b.endAt)}. Late hours beyond the grace period are charged from your deposit.</T>
              </View>
            </View>
          ) : (
            <View className="mt-4 flex-row rounded-xl bg-brand-50 p-3">
              <Info size={18} color={colors.brand[600]} strokeWidth={2.2} />
              <View className="ml-2.5 flex-1">
                <T variant="label" className="text-brand-800">Almost done</T>
                <T variant="caption" tone="muted" className="mt-0.5">Park safely, lock the car and photograph it from all sides. Pickup reading was {b.trip?.startOdometerKm} km.</T>
              </View>
            </View>
          )}
        </Card>
      </FadeInView>

      <InspectionForm uploader={uploader} form={form} setForm={setForm} isElectric={isElectric} errors={errors} baseline={{ odometerKm: b.trip?.startOdometerKm, fuelEighths: b.trip?.startFuelEighths }} />

      <StepHeader step={4} icon={ShieldAlert} title="Damage during the trip" right={<Button title="Add" icon={Plus} variant="tonal" size="sm" onPress={addDamage} />} />
      {damages.length === 0 ? (
        <View className="mx-4 flex-row items-center rounded-2xl border border-dashed border-ink-200 bg-surface p-4">
          <IconTile icon={ShieldCheck} tone="success" size={40} />
          <View className="ml-3 flex-1">
            <T variant="label">Nothing to report?</T>
            <T variant="caption" tone="subtle" className="mt-0.5">Leave this empty. Tap Add for each new scratch or dent.</T>
          </View>
        </View>
      ) : damages.map((d, i) => (
        <FadeInView key={d.key}>
          <Card className="mx-4 mb-3 p-4">
            <View className="flex-row items-center">
              <T variant="label" className="flex-1">Damage {i + 1}</T>
              <IconButton icon={Trash2} label="Remove damage" onPress={() => { setDamages((x) => x.filter((y) => y.key !== d.key)); uploader.remove(d.key); }} />
            </View>
            <Segmented options={SEVERITY} value={d.severity} onChange={(v) => update(d.key, { severity: v })} className="mb-4 mt-2" />
            <Field label="Where on the car" value={d.area} onChangeText={(t) => update(d.key, { area: t })} placeholder="e.g. rear bumper" />
            <Field label="What happened" value={d.description} onChangeText={(t) => update(d.key, { description: t })} multiline />
            <PhotoTile label="Photo of the damage" aspect={2} source={uploader.slots[d.key]?.uri ? { uri: uploader.slots[d.key].uri } : undefined} state={uploader.slots[d.key]?.state} error={uploader.slots[d.key]?.error} onPress={() => uploader.take(d.key, 'damage_photo')} className="mb-0" />
          </Card>
        </FadeInView>
      ))}
      {errors.damages ? <T variant="caption" tone="danger" className={cn('px-4', damages.length === 0 && 'mt-2')}>{errors.damages}</T> : null}
    </Screen>
  );
}

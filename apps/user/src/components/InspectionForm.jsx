import { View, Pressable } from 'react-native';
import { Check, CheckCircle2, Gauge, Fuel, BatteryCharging, Camera, ClipboardCheck } from 'lucide-react-native';
import { T, Field, PhotoTile, Card, SectionHeader, IconTile, AnimatedNumber, FadeInView, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { CHECKLIST, PHOTO_ANGLE, fuelLabel } from '@shared/lib/labels';
import Svg, { Line } from 'react-native-svg';
import { FuelGauge } from './FuelGauge';

export const REQUIRED_ANGLES = ['front', 'rear', 'left', 'right'];
export const OPTIONAL_ANGLES = ['interior', 'dashboard'];

const fmtKm = (n) => `${Number(n).toLocaleString('en-IN')} km`;

/** Which parts of the inspection are complete — drives the screens' StepProgress. */
export function inspectionProgress(form, uploader, isElectric) {
  const photos = uploader.ids(REQUIRED_ANGLES).length >= REQUIRED_ANGLES.length;
  const readings = !!form.odometerKm && (isElectric ? form.batteryPercent !== '' && Number(form.batteryPercent) <= 100 : form.fuelEighths !== null);
  const checklist = Object.values(form.checklist).some(Boolean);
  return { photos, readings, checklist };
}

/** Section heading with a step eyebrow and a tinted icon. */
export function StepHeader({ step, icon, title, subtitle, right }) {
  return (
    <View className="mb-3 mt-7 flex-row items-center px-4">
      <IconTile icon={icon} tone="brand" size={40} />
      <View className="ml-3 flex-1">
        <T variant="overline" tone="brand">Step {step}</T>
        <T variant="headline" accessibilityRole="header">{title}</T>
        {subtitle ? <T variant="caption" tone="subtle" className="mt-0.5">{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** Small "x of n" counter pill. */
function Counter({ done, total, label }) {
  const full = done >= total;
  return (
    <View className={cn('ml-2 h-7 flex-row items-center rounded-full px-2.5', full ? 'bg-success-50' : 'bg-brand-50')}>
      {full ? <CheckCircle2 size={13} color={colors.success[600]} strokeWidth={2.4} /> : null}
      <T variant="caption" className={cn('font-bold', full ? 'ml-1 text-success-700' : 'text-brand-700')}>{done} of {total}{label ? ` ${label}` : ''}</T>
    </View>
  );
}

/** Photos (by angle), odometer, fuel/battery and checklist — shared by pickup and return.
 * `baseline` (return only): `{ odometerKm, fuelEighths }` recorded at pickup, used to show what changed. */
export function InspectionForm({ uploader, form, setForm, isElectric, errors = {}, baseline }) {
  const { slots, take } = uploader;
  const photosDone = uploader.ids(REQUIRED_ANGLES).length;
  const tile = (angle, required, i) => (
    <FadeInView key={angle} index={i} style={{ width: '50%', paddingHorizontal: 6 }}>
      <PhotoTile
        label={`${PHOTO_ANGLE[angle]}${required ? '' : ' (optional)'}`}
        source={slots[angle]?.uri ? { uri: slots[angle].uri } : undefined}
        state={slots[angle]?.state}
        error={slots[angle]?.error}
        onPress={() => take(angle, 'inspection_photo')}
      />
    </FadeInView>
  );

  const odo = form.odometerKm ? Number(form.odometerKm) : null;
  const startKm = baseline?.odometerKm;
  const driven = odo !== null && startKm !== undefined && startKm !== null && odo >= startKm ? odo - startKm : null;
  const startFuel = baseline?.fuelEighths ?? null;
  const fuelDiff = startFuel !== null && form.fuelEighths !== null ? form.fuelEighths - startFuel : null;
  const battery = form.batteryPercent === '' ? null : Number(form.batteryPercent);
  const gaugeValue = isElectric ? (battery !== null && battery <= 100 ? battery / 100 : null) : form.fuelEighths === null ? null : form.fuelEighths / 8;
  const checklistEntries = Object.entries(CHECKLIST);
  const okCount = checklistEntries.filter(([k]) => form.checklist[k]).length;

  return (
    <>
      <StepHeader step={1} icon={Camera} title="Photos of the car" subtitle="Take clear photos in good light. They’re the record of the car’s condition." />
      <View className="mx-4 mb-3 flex-row items-center">
        <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
          <View className={cn('h-1.5 rounded-full', photosDone >= REQUIRED_ANGLES.length ? 'bg-success-500' : 'bg-brand-500')} style={{ width: `${(photosDone / REQUIRED_ANGLES.length) * 100}%` }} />
        </View>
        <Counter done={photosDone} total={REQUIRED_ANGLES.length} label="required photos" />
      </View>
      <View className="flex-row flex-wrap px-2.5">{REQUIRED_ANGLES.map((a, i) => tile(a, true, i))}</View>
      <T variant="overline" tone="subtle" className="mb-2 mt-1 px-4">Optional</T>
      <View className="flex-row flex-wrap px-2.5">{OPTIONAL_ANGLES.map((a, i) => tile(a, false, i + 4))}</View>
      {errors.photos ? <T variant="caption" tone="danger" className="px-4">{errors.photos}</T> : null}

      <StepHeader step={2} icon={Gauge} title="Readings" subtitle={isElectric ? 'Odometer and battery level' : 'Odometer and fuel level'} />
      <Card className="mx-4 p-4">
        <Field label="Odometer (km)" keyboardType="number-pad" value={form.odometerKm} onChangeText={(t) => setForm((f) => ({ ...f, odometerKm: t.replace(/\D/g, '').slice(0, 7) }))} error={errors.odometerKm} placeholder="e.g. 24580" suffix={<T variant="label" tone="subtle">km</T>} />
        {startKm !== undefined && startKm !== null ? (
          <View className="-mt-1 mb-4 flex-row rounded-xl bg-canvas p-3">
            <View className="flex-1">
              <T variant="caption" tone="subtle">At pickup</T>
              <T variant="label" className="mt-0.5">{fmtKm(startKm)}</T>
            </View>
            <View className="mx-3 w-px bg-line" />
            <View className="flex-1">
              <T variant="caption" tone="subtle">Driven this trip</T>
              <AnimatedNumber value={driven === null ? '—' : fmtKm(driven)} variant="label" className={driven === null ? 'text-ink-400' : 'text-brand-700'} />
            </View>
          </View>
        ) : null}

        <View className="border-t border-line pt-4">
          {isElectric ? (
            <Field label="Battery (%)" keyboardType="number-pad" value={form.batteryPercent} onChangeText={(t) => setForm((f) => ({ ...f, batteryPercent: t.replace(/\D/g, '').slice(0, 3) }))} error={errors.batteryPercent} suffix={<T variant="label" tone="subtle">%</T>} />
          ) : (
            <View className="flex-row items-center justify-between">
              <T variant="label" tone="muted">Fuel level</T>
              <T variant="caption" tone="subtle">Tap the level below</T>
            </View>
          )}

          <View className="mt-2 items-center">
            <FuelGauge value={gaugeValue} marker={startFuel !== null && !isElectric ? startFuel / 8 : null} />
            <View className="w-[236px] flex-row items-start justify-between" style={{ marginTop: -14 }}>
              <T variant="label" tone="subtle" className="w-6 text-center font-bold">E</T>
              <View className="mt-4 items-center">
                <AnimatedNumber value={gaugeValue === null ? 'Select' : isElectric ? `${battery}%` : fuelLabel(form.fuelEighths)} variant={gaugeValue === null ? 'headline' : 'title'} className={gaugeValue === null ? 'text-ink-400' : 'text-ink-900'} />
                <View className="flex-row items-center">
                  {isElectric ? <BatteryCharging size={13} color={colors.ink[500]} /> : <Fuel size={13} color={colors.ink[500]} />}
                  <T variant="caption" tone="subtle" className="ml-1">{isElectric ? 'Battery' : 'Fuel'}</T>
                </View>
              </View>
              <T variant="label" tone="subtle" className="w-6 text-center font-bold">F</T>
            </View>
          </View>

          {!isElectric ? (
            <View className="mt-4">
              <View className="flex-row" accessibilityRole="adjustable" accessibilityLabel="Fuel level">
                {Array.from({ length: 9 }).map((_, i) => {
                  const lit = form.fuelEighths !== null && i <= form.fuelEighths && i > 0;
                  const sel = form.fuelEighths === i;
                  return (
                    <Pressable key={i} onPress={() => setForm((f) => ({ ...f, fuelEighths: i }))} className="flex-1 items-center px-0.5" accessibilityLabel={fuelLabel(i)} accessibilityState={{ selected: sel }}>
                      <View className={cn('h-10 w-full items-center justify-center rounded-lg', lit ? 'bg-brand-500' : sel ? 'bg-brand-50' : 'bg-ink-100', sel && 'border-2 border-brand-800')} />
                      <T variant="caption" className={cn('mt-1', sel ? 'font-extrabold text-brand-700' : 'text-ink-500')}>{i === 0 ? 'E' : i === 8 ? 'F' : i === 4 ? '½' : `${i}`}</T>
                    </Pressable>
                  );
                })}
              </View>
              {startFuel !== null ? (
                <View className="mt-3 flex-row items-center justify-between rounded-xl bg-canvas px-3 py-2.5">
                  <View className="flex-row items-center">
                    <Svg width={4} height={16}><Line x1={2} y1={1.5} x2={2} y2={14.5} stroke={colors.ink[700]} strokeWidth={2.5} strokeDasharray="3 2.5" strokeLinecap="round" /></Svg>
                    <T variant="caption" tone="muted" className="ml-2">At pickup: <T variant="caption" className="font-bold text-ink-900">{fuelLabel(startFuel)}</T></T>
                  </View>
                  {fuelDiff !== null ? (
                    <AnimatedNumber value={fuelDiff === 0 ? 'Same as pickup' : fuelDiff > 0 ? `${fuelDiff}/8 more` : `${-fuelDiff}/8 less`} variant="caption" className={cn('font-bold', fuelDiff < 0 ? 'text-warning-700' : 'text-success-700')} />
                  ) : null}
                </View>
              ) : null}
              {errors.fuelEighths ? <T variant="caption" tone="danger" className="mt-2">{errors.fuelEighths}</T> : null}
            </View>
          ) : null}
        </View>
      </Card>

      <StepHeader step={3} icon={ClipboardCheck} title="Checklist" subtitle="Leave an item unticked if it isn’t OK and describe it in the notes." />
      <Card className="mx-4">
        <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
          <T variant="label" tone="muted">Tick what’s OK</T>
          <Counter done={okCount} total={checklistEntries.length} label="OK" />
        </View>
        {checklistEntries.map(([k, label], i, arr) => {
          const on = form.checklist[k];
          return (
            <Pressable key={k} onPress={() => setForm((f) => ({ ...f, checklist: { ...f.checklist, [k]: !on } }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} className={cn('min-h-[52px] flex-row items-center px-4 py-3 active:bg-ink-50', i < arr.length - 1 && 'border-b border-line')}>
              <View className={cn('h-6 w-6 items-center justify-center rounded-[7px] border-2', on ? 'border-brand-500 bg-brand-500' : 'border-ink-300 bg-surface')}>{on ? <Check size={15} color="#fff" strokeWidth={3} /> : null}</View>
              <T variant="bodySm" className={cn('ml-3 flex-1', on ? 'font-semibold text-ink-900' : 'text-ink-700')}>{label}</T>
            </Pressable>
          );
        })}
      </Card>

      <SectionHeader title="Notes" className="mt-6" />
      <View className="mx-4"><Field multiline value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t.slice(0, 1000) }))} placeholder="Scratches, dents or anything else worth recording" className="mb-0" /></View>
    </>
  );
}

export function validateInspection(form, uploader, isElectric) {
  const errors = {};
  if (uploader.ids(REQUIRED_ANGLES).length < REQUIRED_ANGLES.length) errors.photos = 'Add the front, rear, left and right photos.';
  if (!form.odometerKm) errors.odometerKm = 'Enter the odometer reading.';
  if (isElectric && (form.batteryPercent === '' || Number(form.batteryPercent) > 100)) errors.batteryPercent = 'Enter a battery level between 0 and 100.';
  if (!isElectric && form.fuelEighths === null) errors.fuelEighths = 'Select the fuel level.';
  return errors;
}

export function inspectionPayload(form, uploader, isElectric) {
  return {
    photos: [...REQUIRED_ANGLES, ...OPTIONAL_ANGLES].filter((a) => uploader.slots[a]?.fileId).map((a) => ({ fileId: uploader.slots[a].fileId, angle: a })),
    odometerKm: Number(form.odometerKm),
    ...(isElectric ? { batteryPercent: Number(form.batteryPercent) } : { fuelEighths: form.fuelEighths }),
    checklist: Object.keys(CHECKLIST).map((item) => ({ item, ok: !!form.checklist[item] })),
    notes: form.notes.trim() || undefined,
  };
}

export const emptyInspection = () => ({ odometerKm: '', fuelEighths: null, batteryPercent: '', checklist: {}, notes: '' });

import { View, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { T, Field, PhotoTile, Section, Panel, cn } from '@shared/native';
import { colors } from '@shared/theme/tokens';
import { CHECKLIST, PHOTO_ANGLE, fuelLabel } from '@shared/lib/labels';

export const REQUIRED_ANGLES = ['front', 'rear', 'left', 'right'];
export const OPTIONAL_ANGLES = ['interior', 'dashboard'];

/** Photos (by angle), odometer, fuel/battery and checklist — shared by pickup and return. */
export function InspectionForm({ uploader, form, setForm, isElectric, errors = {} }) {
  const { slots, take } = uploader;
  const tile = (angle, required) => (
    <View key={angle} className="w-1/2 px-1.5">
      <PhotoTile
        label={`${PHOTO_ANGLE[angle]}${required ? '' : ' (optional)'}`}
        source={slots[angle]?.uri ? { uri: slots[angle].uri } : undefined}
        state={slots[angle]?.state}
        error={slots[angle]?.error}
        onPress={() => take(angle, 'inspection_photo')}
      />
    </View>
  );
  return (
    <>
      <Section title="Photos of the car" first>
        <T variant="bodySm" tone="muted" className="-mt-1 mb-3 px-4">Take clear photos in good light. They’re the record of the car’s condition.</T>
        <View className="flex-row flex-wrap px-2.5">{REQUIRED_ANGLES.map((a) => tile(a, true))}{OPTIONAL_ANGLES.map((a) => tile(a, false))}</View>
        {errors.photos ? <T variant="caption" tone="danger" className="px-4">{errors.photos}</T> : null}
      </Section>

      <Section title="Readings">
        <Panel>
          <Field label="Odometer (km)" keyboardType="number-pad" value={form.odometerKm} onChangeText={(t) => setForm((f) => ({ ...f, odometerKm: t.replace(/\D/g, '').slice(0, 7) }))} error={errors.odometerKm} placeholder="e.g. 24580" />
          {isElectric ? (
            <Field label="Battery (%)" keyboardType="number-pad" value={form.batteryPercent} onChangeText={(t) => setForm((f) => ({ ...f, batteryPercent: t.replace(/\D/g, '').slice(0, 3) }))} error={errors.batteryPercent} className="mb-0" />
          ) : (
            <View>
              <T variant="label" tone="muted" className="mb-2">Fuel level · {form.fuelEighths === null ? 'select' : fuelLabel(form.fuelEighths)}</T>
              <View className="flex-row" accessibilityRole="adjustable" accessibilityLabel="Fuel level">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Pressable key={i} onPress={() => setForm((f) => ({ ...f, fuelEighths: i }))} className="flex-1 items-center" accessibilityLabel={fuelLabel(i)}>
                    <View className={cn('mx-0.5 h-8 w-full rounded-sm', form.fuelEighths !== null && i <= form.fuelEighths && i > 0 ? 'bg-brand-500' : 'bg-ink-100', form.fuelEighths === i && 'border-2 border-brand-700')} />
                    <T variant="caption" tone="subtle" className="mt-1">{i === 0 ? 'E' : i === 8 ? 'F' : i === 4 ? '½' : ''}</T>
                  </Pressable>
                ))}
              </View>
              {errors.fuelEighths ? <T variant="caption" tone="danger" className="mt-1">{errors.fuelEighths}</T> : null}
            </View>
          )}
        </Panel>
      </Section>

      <Section title="Checklist">
        <Panel padded={false}>
          {Object.entries(CHECKLIST).map(([k, label], i, arr) => {
            const on = form.checklist[k];
            return (
              <Pressable key={k} onPress={() => setForm((f) => ({ ...f, checklist: { ...f.checklist, [k]: !on } }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} className={cn('flex-row items-center px-4 py-3', i < arr.length - 1 && 'border-b border-line')}>
                <View className={cn('h-5 w-5 items-center justify-center rounded-sm border-2', on ? 'border-brand-500 bg-brand-500' : 'border-ink-300')}>{on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
                <T variant="bodySm" className="ml-3 flex-1">{label}</T>
              </Pressable>
            );
          })}
        </Panel>
        <T variant="caption" tone="subtle" className="mx-4 mt-2">Leave an item unticked if it isn’t OK and describe it in the notes.</T>
      </Section>

      <Section title="Notes">
        <View className="px-4"><Field multiline value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t.slice(0, 1000) }))} placeholder="Scratches, dents or anything else worth recording" /></View>
      </Section>
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

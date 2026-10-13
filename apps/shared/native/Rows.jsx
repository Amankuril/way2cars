import { View, Pressable, Image } from 'react-native';
import { ChevronRight, Star } from 'lucide-react-native';
import { T } from './Text';
import { cn } from './cn';
import { colors } from '../theme/tokens';
import { initials } from '../lib/format';

/** Tappable list row: leading icon, title/subtitle, trailing value or chevron. */
export function ListItem({ icon: Icon, iconTone = 'brand', title, subtitle, value, right, onPress, chevron = !!onPress, danger, className, last }) {
  const Box = onPress ? Pressable : View;
  return (
    <Box onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} className={cn('flex-row items-center px-4 py-3.5 active:bg-ink-50', !last && 'border-b border-line', className)}>
      {Icon ? (
        <View className={cn('mr-3.5 h-9 w-9 items-center justify-center rounded-md', danger ? 'bg-danger-50' : iconTone === 'neutral' ? 'bg-ink-100' : 'bg-brand-50')}>
          <Icon size={18} color={danger ? colors.danger[600] : iconTone === 'neutral' ? colors.ink[700] : colors.brand[600]} strokeWidth={2} />
        </View>
      ) : null}
      <View className="flex-1">
        <T variant="body" tone={danger ? 'danger' : 'default'} className="font-semibold">{title}</T>
        {subtitle ? <T variant="caption" tone="subtle" className="mt-0.5">{subtitle}</T> : null}
      </View>
      {value !== undefined ? <T variant="bodySm" tone="muted" className="ml-3">{value}</T> : null}
      {right}
      {chevron ? <ChevronRight size={18} color={colors.ink[400]} style={{ marginLeft: 6 }} /> : null}
    </Box>
  );
}

/** Label/value line for summaries and price breakdowns. */
export function KeyValue({ label, value, strong, tone, hint, className }) {
  return (
    <View className={cn('flex-row items-start justify-between py-1.5', className)}>
      <View className="mr-4 flex-1">
        <T variant={strong ? 'body' : 'bodySm'} tone={strong ? 'default' : 'muted'} className={strong ? 'font-bold' : ''}>{label}</T>
        {hint ? <T variant="caption" tone="subtle">{hint}</T> : null}
      </View>
      <T variant={strong ? 'body' : 'bodySm'} tone={tone || 'default'} className={cn(strong ? 'font-extrabold' : 'font-semibold')} style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
    </View>
  );
}

export function Chip({ label, selected, onPress, icon: Icon, className }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} className={cn('mr-2 h-9 flex-row items-center rounded-full border px-3.5', selected ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-surface active:bg-ink-50', className)}>
      {Icon ? <Icon size={15} color={selected ? colors.brand[600] : colors.ink[600]} style={{ marginRight: 6 }} /> : null}
      <T variant="label" className={selected ? 'text-brand-700' : 'text-ink-700'}>{label}</T>
    </Pressable>
  );
}

/** Segmented tabs (e.g. Upcoming / Active / Past). */
export function Segmented({ options, value, onChange, className }) {
  return (
    <View className={cn('flex-row rounded-md bg-ink-100 p-1', className)} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: active }} className={cn('h-9 flex-1 items-center justify-center rounded-sm', active && 'bg-surface')}>
            <T variant="label" className={active ? 'text-ink-900' : 'text-ink-500'} numberOfLines={1}>{o.label}{o.count ? ` · ${o.count}` : ''}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ name, uri, size = 44 }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className="items-center justify-center bg-brand-100">
      <T variant="label" className="text-brand-700">{initials(name)}</T>
    </View>
  );
}

export function Rating({ value, count, size = 'sm' }) {
  if (!count) return <T variant="caption" tone="subtle">New</T>;
  return (
    <View className="flex-row items-center">
      <Star size={size === 'sm' ? 13 : 16} color={colors.warning[500]} fill={colors.warning[500]} />
      <T variant={size === 'sm' ? 'caption' : 'label'} className="ml-1 font-bold text-ink-800">{Number(value).toFixed(1)}</T>
      <T variant="caption" tone="subtle" className="ml-1">({count})</T>
    </View>
  );
}

/** Onboarding progress: "Step 2 of 4" with a segmented bar. */
export function Stepper({ steps, current }) {
  return (
    <View className="px-4 pt-3">
      <T variant="caption" tone="subtle">Step {current + 1} of {steps.length} · {steps[current]}</T>
      <View className="mt-2 flex-row">
        {steps.map((s, i) => <View key={s} className={cn('mr-1 h-1 flex-1 rounded-full', i <= current ? 'bg-brand-500' : 'bg-ink-200')} />)}
      </View>
    </View>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { View, ActivityIndicator, Modal, Pressable, SafeAreaView, OverlayContext } from '../rn';
import { AlertTriangle, CheckCircle2, Info, XCircle, WifiOff } from 'lucide-react';
import { T } from './Text';
import { Button } from './Button';
import { GradientFill } from './Surfaces';
import Svg, { Circle, Path } from '../svg';
import { cn } from './cn';
import { colors, shadows, gradients } from '@shared/theme/tokens';
import './kit.css';

const TONES = {
  neutral: { bg: 'bg-ink-100', text: 'text-ink-700', dot: colors.ink[500] },
  info: { bg: 'bg-brand-50', text: 'text-brand-700', dot: colors.brand[500] },
  success: { bg: 'bg-success-50', text: 'text-success-700', dot: colors.success[600] },
  warning: { bg: 'bg-warning-50', text: 'text-warning-700', dot: colors.warning[600] },
  danger: { bg: 'bg-danger-50', text: 'text-danger-700', dot: colors.danger[600] },
};

/** Status pill: { label, tone } from shared/lib/labels. */
export function Pill({ label, tone = 'neutral', className }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View className={cn('flex-row items-center self-start rounded-full px-2.5 py-1', t.bg, className)}>
      <View className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.dot }} />
      <T variant="caption" className={cn('font-semibold', t.text)}>{label}</T>
    </View>
  );
}

const NOTICE_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
/** Inline notice for important states (KYC needed, payment pending, etc.). */
export function Notice({ tone = 'info', title, children, action, className }) {
  const Icon = NOTICE_ICON[tone] || Info; // native has no 'neutral' icon (renders undefined → crash); fall back to Info
  const t = TONES[tone];
  return (
    <View className={cn('flex-row rounded-md p-3.5', t.bg, className)}>
      <Icon size={18} color={t.dot} strokeWidth={2.2} />
      <View className="ml-3 flex-1">
        {title ? <T variant="label" className={t.text}>{title}</T> : null}
        {children ? <T variant="bodySm" tone="muted" className={title ? 'mt-0.5' : ''}>{children}</T> : null}
        {action ? <View className="mt-2.5 flex-row">{action}</View> : null}
      </View>
    </View>
  );
}

export function Loading({ label, full = true }) {
  return (
    <View className={cn('items-center justify-center py-10', full && 'flex-1')}>
      <ActivityIndicator color={colors.brand[500]} size="large" />
      {label ? <T variant="bodySm" tone="subtle" className="mt-3">{label}</T> : null}
    </View>
  );
}

/** Illustrated badge for empty/error states: soft halo, dashed orbit, confetti dots and a gradient icon tile. */
export function EmptyArt({ icon: Icon, tone = 'brand' }) {
  const danger = tone === 'danger';
  return (
    <View style={{ width: 148, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={148} height={120} viewBox="0 0 148 120" style={{ position: 'absolute', left: 0, top: 0 }}>
        <Circle cx="74" cy="60" r="54" fill={danger ? colors.danger[50] : colors.brand[50]} />
        <Circle cx="74" cy="60" r="43" fill="none" stroke={danger ? colors.danger[100] : colors.brand[200]} strokeWidth="1.5" strokeDasharray="4 6" />
        <Circle cx="16" cy="34" r="4" fill={colors.accent[300]} />
        <Circle cx="134" cy="24" r="3" fill={colors.brand[300]} />
        <Circle cx="130" cy="98" r="5" fill={colors.accent[200]} />
        <Circle cx="22" cy="96" r="3" fill={colors.brand[200]} />
        <Path d="M120 50 v8 M116 54 h8" stroke={colors.accent[400]} strokeWidth="2" strokeLinecap="round" />
        <Path d="M30 14 v6 M27 17 h6" stroke={colors.brand[300]} strokeWidth="2" strokeLinecap="round" />
      </Svg>
      <View style={{ width: 64, height: 64, borderRadius: 20, boxShadow: danger ? undefined : shadows.brand, transform: [{ rotate: '-6deg' }] }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <GradientFill stops={danger ? [colors.danger[500], colors.warning[500]] : gradients.brand} />
          {Icon ? <Icon size={28} color="#fff" strokeWidth={2} /> : null}
        </View>
      </View>
    </View>
  );
}

/** Empty state with an illustration (or custom `art`, e.g. <CarArt still />), title, message and action. */
export function EmptyState({ icon, title, message, action, className, art, tone }) {
  return (
    <View className={cn('items-center px-8 py-12', className)}>
      <View className="w2c-pop-in" style={{ marginBottom: 12 }}>
        {art || <EmptyArt icon={icon} tone={tone} />}
      </View>
      <View className="w2c-fade-up" style={{ alignItems: 'center', animationDelay: '120ms' }}>
        <T variant="headline" className="text-center">{title}</T>
        {message ? <T variant="bodySm" tone="muted" className="mt-1.5 text-center">{message}</T> : null}
        {action ? <View className="mt-5">{action}</View> : null}
      </View>
    </View>
  );
}

export function ErrorState({ error, onRetry, className }) {
  const offline = error?.code === 'NETWORK' || error?.code === 'TIMEOUT';
  return (
    <EmptyState
      className={className}
      icon={offline ? WifiOff : AlertTriangle}
      tone="danger"
      title={offline ? 'You’re offline' : 'Something went wrong'}
      message={error?.message || 'Please try again.'}
      action={onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    />
  );
}

/** Placeholder block for loading layouts, with a light sweep (shimmer) like the native Reanimated loop. */
export function Skeleton({ className, style }) {
  return <View className={cn('w2c-skeleton overflow-hidden rounded-md bg-ink-100', className)} style={style} aria-hidden />;
}

export function SkeletonVehicleCard({ compact, className }) {
  return (
    <View className={cn('rounded-2xl bg-surface p-3', compact ? 'w-64' : 'mx-4 mb-4', className)} style={{ boxShadow: shadows.card }}>
      <Skeleton className="rounded-xl" style={{ aspectRatio: compact ? 16 / 10 : 16 / 9 }} />
      <Skeleton className="mt-3 h-4 w-3/5" />
      <Skeleton className="mt-2 h-3 w-2/5" />
      <View className="mt-3 flex-row"><Skeleton className="mr-2 h-7 w-20 rounded-full" /><Skeleton className="mr-2 h-7 w-20 rounded-full" /><Skeleton className="h-7 w-16 rounded-full" /></View>
      <Skeleton className="mt-3 h-6 w-1/3" />
    </View>
  );
}

export function SkeletonRow({ className }) {
  return (
    <View className={cn('flex-row items-center px-4 py-3.5', className)}>
      <Skeleton className="h-11 w-11 rounded-xl" />
      <View className="ml-3.5 flex-1"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="mt-2 h-3 w-1/3" /></View>
    </View>
  );
}

export function SkeletonCard({ height = 120, className }) {
  return (
    <View className={cn('mx-4 rounded-2xl bg-surface p-4', className)} style={{ boxShadow: shadows.card }}>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="mt-3 w-full" style={{ height: Math.max(24, height - 56) }} />
    </View>
  );
}

/** Bottom sheet: dimmed backdrop (tap to close), rounded top panel with grab handle; springs up. */
export function Sheet({ visible, onClose, title, children, footer, webLayer }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} webLayer={webLayer}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="flex-1 cursor-default" onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} className="w2c-sheet-up max-h-[88%] rounded-t-3xl bg-surface">
          <View className="items-center pt-2.5"><View className="h-1 w-10 rounded-full bg-ink-200" /></View>
          {title ? <T variant="headline" className="px-5 pb-2 pt-3">{title}</T> : null}
          <View className="shrink">{children}</View>
          {footer ? <View className="border-t border-line px-4 py-3">{footer}</View> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Confirmation dialog for destructive or money-moving actions. The card pops in with a spring. */
export function Confirm({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', loading, onConfirm, onCancel, children }) {
  const danger = tone === 'danger';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/45 px-6">
        <View className="w2c-dialog-in w-full rounded-3xl bg-surface p-5" style={{ boxShadow: shadows.float }} accessibilityRole="alert">
          <View className={cn('mb-3 h-11 w-11 items-center justify-center rounded-xl', danger ? 'bg-danger-50' : 'bg-brand-50')}>
            {danger ? <AlertTriangle size={21} color={colors.danger[600]} strokeWidth={2.2} /> : <Info size={21} color={colors.brand[600]} strokeWidth={2.2} />}
          </View>
          <T variant="headline">{title}</T>
          {message ? <T variant="bodySm" tone="muted" className="mt-2">{message}</T> : null}
          {children}
          <View className="mt-5 flex-row">
            <Button title={cancelLabel} variant="secondary" className="flex-1" onPress={onCancel} disabled={loading} />
            <Button title={confirmLabel} variant={danger ? 'danger' : 'primary'} className="ml-2.5 flex-1" onPress={onConfirm} loading={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- toasts
const TOAST = {
  neutral: { bg: colors.ink[900], icon: Info },
  success: { bg: colors.success[700], icon: CheckCircle2 },
  danger: { bg: colors.danger[700], icon: XCircle },
  warning: { bg: colors.warning[700], icon: AlertTriangle },
};
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

/** toast(message, tone?) — dark snackbar above the tab bar for 3.2s. Mount inside MobileFrame. */
export function ToastProvider({ children }) {
  const host = useContext(OverlayContext);
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((message, tone = 'neutral') => {
    clearTimeout(timer.current);
    setToast({ message, tone, id: Date.now(), leaving: false });
    timer.current = setTimeout(() => {
      setToast((t) => (t ? { ...t, leaving: true } : t));
      timer.current = setTimeout(() => setToast(null), 200);
    }, 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const t = TOAST[toast?.tone] || TOAST.neutral;
  const Icon = t.icon;
  const node = toast ? (
    <View key={toast.id} pointerEvents="none" className={cn('absolute bottom-24 left-4 right-4 z-40', toast.leaving ? 'rn-anim-fade-out' : 'w2c-toast-in')}>
      <View className="flex-row items-center rounded-xl px-4 py-3" style={{ backgroundColor: t.bg, boxShadow: shadows.raised }} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Icon size={18} color="#fff" strokeWidth={2.2} />
        <T variant="bodySm" tone="inverse" className="ml-2.5 flex-1">{toast.message}</T>
      </View>
    </View>
  ) : null;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {node ? (host ? createPortal(node, host) : node) : null}
    </ToastCtx.Provider>
  );
}

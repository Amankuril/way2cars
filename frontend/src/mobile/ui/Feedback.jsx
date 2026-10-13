import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { View, ActivityIndicator, Modal, Pressable, SafeAreaView, OverlayContext } from '../rn';
import { AlertTriangle, CheckCircle2, Info, XCircle, WifiOff } from 'lucide-react';
import { T } from './Text';
import { Button } from './Button';
import { cn } from './cn';
import { colors, shadows } from '@shared/theme/tokens';
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

export function EmptyState({ icon: Icon, title, message, action, className }) {
  return (
    <View className={cn('items-center px-8 py-14', className)}>
      {Icon ? (
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <Icon size={28} color={colors.brand[500]} strokeWidth={1.8} />
        </View>
      ) : null}
      <T variant="headline" className="text-center">{title}</T>
      {message ? <T variant="bodySm" tone="muted" className="mt-1.5 text-center">{message}</T> : null}
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, className }) {
  const offline = error?.code === 'NETWORK' || error?.code === 'TIMEOUT';
  return (
    <EmptyState
      className={className}
      icon={offline ? WifiOff : AlertTriangle}
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

/** Confirmation dialog for destructive or money-moving actions. */
export function Confirm({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', loading, onConfirm, onCancel, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full rounded-lg bg-surface p-5" accessibilityRole="alert">
          <T variant="headline">{title}</T>
          {message ? <T variant="bodySm" tone="muted" className="mt-2">{message}</T> : null}
          {children}
          <View className="mt-5 flex-row justify-end">
            <Button title={cancelLabel} variant="ghost" size="sm" onPress={onCancel} disabled={loading} />
            <Button title={confirmLabel} variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" className="ml-2" onPress={onConfirm} loading={loading} />
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

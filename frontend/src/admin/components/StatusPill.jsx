import { cn } from '@/lib/utils.js';
import { statusInfo } from '@/lib/labels.js';

const TONES = {
  neutral: 'bg-ink-100 text-ink-700',
  info: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};
const DOTS = {
  neutral: 'bg-ink-400',
  info: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

/** Pill for a status value: <StatusPill map={BOOKING_STATUS} value="confirmed" /> or tone + children. */
export function StatusPill({ map, value, tone, children, className, dot = true }) {
  const info = map ? statusInfo(map, value) : { label: children, tone: tone || 'neutral' };
  const t = tone || info.tone || 'neutral';
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold', TONES[t], className)}>
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[t])} aria-hidden="true" /> : null}
      {children && map ? children : info.label}
    </span>
  );
}

/** Small neutral tag (e.g. "Luxury", "Featured"). */
export function Tag({ children, tone = 'neutral', className }) {
  return <span className={cn('inline-flex items-center rounded-sm px-1.5 py-0.5 text-overline uppercase tracking-wider', TONES[tone], className)}>{children}</span>;
}

import { forwardRef } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils.js';

export function Spinner({ className }) {
  return (
    <svg className={cn('animate-spin', className || 'h-4 w-4')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const VARIANTS = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 border border-brand-500 hover:border-brand-600',
  secondary: 'bg-surface text-ink-800 border border-line hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100',
  ghost: 'bg-transparent text-ink-700 border border-transparent hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-danger-600 text-white border border-danger-600 hover:bg-danger-700 hover:border-danger-700',
  'danger-outline': 'bg-surface text-danger-600 border border-danger-100 hover:bg-danger-50 hover:border-danger-500',
  success: 'bg-success-600 text-white border border-success-600 hover:bg-success-700 hover:border-success-700',
  link: 'bg-transparent text-brand-600 border border-transparent hover:text-brand-700 hover:underline underline-offset-2 px-0',
};
const SIZES = {
  xs: 'h-7 px-2 text-caption gap-1 rounded-sm',
  sm: 'h-8 px-3 text-label gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-label gap-2 rounded-md',
  lg: 'h-10 px-4 text-bodySm font-semibold gap-2 rounded-md',
};

function classes({ variant = 'secondary', size = 'md', className, block }) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    VARIANTS[variant],
    SIZES[size],
    variant === 'link' && 'h-auto',
    block && 'w-full',
    className,
  );
}

export const Button = forwardRef(function Button(
  { variant, size, icon: Icon, iconRight: IconRight, loading, disabled, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes({ variant, size, className, block })} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} /> : null}
      {children}
      {IconRight && !loading ? <IconRight className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} /> : null}
    </button>
  );
});

export function ButtonLink({ to, variant, size, icon: Icon, className, children, block, ...rest }) {
  return (
    <Link to={to} className={classes({ variant, size, className, block })} {...rest}>
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} /> : null}
      {children}
    </Link>
  );
}

export function IconButton({ icon: Icon, label, className, size = 'md', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        className,
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
    </button>
  );
}

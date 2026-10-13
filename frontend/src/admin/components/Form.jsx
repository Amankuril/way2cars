import { forwardRef, useId } from 'react';
import { cn } from '@/admin/lib/utils.js';

/** Label above the control, hint or error below. Pass `htmlFor` matching the control id. */
export function Field({ label, htmlFor, hint, error, required, children, className, aside }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="text-label text-ink-800">
            {label}
            {required ? <span className="ml-0.5 text-danger-600" aria-hidden="true">*</span> : null}
          </label>
          {aside}
        </div>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-caption font-semibold text-danger-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-caption text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cn('input h-9', invalid && 'input-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('input resize-y leading-relaxed', invalid && 'input-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'input h-9 appearance-none bg-[length:16px_16px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23728189' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        invalid && 'input-invalid',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Input with a fixed prefix/suffix adornment (₹, %, km, min…). */
export const AffixInput = forwardRef(function AffixInput({ prefix, suffix, className, invalid, ...rest }, ref) {
  return (
    <div className={cn('relative', className)}>
      {prefix ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-bodySm font-semibold text-ink-500">{prefix}</span> : null}
      <input
        ref={ref}
        className={cn('input num h-9', prefix && 'pl-7', suffix && 'pr-12', invalid && 'input-invalid')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption font-semibold text-ink-500">{suffix}</span> : null}
    </div>
  );
});

/** Rupee input. The value is rupees as typed; convert with toPaise() before sending. */
export const MoneyInput = forwardRef(function MoneyInput(props, ref) {
  return <AffixInput ref={ref} prefix="₹" inputMode="decimal" autoComplete="off" placeholder="0" {...props} />;
});

export const PercentInput = forwardRef(function PercentInput(props, ref) {
  return <AffixInput ref={ref} suffix="%" inputMode="decimal" autoComplete="off" {...props} />;
});

export const Checkbox = forwardRef(function Checkbox({ label, description, className, id, ...rest }, ref) {
  const auto = useId();
  const cid = id || auto;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        ref={ref}
        id={cid}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-sm border-ink-300 text-brand-500 accent-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        {...rest}
      />
      {label ? (
        <label htmlFor={cid} className="cursor-pointer select-none">
          <span className="block text-bodySm font-semibold text-ink-800">{label}</span>
          {description ? <span className="block text-caption text-ink-500">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
});

/** Controlled on/off switch (role="switch"). */
export function Switch({ checked, onChange, label, description, disabled, id, className }) {
  const auto = useId();
  const sid = id || auto;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {label ? (
        <label htmlFor={sid} className="cursor-pointer select-none">
          <span className="block text-bodySm font-semibold text-ink-800">{label}</span>
          {description ? <span className="block text-caption text-ink-500">{description}</span> : null}
        </label>
      ) : null}
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-brand-500' : 'bg-ink-300',
        )}
      >
        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Section of a long form: heading + description on the left, fields on the right. */
export function FormSection({ title, description, children, className }) {
  return (
    <section className={cn('grid gap-6 border-b border-line py-6 last:border-b-0 lg:grid-cols-[260px_1fr]', className)}>
      <div>
        <h3 className="text-bodySm font-bold text-ink-900">{title}</h3>
        {description ? <p className="mt-1 text-caption text-ink-500">{description}</p> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** Sticky bar for long forms. */
export function StickySaveBar({ dirty, children, message }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="mr-auto text-caption text-ink-500">{message ?? (dirty ? 'You have unsaved changes.' : 'All changes saved.')}</p>
        {children}
      </div>
    </div>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, TriangleAlert } from 'lucide-react';
import { Button } from './Button.jsx';
import { Field, Textarea } from './Form.jsx';
import { cn, errorMessage } from '@/admin/lib/utils.js';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog: focus moves inside, Tab is trapped, Esc / backdrop closes. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissable = true }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previously = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE);
    (first || node)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        closeRef.current?.();
      }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previously?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose?.()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn('my-8 w-full rounded-lg border border-line bg-surface shadow-pop focus:outline-none', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-headline text-ink-900">{title}</h2>
            {description ? <p id={descId} className="mt-1 text-bodySm text-ink-600">{description}</p> : null}
          </div>
          {dismissable ? (
            <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close dialog">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-ink-50/60 px-5 py-3 rounded-b-lg">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation for destructive / money actions. `onConfirm(reason)` may return a promise; the
 * dialog shows a spinner and keeps itself open with the error if it rejects.
 * `reason`: { label, placeholder, minLength, required, hint } renders a reason textarea.
 */
export function ConfirmDialog({ open, onClose, title, description, confirmLabel = 'Confirm', tone = 'primary', reason, onConfirm, children, size = 'sm' }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const reasonId = useId();

  useEffect(() => {
    if (open) {
      setText('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const min = reason?.minLength ?? (reason?.required === false ? 0 : 3);
  const tooShort = reason && (reason.required !== false || text.trim()) && text.trim().length < min;

  const submit = async (e) => {
    e?.preventDefault();
    if (tooShort) {
      setError({ message: `Enter at least ${min} characters.` });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm?.(text.trim() || undefined);
      onClose?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissable={!busy}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'primary'} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {children}
        {reason ? (
          <Field label={reason.label || 'Reason'} htmlFor={reasonId} hint={reason.hint} required={reason.required !== false}>
            <Textarea id={reasonId} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} maxLength={reason.maxLength || 300} data-autofocus />
          </Field>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-danger-100 bg-danger-50 p-3 text-caption text-danger-700" role="alert">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage(error)}</span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

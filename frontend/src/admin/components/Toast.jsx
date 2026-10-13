import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { cn, errorMessage } from '@/lib/utils.js';

const ToastContext = createContext(null);
const ICONS = { success: CircleCheck, error: CircleX, info: Info };
const TONE = {
  success: 'text-success-600',
  error: 'text-danger-600',
  info: 'text-brand-500',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone, title, description) => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-3), { id, tone, title, description }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (title, description) => push('success', title, description),
      info: (title, description) => push('info', title, description),
      error: (titleOrErr, description) =>
        typeof titleOrErr === 'string' ? push('error', titleOrErr, description) : push('error', 'Action failed', errorMessage(titleOrErr)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-pop">
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', TONE[t.tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-label text-ink-900">{t.title}</p>
                {t.description ? <p className="mt-0.5 break-words text-caption text-ink-600">{t.description}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="rounded-sm p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Dismiss notification">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

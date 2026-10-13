import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { uploadFile } from '@/lib/api.js';
import { cn, errorMessage } from '@/lib/utils.js';
import { Button } from './Button.jsx';

const MAX_MB = 8;

/**
 * Image picker that uploads immediately to POST /admin/uploads with a purpose and reports
 * { id, url } through onChange. `value` is { id, url } (or url-only for an existing image).
 */
export function ImageUpload({ purpose, value, onChange, label = 'Image', hint, error, aspect = 'aspect-[16/9]', allowRemove = true, className, previewFit = 'object-cover' }) {
  const inputId = useId();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);

  const pick = async (file) => {
    if (!file) return;
    setLocalError(null);
    if (!file.type.startsWith('image/')) {
      setLocalError('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(`The image must be smaller than ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      const f = await uploadFile(file, purpose);
      onChange?.({ id: f.id, url: f.url });
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const shownError = localError || error;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={inputId} className="mb-1.5 block text-label text-ink-800">{label}</label>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn('relative w-48 shrink-0 overflow-hidden rounded-md border bg-ink-50', aspect, shownError ? 'border-danger-500' : 'border-line')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          {value?.url ? (
            <img src={value.url} alt="" className={cn('h-full w-full', previewFit)} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-caption text-ink-400">
              <ImagePlus className="h-6 w-6" aria-hidden="true" />
              No image
            </div>
          )}
          {busy ? <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-caption font-semibold text-ink-700">Uploading…</div> : null}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          <Button size="sm" icon={Upload} loading={busy} onClick={() => input.current?.click()}>
            {value?.url ? 'Replace image' : 'Upload image'}
          </Button>
          {allowRemove && value?.url ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange?.(null)} disabled={busy}>
              Remove
            </Button>
          ) : null}
          <p className="max-w-[220px] text-caption text-ink-500">{hint || `JPG, PNG or WebP up to ${MAX_MB} MB. Drag & drop works too.`}</p>
        </div>
      </div>
      {shownError ? <p className="mt-1.5 text-caption font-semibold text-danger-600" role="alert">{shownError}</p> : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { FileText, ImageOff, Lock, ExternalLink, ZoomIn } from 'lucide-react';
import { fetchBlob, openFileInNewTab } from '@/lib/api.js';
import { cn, errorMessage } from '@/lib/utils.js';
import { useToast } from './Toast.jsx';
import { Modal } from './Modal.jsx';
import { Spinner } from './Button.jsx';

const filePath = (fileId) => `/api/v1/files/${fileId}`;

/** Loads a private file with the admin's Bearer token and exposes it as an object URL. */
function useSecureFile(fileId) {
  const [state, setState] = useState({ status: fileId ? 'loading' : 'empty', url: null, type: null, error: null });
  useEffect(() => {
    if (!fileId) {
      setState({ status: 'empty', url: null, type: null, error: null });
      return undefined;
    }
    let url = null;
    let cancelled = false;
    setState({ status: 'loading', url: null, type: null, error: null });
    fetchBlob(filePath(fileId))
      .then(({ blob, type }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: 'ready', url, type: type || blob.type, error: null });
      })
      .catch((error) => !cancelled && setState({ status: 'error', url: null, type: null, error }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);
  return state;
}

/**
 * Private image (KYC document, selfie, inspection photo, vehicle document). Click to enlarge.
 * PDFs show a document tile that opens in a new tab.
 */
export function SecureImage({ fileId, alt, caption, className, aspect = 'aspect-[4/3]', fit = 'object-cover' }) {
  const { status, url, type, error } = useSecureFile(fileId);
  const [zoom, setZoom] = useState(false);
  const toast = useToast();
  const isPdf = type?.includes('pdf');

  return (
    <figure className={cn('min-w-0', className)}>
      <div className={cn('relative overflow-hidden rounded-md border border-line bg-ink-50', aspect)}>
        {status === 'loading' ? (
          <div className="absolute inset-0 flex items-center justify-center text-ink-400" role="status" aria-label="Loading image">
            <Spinner className="h-5 w-5" />
          </div>
        ) : status === 'empty' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-caption text-ink-400">
            <ImageOff className="h-5 w-5" aria-hidden="true" /> Not provided
          </div>
        ) : status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-caption text-danger-600" title={errorMessage(error)}>
            <Lock className="h-5 w-5" aria-hidden="true" />
            {error?.status === 403 ? 'No permission to view' : 'Could not load file'}
          </div>
        ) : isPdf ? (
          <button
            type="button"
            onClick={() => openFileInNewTab(filePath(fileId)).catch((e) => toast.error(e))}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-600 hover:bg-ink-100"
          >
            <FileText className="h-8 w-8 text-brand-500" aria-hidden="true" />
            <span className="text-caption font-semibold">Open PDF</span>
          </button>
        ) : (
          <button type="button" onClick={() => setZoom(true)} className="group absolute inset-0" aria-label={`Enlarge ${alt || 'image'}`}>
            <img src={url} alt={alt || ''} className={cn('h-full w-full', fit)} />
            <span className="absolute right-2 top-2 rounded-md bg-ink-950/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      {caption ? <figcaption className="mt-1.5 text-caption font-semibold text-ink-600">{caption}</figcaption> : null}
      {url && !isPdf ? (
        <Modal open={zoom} onClose={() => setZoom(false)} title={alt || caption || 'Image'} size="xl">
          <img src={url} alt={alt || ''} className="mx-auto max-h-[75vh] w-auto rounded-md" />
        </Modal>
      ) : null}
    </figure>
  );
}

/** Button/link that opens a private file (PDF or image) in a new tab via a blob URL. */
export function SecureFileLink({ fileId, children = 'View file', className }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!fileId) return <span className="text-ink-400">Not provided</span>;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await openFileInNewTab(filePath(fileId));
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }}
      className={cn('inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 hover:underline disabled:opacity-60', className)}
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}

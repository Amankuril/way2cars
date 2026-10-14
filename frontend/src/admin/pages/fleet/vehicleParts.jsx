import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { dateLong } from '@shared/lib/format.js';
import { INSURANCE } from '@/admin/lib/labels.js';
import { cn } from '@/admin/lib/utils.js';
import { Modal } from '@/admin/components/Modal.jsx';
import { IconButton } from '@/admin/components/Button.jsx';
import { SecureFileLink } from '@/admin/components/SecureImage.jsx';
import { MiniTable } from '@/admin/components/MiniTable.jsx';

/** Shared car-listing pieces for the vehicle detail and vehicle request pages. */

export const DOCS = [
  { key: 'rc', label: 'Registration certificate (RC)' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'puc', label: 'Pollution certificate (PUC)' },
  { key: 'fitness', label: 'Fitness certificate' },
];

/** Required documents uploaded (RC, insurance and — except EVs — PUC). */
export function docCount(v) {
  const required = v.fuelType === 'electric' ? ['rc', 'insurance'] : ['rc', 'insurance', 'puc'];
  return { have: required.filter((k) => v.documents?.[k]?.fileId).length, need: required.length };
}

/** Large photo with thumbnails; click the photo to enlarge (arrow keys / buttons to browse). */
export function Photos({ urls, title, aspect = 'aspect-[16/9]' }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const n = urls?.length || 0;
  const go = (d) => setActive((i) => (i + d + n) % n);
  // Arrow keys browse photos while the enlarged view is open.
  useEffect(() => {
    if (!zoom || n < 2) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setActive((i) => (i + 1) % n);
      if (e.key === 'ArrowLeft') setActive((i) => (i - 1 + n) % n);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom, n]);
  if (!n) return <p className="text-bodySm text-ink-500">No photos uploaded.</p>;
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setZoom(true)} className={cn('group relative block w-full overflow-hidden rounded-md border border-line bg-ink-50', aspect)} aria-label={`Enlarge photo ${active + 1} of ${n}`}>
        <img src={urls[active]} alt={`${title} — photo ${active + 1}`} className="h-full w-full object-cover" />
        <span className="absolute right-2 top-2 rounded-md bg-ink-950/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="num absolute bottom-2 right-2 rounded-full bg-ink-950/60 px-2 py-0.5 text-caption font-semibold text-white">{active + 1} / {n}</span>
      </button>
      <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-pressed={i === active}
            className={cn('h-14 w-20 shrink-0 overflow-hidden rounded-sm border-2', i === active ? 'border-brand-500' : 'border-transparent opacity-80 hover:opacity-100')}
          >
            <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <Modal open={zoom} onClose={() => setZoom(false)} title={`${title} — photo ${active + 1} of ${n}`} size="xl">
        <div className="flex items-center gap-2">
          {n > 1 ? <IconButton icon={ChevronLeft} label="Previous photo" onClick={() => go(-1)} /> : null}
          <img src={urls[active]} alt={`${title} — photo ${active + 1}`} className="mx-auto max-h-[70vh] min-w-0 flex-1 rounded-md object-contain" />
          {n > 1 ? <IconButton icon={ChevronRight} label="Next photo" onClick={() => go(1)} /> : null}
        </div>
      </Modal>
    </div>
  );
}

/** RC / insurance / PUC / fitness with numbers, expiry and a secure "Open" link. */
export function DocumentsTable({ v }) {
  const isEv = v.fuelType === 'electric';
  return (
    <MiniTable
      columns={[
        { key: 'doc', header: 'Document', cell: (d) => <span className="font-semibold text-ink-900">{d.label}</span> },
        { key: 'num', header: 'Number / details', cell: (d) => [d.data?.number, d.key === 'insurance' && d.data?.type ? INSURANCE[d.data.type] : null, d.data?.provider].filter(Boolean).join(' · ') || '—' },
        {
          key: 'exp',
          header: 'Valid until',
          cell: (d) => {
            if (!d.data?.expiry) return '—';
            const expired = new Date(d.data.expiry) < new Date();
            return <span className={cn('whitespace-nowrap', expired && 'font-semibold text-danger-700')}>{dateLong(d.data.expiry)}{expired ? ' · expired' : ''}</span>;
          },
        },
        { key: 'file', header: 'File', cell: (d) => (d.data?.fileId ? <SecureFileLink fileId={d.data.fileId}>Open</SecureFileLink> : <span className="text-ink-400">{d.key === 'puc' && isEv ? 'Not needed (EV)' : 'Not uploaded'}</span>) },
      ]}
      rows={DOCS.map((d) => ({ ...d, id: d.key, data: v.documents?.[d.key] }))}
    />
  );
}

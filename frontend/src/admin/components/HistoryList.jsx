import { dateTime } from '@shared/lib/format.js';
import { REALM_LABEL } from '@/admin/lib/labels.js';
import { humanize } from '@/admin/lib/utils.js';

/** Audit trail rendered as a vertical timeline. items: [{ action, actor: { realm, label }, reason, at }] */
export function HistoryList({ items, empty = 'No recorded activity yet.' }) {
  if (!items?.length) return <p className="text-bodySm text-ink-500">{empty}</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((h, i) => (
        <li key={`${h.action}-${h.at}-${i}`} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ink-300" aria-hidden="true" />
          <p className="text-bodySm font-semibold text-ink-900">{humanize(h.action)}</p>
          <p className="text-caption text-ink-500">
            {dateTime(h.at)} · {REALM_LABEL[h.actor?.realm] || 'System'}
            {h.actor?.label ? ` · ${h.actor.label}` : ''}
          </p>
          {h.reason ? <p className="mt-0.5 text-caption text-ink-700">“{h.reason}”</p> : null}
        </li>
      ))}
    </ol>
  );
}

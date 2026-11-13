import { useState } from 'react';
import { IdCard, ShieldCheck, Ban } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { dateTime, dateLong } from '@shared/lib/format.js';
import { KYC_STATUS } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { errorMessage, fieldErrorMap } from '@/admin/lib/utils.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { StatusPill, Tag } from '@/admin/components/StatusPill.jsx';
import { Button } from '@/admin/components/Button.jsx';
import { Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Textarea } from '@/admin/components/Form.jsx';
import { DocumentUpload } from '@/admin/components/FileUpload.jsx';
import { SecureFileLink } from '@/admin/components/SecureImage.jsx';

const DL_PATTERN = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;
const normalizeDl = (v) => v.toUpperCase().replace(/[\s-]/g, '');

/**
 * Renters may pay without an approved licence. At pickup, staff check the original driving licence,
 * record its number, expiry and a photo here, and only then can the renter start the trip.
 * If the check fails, `onFail` opens the cancel dialog (full or policy refund).
 */
export function DlCheckPanel({ b, onFail }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const dl = b.dlCheck || { status: 'pending' };
  const verified = dl.status === 'verified';
  const pending = !verified && b.status === 'confirmed';
  if (!verified && !pending) return null;
  const manage = can('trips.manage');
  return (
    <Panel title="Driving licence check" actions={verified ? <Tag tone="success">Verified</Tag> : <Tag tone="warning">Pending</Tag>}>
      {verified ? (
        <KeyValue columns={1} items={[
          ['Licence no.', <span className="num">{dl.numberMasked}</span>],
          ['Valid until', dateLong(dl.expiry)],
          ['Verified', dateTime(dl.verifiedAt)],
          dl.photoFileId && can('kyc.review') ? ['Photo', <SecureFileLink fileId={dl.photoFileId}>View licence photo</SecureFileLink>] : null,
          dl.note ? ['Note', dl.note] : null,
        ]} />
      ) : (
        <div className="space-y-2">
          <p className="text-caption text-ink-600">Check the renter’s <strong>original</strong> driving licence before handing over the car. The renter cannot start the trip until it is verified here.</p>
          {b.renter?.kycStatus ? (
            <p className="flex items-center gap-2 text-caption text-ink-500">Uploaded in the app: <StatusPill map={KYC_STATUS} value={b.renter.kycStatus} dot={false} /></p>
          ) : null}
        </div>
      )}
      {manage && b.status === 'confirmed' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant={verified ? 'secondary' : 'primary'} icon={verified ? IdCard : ShieldCheck} onClick={() => setOpen(true)}>{verified ? 'Re-verify licence' : 'Verify licence'}</Button>
          {!verified && can('bookings.manage') ? <Button size="sm" variant="danger-outline" icon={Ban} onClick={onFail}>Check failed – cancel</Button> : null}
        </div>
      ) : null}
      {open ? <DlVerifyDialog b={b} onClose={() => setOpen(false)} /> : null}
    </Panel>
  );
}

function DlVerifyDialog({ b, onClose }) {
  const [f, setF] = useState({ number: '', expiry: '', photo: null, note: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = useAction((body) => api.post(`${ADMIN}/bookings/${b.id}/dl-check`, body), {
    success: 'Driving licence verified — the renter can start the trip',
    invalidate: [['booking', b.id], ['bookings']],
    toastError: false,
    onSuccess: onClose,
  });
  const tripEnd = new Date(b.endAt);
  const submit = () => {
    const next = {};
    const number = normalizeDl(f.number);
    if (!DL_PATTERN.test(number)) next.licenceNumber = 'Enter the 15-character licence number, e.g. MP09 2011 0012345.';
    if (!f.expiry) next.licenceExpiry = 'Enter the expiry date printed on the licence.';
    else if (new Date(`${f.expiry}T23:59:59+05:30`) < tripEnd) next.licenceExpiry = 'The licence expires before the trip ends. Do not hand over the car.';
    if (!f.photo) next.photoFileId = 'Take or upload a photo of the licence.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      { licenceNumber: number, licenceExpiry: `${f.expiry}T23:59:59+05:30`, photoFileId: f.photo.id, ...(f.note.trim() ? { note: f.note.trim() } : {}) },
      { onError: (err) => setErrors({ ...fieldErrorMap(err), form: errorMessage(err) }) },
    );
  };
  return (
    <Modal open onClose={() => !save.isPending && onClose()} title={`Verify driving licence · ${b.ref}`}
      description={`Renter: ${b.renter?.name || 'Renter'}${b.renter?.phone ? ` · ${b.renter.phone}` : ''}. Check the photo and name match the person in front of you.`}
      footer={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" icon={ShieldCheck} loading={save.isPending} onClick={submit}>Mark verified</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Licence number" htmlFor="dl-num" error={errors.licenceNumber} required>
            <Input id="dl-num" value={f.number} onChange={set('number')} maxLength={20} className="num uppercase" placeholder="MP09 2011 0012345" autoComplete="off" />
          </Field>
          <Field label="Valid until" htmlFor="dl-exp" error={errors.licenceExpiry} hint={`Trip ends ${dateLong(b.endAt)}`} required>
            <Input id="dl-exp" type="date" value={f.expiry} onChange={set('expiry')} className="num" />
          </Field>
        </div>
        <DocumentUpload label="Photo of the licence (front)" purpose="kyc_document" value={f.photo} onChange={set('photo')} error={errors.photoFileId} hint="Use the phone camera or upload a scan." />
        <Field label="Note (optional)" htmlFor="dl-note">
          <Textarea id="dl-note" rows={2} value={f.note} onChange={set('note')} maxLength={300} placeholder="e.g. Original seen, name matches Aadhaar" />
        </Field>
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

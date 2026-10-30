import { useState } from 'react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { ID_PROOF } from '@/admin/lib/labels.js';
import { useAction } from '@/admin/lib/hooks.js';
import { errorMessage, fieldErrorMap } from '@/admin/lib/utils.js';
import { Button } from '@/admin/components/Button.jsx';
import { Modal } from '@/admin/components/Modal.jsx';
import { Field, Input, Select, Checkbox } from '@/admin/components/Form.jsx';
import { DocumentUpload, ImageUpload } from '@/admin/components/FileUpload.jsx';

/**
 * Operations upload a host's KYC papers for them (collected at the office) and can approve them in
 * the same step. Replaces any submission still waiting for review.
 */
export function HostKycUploadDialog({ host, open, onClose }) {
  const [f, setF] = useState({ idProofType: 'aadhaar', idProofNumber: '', front: null, back: null, panNumber: '', pan: null, selfie: null, dateOfBirth: '', approve: true });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const save = useAction((body) => api.post(`${ADMIN}/vendors/${host.id}/kyc`, body), {
    success: (_d, b) => (b.approve ? 'KYC uploaded and approved' : 'KYC uploaded — waiting for review'),
    invalidate: [['host', host.id], ['hosts']],
    toastError: false,
    onSuccess: onClose,
  });
  const submit = () => {
    const next = {};
    if (!f.idProofNumber.trim()) next.idProofNumber = 'Enter the ID number.';
    if (!f.front) next.front = 'Upload the front of the ID.';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.panNumber.trim().toUpperCase())) next.panNumber = 'Enter a valid PAN.';
    if (!f.pan) next.pan = 'Upload the PAN card.';
    if (!f.dateOfBirth) next.dateOfBirth = 'Enter the date of birth.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      idProofType: f.idProofType, idProofNumber: f.idProofNumber.trim(), idProofFrontFileId: f.front.id, ...(f.back ? { idProofBackFileId: f.back.id } : {}),
      panNumber: f.panNumber.trim().toUpperCase(), panFileId: f.pan.id, ...(f.selfie ? { selfieFileId: f.selfie.id } : {}), dateOfBirth: f.dateOfBirth, approve: f.approve,
    }, { onError: (err) => setErrors({ ...fieldErrorMap(err), form: errorMessage(err) }) });
  };
  return (
    <Modal open={open} onClose={() => !save.isPending && onClose()} title={`Upload KYC for ${host.businessName || host.name || 'this host'}`} description="Scan or photograph the papers the host gave you. Private files, visible only to permitted admins." size="lg"
      footer={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{f.approve ? 'Upload and approve' : 'Upload'}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ID proof" htmlFor="hk-type"><Select id="hk-type" value={f.idProofType} onChange={set('idProofType')}>{Object.entries(ID_PROOF).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="ID number" htmlFor="hk-num" error={errors.idProofNumber}><Input id="hk-num" value={f.idProofNumber} onChange={set('idProofNumber')} maxLength={20} className="num uppercase" /></Field>
          <DocumentUpload label="ID — front" purpose="kyc_document" value={f.front} onChange={set('front')} error={errors.front} />
          <DocumentUpload label="ID — back (optional)" purpose="kyc_document" value={f.back} onChange={set('back')} />
          <Field label="PAN" htmlFor="hk-pan" error={errors.panNumber}><Input id="hk-pan" value={f.panNumber} onChange={set('panNumber')} maxLength={10} className="num uppercase" /></Field>
          <DocumentUpload label="PAN card" purpose="kyc_document" value={f.pan} onChange={set('pan')} error={errors.pan} />
          <Field label="Date of birth" htmlFor="hk-dob" error={errors.dateOfBirth}><Input id="hk-dob" type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} className="num" /></Field>
        </div>
        <ImageUpload label="Host photo (optional)" purpose="kyc_selfie" value={f.selfie} onChange={set('selfie')} aspect="aspect-square" />
        <Checkbox label="Approve now" description="I have checked the originals: the ID is valid, the photo matches and the host is 18 or older." checked={f.approve} onChange={(e) => setF((x) => ({ ...x, approve: e.target.checked }))} />
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

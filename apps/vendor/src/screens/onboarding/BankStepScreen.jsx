import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Screen, Header, Field, Button, T, Panel, Pill, PhotoTile, Notice, Loading, useUploader, useToast } from '@shared/native';
import { SourceChooser } from '@shared/native/screens';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';

const BANK_STATUS = { pending: { label: 'Verification pending', tone: 'warning' }, verified: { label: 'Verified', tone: 'success' }, rejected: { label: 'Rejected', tone: 'danger' } };

export function BankStepScreen({ navigation }) {
  const { refreshAccount } = useAuth();
  const toast = useToast();
  const uploader = useUploader();
  const bank = useQuery({ queryKey: ['vendor-bank'], queryFn: () => api.get('/api/v1/vendor/me/bank') });
  const [editing, setEditing] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [f, setF] = useState({ accountHolderName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', bankName: '', upiId: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/vendor/me/bank', { ...f, ifsc: f.ifsc.toUpperCase(), upiId: f.upiId.trim() || '', bankName: f.bankName.trim() || undefined, proofFileId: uploader.slots.proof?.fileId }),
    onSuccess: async () => { await Promise.all([refreshAccount(), bank.refetch()]); toast('Bank details saved', 'success'); navigation.goBack(); },
    onError: (e) => { setErrors(e.fieldErrors || {}); if (!e.fieldErrors || !Object.keys(e.fieldErrors).length) toast(e.message, 'danger'); },
  });
  if (bank.isLoading) return <Screen header={<Header title="Bank account" />} scroll={false}><Loading /></Screen>;
  const b = bank.data;
  if (b && !editing) {
    const s = BANK_STATUS[b.verification.status];
    return (
      <Screen header={<Header title="Bank account" />} footer={<Button title="Replace bank account" variant="secondary" block onPress={() => setEditing(true)} />}>
        <Panel className="mt-4">
          <View className="flex-row items-center justify-between"><T variant="headline">{b.bankName || b.ifsc}</T><Pill label={s.label} tone={s.tone} /></View>
          <T variant="body" className="mt-2">{b.accountHolderName}</T>
          <T variant="bodySm" tone="muted">{b.accountNumberMasked} · {b.ifsc}{b.upiId ? ` · ${b.upiId}` : ''}</T>
          {b.verification.reason ? <T variant="caption" tone="danger" className="mt-2">{b.verification.reason}</T> : null}
        </Panel>
        <T variant="caption" tone="subtle" className="mx-4 mt-3">Replacing your account pauses withdrawals until our finance team verifies the new one.</T>
      </Screen>
    );
  }
  const ready = f.accountHolderName.trim().length >= 2 && /^\d{9,18}$/.test(f.accountNumber) && f.accountNumber === f.confirmAccountNumber && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifsc) && uploader.slots.proof?.fileId;
  return (
    <Screen bg="surface" header={<Header title="Bank account" />} footer={<Button title="Save bank details" size="lg" block disabled={!ready || uploader.busy} loading={save.isPending} onPress={() => save.mutate()} />}>
      <View className="px-5 pt-5">
        <Notice tone="info" className="mb-5">Earnings are paid to this account. The holder name should match your ID or company.</Notice>
        <Field label="Account holder name" value={f.accountHolderName} onChangeText={set('accountHolderName')} autoCapitalize="words" error={errors.accountHolderName} />
        <Field label="Account number" value={f.accountNumber} onChangeText={(t) => set('accountNumber')(t.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={18} error={errors.accountNumber} />
        <Field label="Confirm account number" value={f.confirmAccountNumber} onChangeText={(t) => set('confirmAccountNumber')(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={18} error={errors.confirmAccountNumber || (f.confirmAccountNumber && f.confirmAccountNumber !== f.accountNumber ? 'Numbers don’t match' : undefined)} />
        <Field label="IFSC" value={f.ifsc} onChangeText={(t) => set('ifsc')(t.toUpperCase())} autoCapitalize="characters" maxLength={11} error={errors.ifsc} placeholder="HDFC0001234" />
        <Field label="Bank name (optional)" value={f.bankName} onChangeText={set('bankName')} />
        <Field label="UPI ID (optional)" value={f.upiId} onChangeText={set('upiId')} autoCapitalize="none" error={errors.upiId} placeholder="name@bank" />
        <T variant="label" tone="muted" className="mb-2">Cancelled cheque or passbook photo</T>
        <View className="w-1/2"><PhotoTile label="Add photo" source={uploader.slots.proof?.uri ? { uri: uploader.slots.proof.uri } : undefined} state={uploader.slots.proof?.state} error={uploader.slots.proof?.error} onPress={() => setChooser(true)} /></View>
      </View>
      <SourceChooser visible={chooser} onClose={() => setChooser(false)} onPick={(source) => uploader.take('proof', 'bank_proof', { source })} />
    </Screen>
  );
}
